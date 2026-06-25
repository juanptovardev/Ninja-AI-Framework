import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, readDirectory, fileExists } from './reader.js';
import { getFileTree } from './analyzer.js';
import { FsBoundaryError, setWorkspaceRoot } from './boundary.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmdir } from 'node:fs/promises';

describe('reader path boundary (S1.2 WP-A)', () => {
  let root: string;

  beforeEach(async () => {
    // Create a temp workspace root
    root = join(tmpdir(), `ninja-fs-test-${Date.now()}`);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'allowed.txt'), 'hello');
    setWorkspaceRoot(root);
  });

  afterEach(async () => {
    try {
      await rmdir(root, { recursive: true } as Parameters<typeof rmdir>[1]);
    } catch {
      // ignore
    }
    setWorkspaceRoot(process.cwd());
  });

  it('readFile with path outside workspace root → throws FsBoundaryError', async () => {
    const outside = join(tmpdir(), 'outside.txt');
    await writeFile(outside, 'secret');
    await expect(readFile(outside)).rejects.toBeInstanceOf(FsBoundaryError);
  });

  it('readFile with path inside workspace root → succeeds', async () => {
    const content = await readFile(join(root, 'allowed.txt'));
    expect(content).toBe('hello');
  });

  it('getFileTree with path outside workspace root → throws FsBoundaryError', async () => {
    await expect(getFileTree(tmpdir())).rejects.toBeInstanceOf(FsBoundaryError);
  });

  it('readdir with path outside workspace root → throws FsBoundaryError', async () => {
    await expect(readDirectory(tmpdir())).rejects.toBeInstanceOf(FsBoundaryError);
  });

  // S1.2 follow-up: fileExists must enforce boundary too — it leaked existence
  // information of files outside the workspace by calling stat() with the raw path.
  it('fileExists with path outside workspace root → throws FsBoundaryError (no info leak)', async () => {
    const outside = join(tmpdir(), 'outside-existence-probe.txt');
    await writeFile(outside, 'secret');
    await expect(fileExists(outside)).rejects.toBeInstanceOf(FsBoundaryError);
  });

  it('fileExists with path inside workspace root → returns true for existing file', async () => {
    await expect(fileExists(join(root, 'allowed.txt'))).resolves.toBe(true);
  });

  it('fileExists with non-existent path inside workspace root → returns false', async () => {
    await expect(fileExists(join(root, 'does-not-exist.txt'))).resolves.toBe(false);
  });
});
