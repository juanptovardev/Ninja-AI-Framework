import { resolve, sep, normalize } from 'node:path';

export class FsBoundaryError extends Error {
  constructor(
    message: string,
    public code: string = 'PATH_TRAVERSAL'
  ) {
    super(message);
    this.name = 'FsBoundaryError';
  }
}

let workspaceRoot: string | null = null;

export function getWorkspaceRoot(): string {
  if (workspaceRoot) {
    return workspaceRoot;
  }
  return process.cwd();
}

export function setWorkspaceRoot(root: string): void {
  workspaceRoot = root;
}

export function assertWithinBoundary(filePath: string, root?: string): string {
  const boundaryRoot = root ?? getWorkspaceRoot();
  const resolvedPath = normalize(resolve(filePath));
  const normalizedRoot = normalize(boundaryRoot);

  const isWindows = process.platform === 'win32';
  const checkPath = isWindows ? resolvedPath.toLowerCase() : resolvedPath;
  const checkRoot = isWindows ? normalizedRoot.toLowerCase() : normalizedRoot;

  const rootWithSep = (checkRoot.endsWith(sep) ? checkRoot : checkRoot + sep) as string;
  const checkRootWithSep = checkRoot + sep;

  const isWithinBoundary =
    checkPath === checkRoot || checkPath.startsWith(checkRootWithSep);

  if (!isWithinBoundary) {
    throw new FsBoundaryError(
      `Path traversal detected: "${resolvedPath}" is outside workspace root "${boundaryRoot}"`,
      'PATH_TRAVERSAL'
    );
  }

  return resolvedPath;
}
