import { readFile as fsReadFile, readdir, stat, constants } from 'node:fs/promises';
import { resolve, dirname, join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { eventBus, createEvent } from '@ninja/events';
import type { NinjaEvent } from '@ninja/contracts';
import { assertWithinBoundary } from './boundary.js';

// Types
export interface FileMetadata {
  path: string;
  name: string;
  extension?: string;
  size: number;
  lastModified: Date;
  isDirectory: boolean;
}

export interface FileTreeNode {
  name: string;
  path: string;
  children?: FileTreeNode[];
}

// Errors
export class FsReadError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'FsReadError';
  }
}

// Main functions
export async function readFile(path: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
  const safePath = assertWithinBoundary(path);
  try {
    return await fsReadFile(safePath, encoding);
  } catch (error) {
    throw new FsReadError(`Failed to read file: ${path}`, (error as Error).name);
  }
}

export async function readFileLines(path: string): Promise<string[]> {
  try {
    const content = await readFile(path, 'utf8');
    return content.split(/\r?\n/).filter((line) => line.trim() !== '');
  } catch (error) {
    throw new FsReadError(`Failed to read file lines: ${path}`, (error as Error).name);
  }
}

export async function fileExists(path: string): Promise<boolean> {
  const safePath = assertWithinBoundary(path);
  try {
    await stat(safePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export async function readDirectory(path: string): Promise<string[]> {
  const safePath = assertWithinBoundary(path);
  try {
    return await readdir(safePath);
  } catch (error) {
    throw new FsReadError(`Failed to read directory: ${path}`, (error as Error).name);
  }
}
