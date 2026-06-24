import { executeCommand, type ShellCommand, type ShellResult } from '@ninja/integrations-shell';
import { createLogger } from '@ninja/logging';
import { eventBus, createEvent } from '@ninja/events';

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}

export class GitNotAvailableError extends GitError {
  constructor() {
    super('Git is not available in PATH');
    this.name = 'GitNotAvailableError';
  }
}

export class GitRepoNotFoundError extends GitError {
  constructor(repoPath: string) {
    super(`Git repository not found at: ${repoPath}`);
    this.name = 'GitRepoNotFoundError';
  }
}

export class GitCommandFailedError extends GitError {
  constructor(command: string, stderr: string) {
    super(`Git command failed: ${command}\n${stderr}`);
    this.name = 'GitCommandFailedError';
  }
}

export class GitOperationBlockedError extends GitError {
  constructor(operation: string) {
    super(`Git operation blocked: ${operation}`);
    this.name = 'GitOperationBlockedError';
  }
}

export class GitParseError extends GitError {
  constructor(output: string, parser: string) {
    super(`Failed to parse git output for ${parser}: ${output.substring(0, 200)}`);
    this.name = 'GitParseError';
  }
}

// ---------------------------------------------------------------------------
// Git Client
// ---------------------------------------------------------------------------

const logger = createLogger('git');

export class GitClient {
  private readonly repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  getRepoPath(): string {
    return this.repoPath;
  }

  // Make run method public so it can be accessed by other modules
  async run(args: string[], timeoutMs = 60000): Promise<ShellResult> {
    const command: ShellCommand = {
      cmd: 'git',
      args,
      cwd: this.repoPath,
      timeout: timeoutMs,
      env: {
        GIT_TERMINAL_PROMPT: '0',
        GIT_PAGER: '',
        LANG: 'C.UTF-8',
        LC_ALL: 'C.UTF-8',
      },
    };

    logger.debug(`Running git command: git ${args.join(' ')}`, { repoPath: this.repoPath });

    try {
      const result = await executeCommand(command);

      if (result.exitCode !== 0) {
        throw new GitCommandFailedError(`git ${args.join(' ')}`, result.stderr);
      }

      return result;
    } catch (error) {
      if (error instanceof GitCommandFailedError) {
        throw error;
      }
      throw new GitError(`Failed to execute git command: ${(error as Error).message}`);
    }
  }

  async isGitAvailable(): Promise<boolean> {
    try {
      const result = await executeCommand({
        cmd: 'git',
        args: ['--version'],
        timeout: 5000,
      });
      return result.exitCode === 0 && result.stdout.includes('git version');
    } catch {
      return false;
    }
  }

  async isGitRepo(): Promise<boolean> {
    try {
      const result = await this.run(['rev-parse', '--git-dir']);
      return result.exitCode === 0;
    } catch (error) {
      if (error instanceof GitCommandFailedError) {
        return false;
      }
      throw error;
    }
  }

  async verifyGitRepo(): Promise<void> {
    const [gitAvailable, isRepo] = await Promise.all([this.isGitAvailable(), this.isGitRepo()]);

    if (!gitAvailable) {
      throw new GitNotAvailableError();
    }

    if (!isRepo) {
      throw new GitRepoNotFoundError(this.repoPath);
    }
  }

  async runWithVerification(args: string[], timeoutMs = 60000): Promise<ShellResult> {
    await this.verifyGitRepo();
    return this.run(args, timeoutMs);
  }

  // Helper method for status parsing
  protected parsePorcelainLines(output: string): Array<{ status: string; path: string }> {
    const lines = output
      .trim()
      .split('\n')
      .filter((line) => line.trim());
    const parsed: Array<{ status: string; path: string }> = [];

    for (const line of lines) {
      if (line.length < 3) continue;

      const status = line.substring(0, 2).trim();
      const path = line.substring(3).trim();

      if (path) {
        parsed.push({ status, path });
      }
    }

    return parsed;
  }

  // Helper method for log parsing
  protected parseLogOutput(output: string, format: string): Array<Record<string, string>> {
    const lines = output
      .trim()
      .split('\n')
      .filter((line) => line.trim());
    const parsed: Array<Record<string, string>> = [];

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length !== format.split('|').length) continue;

      const entry: Record<string, string> = {};
      const keys = format.split('|');

      for (let i = 0; i < keys.length; i++) {
        entry[keys[i]] = parts[i]?.trim() || '';
      }

      parsed.push(entry);
    }

    return parsed;
  }
}
