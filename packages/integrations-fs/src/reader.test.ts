import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, readDirectory } from './reader.js';
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
});
