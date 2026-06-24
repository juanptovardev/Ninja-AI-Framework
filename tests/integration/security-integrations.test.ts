import { describe, it, expect } from 'vitest';
import { validateCommand } from '@ninja/integrations-shell';
import * as gitExports from '@ninja/integrations-git';
import { writeFile, FsBoundaryError } from '@ninja/integrations-fs';
import { httpRequest, NinjaHttpError } from '@ninja/integrations-http';
import { ApprovalManager } from '@ninja/sentinel';
import { PolicyEngine } from '@ninja/sentinel';
import type { ApprovalRequestedPayload } from '@ninja/sentinel';
import type { ID } from '@ninja/contracts';
import { MockEventBus } from '../helpers';
import { resolve, join } from 'node:path';
import { mkdir, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import type { Logger } from '@ninja/logging';

function createMockLogger(): Logger {
  return {
    name: 'test-security',
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

async function createTempDir(): Promise<string> {
  const dir = join(tmpdir(), `ninja-sec-test-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

describe('Security Integrations', () => {
  describe('Shell Sandbox', () => {
    it('blocks "rm -rf /"', () => {
      const result = validateCommand({ cmd: 'rm', args: ['-rf', '/'], cwd: '/tmp' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('blocks "format C:"', () => {
      const result = validateCommand({ cmd: 'format', args: ['C:'], cwd: process.cwd() });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('blocks "shutdown"', () => {
      const result = validateCommand({ cmd: 'shutdown', args: [], cwd: process.cwd() });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('allows "echo hello"', () => {
      const result = validateCommand({ cmd: 'echo', args: ['hello'], cwd: process.cwd() });
      expect(result.allowed).toBe(true);
    });

    it('allows "git status"', () => {
      const result = validateCommand({ cmd: 'git', args: ['status'], cwd: process.cwd() });
      expect(result.allowed).toBe(true);
    });

    it('allows "echo hello" on Windows (shell builtin)', () => {
      const result = validateCommand({ cmd: 'echo', args: ['hello'], cwd: process.cwd() });
      expect(result.allowed).toBe(true);
    });

    it('blocks shell metacharacters on Windows', () => {
      const result = validateCommand({
        cmd: 'echo',
        args: ['hello', '&&', 'rm', '-rf', '/'],
        cwd: process.cwd(),
      });
      if (process.platform === 'win32') {
        expect(result.allowed).toBe(false);
      }
    });
  });

  describe('Git Operations Security', () => {
    it('does not expose push in public API', () => {
      const exportedKeys = Object.keys(gitExports) as string[];
      const pushLike = exportedKeys.filter((k) => k.toLowerCase().includes('push'));
      expect(pushLike).toHaveLength(0);
    });
  });

  describe('FS Writer Path Boundary', () => {
    it('validates path does not leave workspace', async () => {
      const baseDir = await createTempDir();
      const outsidePath = resolve(baseDir, '..', `outside-${randomUUID()}.txt`);

      try {
        await expect(
          writeFile(outsidePath, 'test-content', { root: baseDir })
        ).rejects.toThrow(FsBoundaryError);
      } finally {
        await rm(outsidePath, { force: true }).catch(() => {});
        await rm(baseDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it('allows writing inside workspace root', async () => {
      const baseDir = await createTempDir();
      const insidePath = join(baseDir, 'test.txt');

      try {
        await writeFile(insidePath, 'test-content', { root: baseDir });
        const fileStat = await stat(insidePath);
        expect(fileStat.isFile()).toBe(true);
      } finally {
        await rm(insidePath, { force: true }).catch(() => {});
        await rm(baseDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it('blocks path traversal with ..', async () => {
      const baseDir = await createTempDir();
      const traversalPath = join(baseDir, '..', 'traversal-test.txt');

      try {
        await expect(
          writeFile(traversalPath, 'test-content', { root: baseDir })
        ).rejects.toThrow(FsBoundaryError);
      } finally {
        await rm(traversalPath, { force: true }).catch(() => {});
        await rm(baseDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it('blocks path traversal with absolute path outside root', async () => {
      const baseDir = await createTempDir();
      const outsidePath = join(tmpdir(), `outside-${randomUUID()}.txt`);

      try {
        await expect(
          writeFile(outsidePath, 'test-content', { root: baseDir })
        ).rejects.toThrow(FsBoundaryError);
      } finally {
        await rm(outsidePath, { force: true }).catch(() => {});
        await rm(baseDir, { recursive: true, force: true }).catch(() => {});
      }
    });
  });

  describe('HTTP Client Secret Handling', () => {
    it('handles 401/403 without leaking secrets', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () =>
          new Response(JSON.stringify({ error: 'Invalid API key' }), {
            status: 401,
            statusText: 'Unauthorized',
            headers: { 'content-type': 'application/json' },
          });

        const requestSecret = 'Bearer sk-test-secret-key';
        const promise = httpRequest({
          url: 'https://api.example.com/secure-data',
          method: 'GET',
          headers: { Authorization: requestSecret },
        });

        await expect(promise).rejects.toThrow(NinjaHttpError);

        try {
          await promise;
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(NinjaHttpError);
          if (error instanceof NinjaHttpError) {
            expect(error.status).toBe(401);
            expect(error.message).not.toContain('sk-test-secret-key');
          }
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Sentinel Approvals', () => {
    it('requires double confirmation (technical + friendly)', async () => {
      const eventBus = new MockEventBus();
      const logger = createMockLogger();
      const policyEngine = new PolicyEngine(logger);
      const approvalManager = new ApprovalManager(eventBus, logger);

      const runId = randomUUID() as ID;
      const agentId = randomUUID() as ID;

      const approvalPromise = approvalManager.createApprovalRequest({
        runId,
        agentId,
        actionType: 'shell.execute',
        actionSummary: 'Delete all project files',
        technicalDetails: 'rm -rf / removes all files from root filesystem irreversibly',
        policyId: 'shell-execute-require-approval' as ID,
      });

      const requestedEvents = eventBus.getEvents('sentinel.approval.requested');
      expect(requestedEvents).toHaveLength(1);

      const payload = requestedEvents[0].payload as ApprovalRequestedPayload;
      expect(payload.actionSummary).toBe('Delete all project files');
      expect(payload.technicalDetails).toContain('rm -rf /');

      await approvalManager.approveRequest(payload.approvalId, { id: 'admin-user', role: 'admin' });

      const result = await approvalPromise;
      expect(result.approved).toBe(true);
      expect(result.respondedAt).toBeDefined();
    });
  });
});
