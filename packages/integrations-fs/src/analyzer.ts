import { stat, readdir } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { eventBus, createEvent } from '@ninja/events';
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

// Main functions
export async function getMetadata(path: string): Promise<FileMetadata> {
  try {
    const stats = await stat(path);
    const extension = extname(path);

    return {
      path,
      name: path.split('/').pop() || path.split('\\').pop() || '',
      extension: extension ? extension.slice(1) : undefined,
      size: stats.size,
      lastModified: stats.mtime,
      isDirectory: stats.isDirectory(),
    };
  } catch (error) {
    throw new Error(`Failed to get metadata for: ${path}`);
  }
}

export async function scanDirectory(path: string, depth?: number): Promise<FileMetadata[]> {
  const maxDepth = depth !== undefined ? depth : 3;

  async function scanRecursive(currentPath: string, currentDepth: number): Promise<FileMetadata[]> {
    if (currentDepth > maxDepth) {
      return [];
    }

    try {
      const entries = await readdir(currentPath, { withFileTypes: true });
      const metadata: FileMetadata[] = [];

      for (const entry of entries) {
        const entryPath = join(currentPath, entry.name);
        const meta = await getMetadata(entryPath);
        metadata.push(meta);

        if (entry.isDirectory() && currentDepth < maxDepth) {
          const subDirMetadata = await scanRecursive(entryPath, currentDepth + 1);
          metadata.push(...subDirMetadata);
        }
      }

      return metadata;
    } catch (error) {
      throw new Error(`Failed to scan directory: ${currentPath}`);
    }
  }

  try {
    const result = await scanRecursive(path, 0);

    // Emit event
    eventBus.emit(
      createEvent('fs.scan.completed', 'fs', {
        path,
        fileCount: result.length,
        duration: 0, // In a real implementation, we would measure this
      })
    );

    return result;
  } catch (error) {
    throw new Error(`Failed to scan directory: ${path}`);
  }
}

export async function getFileTree(path: string): Promise<FileTreeNode> {
  assertWithinBoundary(path);
  const maxDepth = 3;

  async function buildTree(currentPath: string, currentDepth: number): Promise<FileTreeNode> {
    if (currentDepth > maxDepth) {
      return { name: getCurrentName(currentPath), path: currentPath };
    }

    try {
      const stats = await stat(currentPath);
      const name = getCurrentName(currentPath);

      if (stats.isDirectory() && currentDepth < maxDepth) {
        const entries = await readdir(currentPath, { withFileTypes: true });
        const children: FileTreeNode[] = [];

        for (const entry of entries) {
          const entryPath = join(currentPath, entry.name);
          const childNode = await buildTree(entryPath, currentDepth + 1);
          children.push(childNode);
        }

        return { name, path: currentPath, children };
      } else {
        return { name, path: currentPath };
      }
    } catch (error) {
      throw new Error(`Failed to get file tree for: ${currentPath}`);
    }
  }

  function getCurrentName(path: string): string {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || '';
  }

  return await buildTree(path, 0);
}
