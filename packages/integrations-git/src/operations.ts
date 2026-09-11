import { GitClient, GitOperationBlockedError } from './git-client.js';
import { eventBus, createEvent } from '@ninja/events';
import { NinjaError, ErrorCodes } from '@ninja/contracts';

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Stage files for commit
 * @param client Git client instance
 * @param files Files to stage. If undefined, stages all changes
 */
export async function stage(client: GitClient, files?: string[]): Promise<void> {
  await client.verifyGitRepo();

  const args = ['add'];
  if (files && files.length > 0) {
    args.push(...files);
  } else {
    args.push('.');
  }

  await client.runWithVerification(args);
}

/**
 * Commit staged changes
 * @param client Git client instance
 * @param message Commit message (required)
 */
export async function commit(client: GitClient, message: string): Promise<void> {
  if (!message || message.trim() === '') {
    throw new NinjaError(
      ErrorCodes.GIT_COMMIT_MESSAGE_REQUIRED,
      'Commit message is required',
      'runtime'
    );
  }

  await client.verifyGitRepo();

  // First check if there's anything to commit
  const statusResult = await client.runWithVerification(['status', '--porcelain']);
  if (statusResult.stdout.trim() === '') {
    // Nothing to commit
    return;
  }

  // Commit staged changes
  const result = await client.runWithVerification(['commit', '-m', message]);

  // Extract commit hash from output
  const hashMatch = result.stdout.match(/(\w{7,40})/);
  const hash = hashMatch ? hashMatch[1] : 'unknown';

  // Emit commit event
  eventBus.emit(
    createEvent('git.commit.created', 'git', {
      repoPath: client.getRepoPath(),
      message,
      hash,
    })
  );
}

/**
 * Checkout to a different branch
 * @param client Git client instance
 * @param branch Branch name to checkout to
 */
export async function checkout(client: GitClient, branch: string): Promise<void> {
  await client.verifyGitRepo();

  // Validate branch name
  if (!branch || branch.trim() === '') {
    throw new NinjaError(ErrorCodes.GIT_BRANCH_NAME_REQUIRED, 'Branch name is required', 'runtime');
  }

  // Prevent dangerous operations
  if (branch.includes('..') || branch.includes('~') || branch.includes('^')) {
    throw new NinjaError(ErrorCodes.GIT_INVALID_BRANCH_NAME, 'Invalid branch name', 'runtime');
  }

  await client.runWithVerification(['checkout', branch]);
}

/**
 * Pull changes from remote repository
 * @param client Git client instance
 */
export async function pull(client: GitClient): Promise<void> {
  await client.verifyGitRepo();

  // Check if we're on a branch
  const branchResult = await client.run(['branch', '--show-current']);
  if (!branchResult.stdout.trim()) {
    throw new NinjaError(ErrorCodes.GIT_NOT_ON_BRANCH, 'Cannot pull: not on a branch', 'runtime');
  }

  await client.runWithVerification(['pull'], 120000); // 2 minute timeout for pull
}

/**
 * Get list of all branches
 * @param client Git client instance
 */
export async function getBranches(client: GitClient): Promise<string[]> {
  await client.verifyGitRepo();

  const result = await client.runWithVerification(['branch', '--format=%(refname:short)']);
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => (line.startsWith('* ') ? line.substring(2) : line));
}

/**
 * Get current working directory status
 * @param client Git client instance
 */
export async function getWorkingDirectoryStatus(client: GitClient): Promise<{
  clean: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
}> {
  await client.verifyGitRepo();

  // Get status in porcelain format
  const result = await client.runWithVerification(['status', '--porcelain']);
  const lines = result.stdout.split('\n').filter((line) => line.trim());

  let staged = 0;
  let unstaged = 0;
  let untracked = 0;

  for (const line of lines) {
    if (line.startsWith('??')) {
      untracked++;
    } else if (line.startsWith(' M') || line.startsWith(' D') || line.startsWith(' A')) {
      unstaged++;
    } else if (line.startsWith('M ') || line.startsWith('D ') || line.startsWith('A ')) {
      staged++;
    }
  }

  return {
    clean: lines.length === 0,
    staged,
    unstaged,
    untracked,
  };
}
