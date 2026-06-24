import { GitClient } from './git-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GitFileStatus = 'M' | 'A' | 'D' | '?' | 'R' | 'C' | 'U';

export interface GitChangedFile {
  /** Path to the file */
  path: string;
  /** Status of the file */
  status: GitFileStatus;
  /** Whether the file is staged */
  staged: boolean;
}

export interface GitStatus {
  /** Current branch name */
  branch: string;
  /** Staged files */
  staged: GitChangedFile[];
  /** Unstaged files */
  unstaged: GitChangedFile[];
  /** Untracked files */
  untracked: GitChangedFile[];
  /** Number of commits ahead of remote */
  ahead: number;
  /** Number of commits behind remote */
  behind: number;
}

export interface GitCommit {
  /** Full commit hash */
  hash: string;
  /** Short commit hash (7 characters) */
  shortHash: string;
  /** Commit message */
  message: string;
  /** Author name */
  author: string;
  /** Author email */
  email: string;
  /** Commit date */
  date: Date;
  /** Whether this is a merge commit */
  isMerge: boolean;
}

// ---------------------------------------------------------------------------
// Status Functions
// ---------------------------------------------------------------------------

/**
 * Get the current git status for the repository
 */
export async function getStatus(client: GitClient): Promise<GitStatus> {
  await client.verifyGitRepo();

  // Get branch info
  const branch = await getBranch(client);

  // Get status in porcelain format for easy parsing
  const result = await client.runWithVerification(['status', '--porcelain=v1', '--branch']);

  const lines = result.stdout.split('\n').filter((line) => line.trim());
  const staged: GitChangedFile[] = [];
  const unstaged: GitChangedFile[] = [];
  const untracked: GitChangedFile[] = [];

  let ahead = 0;
  let behind = 0;

  // Parse branch info line (## branchname...origin/branchname [ahead N, behind M])
  const branchLine = lines.find((line) => line.startsWith('## '));
  if (branchLine) {
    const aheadMatch = branchLine.match(/\[ahead (\d+)/);
    const behindMatch = branchLine.match(/behind (\d+)\]/);

    if (aheadMatch) {
      ahead = parseInt(aheadMatch[1], 10);
    }

    if (behindMatch) {
      behind = parseInt(behindMatch[1], 10);
    }
  }

  // Parse file status lines
  for (const line of lines) {
    if (line.startsWith('## ')) continue; // Skip branch info line
    if (!line.trim()) continue;

    const status = line.substring(0, 2);
    const path = line.substring(3).trim();

    if (!path) continue;

    // Check if staged (X is not space)
    const isStaged = status[0] !== ' ' && status[0] !== '?';
    const fileStatus =
      status[0] === '?' ? '?' : status[1] === ' ' || status[1] === '' ? status[0] : status[1];

    const changedFile: GitChangedFile = {
      path,
      status: fileStatus as GitFileStatus,
      staged: isStaged,
    };

    if (status[0] === '?' && status[1] === '?') {
      untracked.push(changedFile);
    } else if (isStaged) {
      staged.push(changedFile);
    } else {
      unstaged.push(changedFile);
    }
  }

  return {
    branch,
    staged,
    unstaged,
    untracked,
    ahead,
    behind,
  };
}

/**
 * Get the current branch name
 */
export async function getBranch(client: GitClient): Promise<string> {
  const result = await client.runWithVerification(['branch', '--show-current']);
  return result.stdout.trim();
}

/**
 * Get list of changed files
 */
export async function getChangedFiles(client: GitClient): Promise<GitChangedFile[]> {
  const result = await client.runWithVerification(['status', '--porcelain=v1']);
  const lines = result.stdout.split('\n').filter((line) => line.trim());
  const changedFiles: GitChangedFile[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const status = line.substring(0, 2);
    const path = line.substring(3).trim();

    if (!path) continue;

    // Check if staged (X is not space)
    const isStaged = status[0] !== ' ' && status[0] !== '?';
    const fileStatus =
      status[0] === '?' ? '?' : status[1] === ' ' || status[1] === '' ? status[0] : status[1];

    changedFiles.push({
      path,
      status: fileStatus as GitFileStatus,
      staged: isStaged,
    });
  }

  return changedFiles;
}

/**
 * Get git commit history
 */
export async function getLog(client: GitClient, limit = 10): Promise<GitCommit[]> {
  // Use a format that's easy to parse
  const format = '%H_NINJA_%h_NINJA_%an_NINJA_%ae_NINJA_%ad_NINJA_%s_NINJA_%p';
  const result = await client.runWithVerification([
    'log',
    `--max-count=${limit}`,
    `--pretty=format:${format}`,
    '--date=iso',
  ]);

  const lines = result.stdout.split('\n').filter((line) => line.trim());
  const commits: GitCommit[] = [];

  for (const line of lines) {
    const parts = line.split('_NINJA_');
    if (parts.length < 6) continue;

    const [hash, shortHash, author, email, dateStr, ...messageParts] = parts;

    const message = messageParts.join('_NINJA_');
    const date = new Date(dateStr);
    const isMerge = parts.length > 6 && parts[6] !== undefined && parts[6].includes(' ');

    commits.push({
      hash,
      shortHash,
      message,
      author,
      email,
      date,
      isMerge,
    });
  }

  return commits;
}
