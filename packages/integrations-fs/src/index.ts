export {
  readFile,
  readFileLines,
  fileExists,
  readDirectory,
  FileMetadata as ReaderFileMetadata,
} from './reader';

export { writeFile, appendFile, ensureDirectory, deleteFile, FsWriteError } from './writer';

export { FileMetadata, FileTreeNode, getMetadata, scanDirectory, getFileTree } from './analyzer';

export {
  assertWithinBoundary,
  FsBoundaryError,
  getWorkspaceRoot,
  setWorkspaceRoot,
} from './boundary';
