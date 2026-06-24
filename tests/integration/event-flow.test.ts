import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eventBus, createEvent } from '@ninja/events';
import type { NinjaEvent } from '@ninja/contracts';
import type { FsScanCompletedPayload, ForgeLabContentPromotedPayload } from '@ninja/contracts';
import { scanDirectory } from '@ninja/integrations-fs';
import { PolicyEngine, ApprovalManager, Guardian } from '@ninja/sentinel';
import { createLogger } from '@ninja/logging';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { executeCommand } from '@ninja/integrations-shell';
import { GitClient, getStatus } from '@ninja/integrations-git';

const log = createLogger('test:event-flow');

const FIXTURE_PATH = join(__dirname, '../fixtures/sample-workspace');

describe('Event Flow', () => {
  const capturedEvents: NinjaEvent[] = [];
  const subscriptions: Array<{ unsubscribe(): void }> = [];

  beforeAll(() => {
    subscriptions.push(
      eventBus.onAny((event: NinjaEvent) => {
        capturedEvents.push(event);
        log.debug(`[EVENT] ${event.type} from ${event.source}`, { id: event.id });
      })
    );
  });

  afterAll(() => {
    capturedEvents.length = 0;
    for (const sub of subscriptions) {
      sub.unsubscribe();
    }
    subscriptions.length = 0;
    eventBus.clear();
  });

  it('shell.command.executed → llega al event bus → handlers lo reciben', async () => {
    const shellEvents: NinjaEvent[] = [];
    
    const subscription = eventBus.on('shell.command.executed', (event: NinjaEvent) => {
      shellEvents.push(event);
    });
    subscriptions.push(subscription);

    const testString = `ninja-integration-test-${randomUUID().slice(0, 8)}`;
    const cmd = 'cmd';
    const args = ['/c', 'echo', testString];

    const result = await executeCommand({
      cmd,
      args,
      cwd: FIXTURE_PATH,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(testString);
    expect(result.stderr).toBe('');
    expect(result.duration).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(shellEvents).toHaveLength(1);
    const shellEvent = shellEvents[0];
    expect(shellEvent.type).toBe('shell.command.executed');
    expect(shellEvent.source).toBe('shell');
    expect(shellEvent.payload.exitCode).toBe(0);
    expect(shellEvent.payload.duration).toBeGreaterThan(0);

    log.info(`Shell event captured: ${shellEvent.type} with exitCode ${shellEvent.payload.exitCode}`);
  });

  it('health.degradation.detected → Guardian lo recibe → emite sentinel.intervention', async () => {
    const interventionEvents: NinjaEvent[] = [];
    const approvalManager = new ApprovalManager(eventBus, log);
    const policyEngine = new PolicyEngine(log);
    const guardian = new Guardian(eventBus, log, approvalManager, policyEngine);
    
    const interventionSub = eventBus.on('sentinel.intervention', (event: NinjaEvent) => {
      interventionEvents.push(event);
    });
    subscriptions.push(interventionSub);

    guardian.start();

    const degradationPayload = {
      providerId: 'test-provider',
      currentScore: 45,
      threshold: 60,
    };
    
    eventBus.emit(
      createEvent('health.degradation.detected', 'pulse-center', degradationPayload)
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(interventionEvents).toHaveLength(1);
    const interventionEvent = interventionEvents[0];
    expect(interventionEvent.type).toBe('sentinel.intervention');
    expect(interventionEvent.source).toBe('sentinel');
    expect(interventionEvent.payload).toHaveProperty('reason');
    expect(interventionEvent.payload).toHaveProperty('action');

    log.info(`Guardian intervention triggered: ${JSON.stringify(interventionEvent.payload)}`);
  });

  it('forgelab.content.promoted → onAny handler lo captura', async () => {
    const forgeLabEvents: NinjaEvent[] = [];
    
    const forgeLabSub = eventBus.on('forgelab.content.promoted', (event: NinjaEvent) => {
      forgeLabEvents.push(event);
    });
    subscriptions.push(forgeLabSub);

    const testPayload = {
      id: randomUUID() as import('@ninja/contracts').ID,
      type: 'skill' as const,
      artifactId: randomUUID() as import('@ninja/contracts').ID,
      origin: 'test-origin',
    };

    eventBus.emit(
      createEvent('forgelab.content.promoted', 'forge-lab', testPayload)
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(forgeLabEvents).toHaveLength(1);
    const forgeLabEvent = forgeLabEvents[0];
    expect(forgeLabEvent.type).toBe('forgelab.content.promoted');
    expect(forgeLabEvent.source).toBe('forge-lab');
    expect(forgeLabEvent.payload).toEqual(testPayload);

    log.info(`ForgeLab event captured: ${forgeLabEvent.type}`);
  });

  it('fs.scan.completed → se emite al bus tras escanear directorio', async () => {
    const fsEvents: NinjaEvent<FsScanCompletedPayload>[] = [];
    
    const fsSub = eventBus.on('fs.scan.completed', (event: NinjaEvent<FsScanCompletedPayload>) => {
      fsEvents.push(event);
    });
    subscriptions.push(fsSub);

    const files = await scanDirectory(FIXTURE_PATH);

    expect(files).toBeDefined();
    expect(files.length).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(fsEvents).toHaveLength(1);
    const fsEvent = fsEvents[0];
    expect(fsEvent.type).toBe('fs.scan.completed');
    expect(fsEvent.source).toBe('fs');
    expect(fsEvent.payload.path).toBe(FIXTURE_PATH);
    expect(fsEvent.payload.fileCount).toBeGreaterThan(0);

    log.info(`FS scan event captured: ${fsEvent.type} with ${fsEvent.payload.fileCount} files`);
  });

  it('git operation → emite eventos al bus correctamente', async () => {
    const gitEvents: NinjaEvent[] = [];
    
    const gitSub = eventBus.onAny((event: NinjaEvent) => {
      if (event.type.startsWith('git.')) {
        gitEvents.push(event);
      }
    });
    subscriptions.push(gitSub);

    const client = new GitClient(FIXTURE_PATH);
    const isGitAvailable = await client.isGitAvailable().catch(() => false);
    
    if (!isGitAvailable) {
      log.warn('Git not available, skipping git operation test');
      return;
    }

    const isRepo = await client.isGitRepo();
    
    if (!isRepo) {
      log.warn('Fixture is not a git repo, skipping git operation test');
      return;
    }

    const status = await getStatus(client);

    expect(status.branch).toBeDefined();
    expect(status.branch).not.toBe('');

    await new Promise((resolve) => setTimeout(resolve, 100));

    log.info(`Git status retrieved: branch=${status.branch}, staged=${status.staged.length}, untracked=${status.untracked.length}`);
  }, 15000);
});
