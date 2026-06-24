import {
  writeFile as fsWriteFile,
  appendFile as fsAppendFile,
  mkdir,
  unlink,
  rename,
  stat,
  access,
} from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { eventBus, createEvent } from '@ninja/events';
import { assertWithinBoundary, FsBoundaryError as BoundaryError } from './boundary.js';

export class FsWriteError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'FsWriteError';
  }
}

export interface FsWriteOptions {
  root?: string;
}

export async function writeFile(
  path: string,
  content: string,
  opts?: FsWriteOptions
): Promise<void> {
  const safePath = assertWithinBoundary(path, opts?.root);
  const tempPath = `${safePath}.tmp.${randomUUID()}`;

  try {
    await ensureDirectory(dirname(safePath), opts);

    await fsWriteFile(tempPath, content, 'utf8');

    await rename(tempPath, safePath);

    eventBus.emit(
      createEvent('fs.file.written', 'fs', {
        path: safePath,
        size: content.length,
      })
    );
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    throw new FsWriteError(`Failed to write file atomically: ${safePath}`, (error as Error).name);
  }
}

export async function appendFile(
  path: string,
  content: string,
  opts?: FsWriteOptions
): Promise<void> {
  const safePath = assertWithinBoundary(path, opts?.root);
  try {
    await fsAppendFile(safePath, content, 'utf8');
  } catch (error) {
    throw new FsWriteError(`Failed to append to file: ${safePath}`, (error as Error).name);
  }
}

export async function ensureDirectory(
  path: string,
  opts?: FsWriteOptions
): Promise<void> {
  const safePath = assertWithinBoundary(path, opts?.root);
  try {
    await mkdir(safePath, { recursive: true });
  } catch (error) {
    throw new FsWriteError(`Failed to ensure directory: ${safePath}`, (error as Error).name);
  }
}

export async function deleteFile(
  path: string,
  opts?: FsWriteOptions
): Promise<void> {
  const safePath = assertWithinBoundary(path, opts?.root);
  try {
    await access(safePath);
    await unlink(safePath);

    eventBus.emit(
      createEvent('fs.file.deleted', 'fs', {
        path: safePath,
      })
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw new FsWriteError(`Failed to delete file: ${safePath}`, (error as Error).name);
  }
}
