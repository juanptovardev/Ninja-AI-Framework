import { test, expect } from '@playwright/test';
import { runtimeAuthHeaders } from './helpers/e2e-utils';

const RUNTIME_URL = 'http://localhost:3141';

interface ShellExecuteBody {
  cmd: string;
  args: string[];
  cwd?: string;
}

interface ShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

interface GitStatusResponse {
  rawStatus: string;
}

interface FileMetadata {
  path: string;
  name: string;
  extension?: string;
  size: number;
  lastModified: string;
  isDirectory: boolean;
}

test.describe('Runtime API Endpoints', () => {
  test('POST /api/shell/execute with echo hello returns exitCode 0', async ({ request }) => {
    const body: ShellExecuteBody = { cmd: 'echo', args: ['hello'] };

    const response = await request.post(`${RUNTIME_URL}/api/shell/execute`, {
      data: body,
      headers: runtimeAuthHeaders(),
    });
    expect(response.status()).toBe(200);

    const result: ShellResult = await response.json();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
  });

  test('POST /api/shell/execute with rm -rf / is blocked by Sandbox', async ({ request }) => {
    const body: ShellExecuteBody = { cmd: 'rm', args: ['-rf', '/'] };

    const response = await request.post(`${RUNTIME_URL}/api/shell/execute`, {
      data: body,
      headers: runtimeAuthHeaders(),
    });
    expect(response.status()).toBe(403);

    const result = await response.json();
    expect(result).toHaveProperty('error');
    expect(typeof result.error).toBe('string');
    expect(result.error.length).toBeGreaterThan(0);
  });

  test('GET /api/git/status returns branch info', async ({ request }) => {
    const response = await request.get(`${RUNTIME_URL}/api/git/status`, {
      headers: runtimeAuthHeaders(),
    });

    if (response.status() === 200) {
      const body: GitStatusResponse = await response.json();
      expect(typeof body.rawStatus).toBe('string');
      expect(body.rawStatus.length).toBeGreaterThan(0);
      return;
    }

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('GET /api/fs/scan returns file data with count greater than 0', async ({ request }) => {
    const response = await request.get(`${RUNTIME_URL}/api/fs/scan`, {
      headers: runtimeAuthHeaders(),
    });
    expect(response.status()).toBe(200);

    const body: FileMetadata[] = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);

    const first: FileMetadata = body[0];
    expect(first).toHaveProperty('path');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('isDirectory');
  });
});
