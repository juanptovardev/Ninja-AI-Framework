import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eventBus } from '@ninja/events';
import type { ShellResult } from '@ninja/integrations-shell';
import {
  stage,
  commit,
  checkout,
  pull,
  getBranches,
  getWorkingDirectoryStatus,
} from './operations.js';
import { GitClient } from './git-client.js';

// GitClient mockeado: los tests nunca tocan el git real del sistema.
vi.mock('./git-client.js', () => {
  class GitClient {
    private readonly repoPath: string;
    constructor(repoPath: string) {
      this.repoPath = repoPath;
    }
    getRepoPath(): string {
      return this.repoPath;
    }
    async verifyGitRepo(): Promise<void> {}
    async runWithVerification(args: string[]): Promise<never> {
      throw new Error(`runWithVerification no mockeado: git ${args.join(' ')}`);
    }
    async run(args: string[]): Promise<never> {
      throw new Error(`run no mockeado: git ${args.join(' ')}`);
    }
  }
  return {
    GitClient,
    GitError: class GitError extends Error {},
    GitNotAvailableError: class GitNotAvailableError extends Error {},
    GitRepoNotFoundError: class GitRepoNotFoundError extends Error {},
    GitCommandFailedError: class GitCommandFailedError extends Error {},
    GitOperationBlockedError: class GitOperationBlockedError extends Error {},
    GitParseError: class GitParseError extends Error {},
  };
});

type Handlers = {
  runWithVerification?: (args: string[]) => { stdout?: string; stderr?: string };
  run?: (args: string[]) => { stdout?: string; stderr?: string };
};

function shell(stdout: string, stderr = ''): ShellResult {
  return { exitCode: 0, stdout, stderr, duration: 1 };
}

function makeClient(handlers: Handlers): {
  client: GitClient;
  runWithVerificationSpy: ReturnType<typeof vi.fn>;
} {
  const client = new GitClient('/fake/repo');
  vi.spyOn(client, 'verifyGitRepo').mockResolvedValue(undefined);
  const runWithVerificationSpy = vi.fn().mockImplementation(async (args: string[]) => {
    const res = handlers.runWithVerification?.(args) ?? {};
    return shell(res.stdout ?? '', res.stderr ?? '');
  });
  vi.spyOn(client, 'runWithVerification').mockImplementation(runWithVerificationSpy);
  vi.spyOn(client, 'run').mockImplementation(async (args: string[]) => {
    const res = handlers.run?.(args) ?? {};
    return shell(res.stdout ?? '', res.stderr ?? '');
  });
  return { client, runWithVerificationSpy };
}

describe('operations (GitClient mockeado)', () => {
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    emitSpy = vi.spyOn(eventBus, 'emit').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('stage', () => {
    it('ejecuta git add con archivos específicos', async () => {
      const { client, runWithVerificationSpy } = makeClient({});

      await stage(client, ['src/a.ts', 'src/b.ts']);

      expect(runWithVerificationSpy).toHaveBeenCalledWith(['add', 'src/a.ts', 'src/b.ts']);
    });

    it('ejecuta git add . cuando no se pasan archivos', async () => {
      const { client, runWithVerificationSpy } = makeClient({});

      await stage(client);

      expect(runWithVerificationSpy).toHaveBeenCalledWith(['add', '.']);
    });

    it('ejecuta git add . cuando el array está vacío', async () => {
      const { client, runWithVerificationSpy } = makeClient({});

      await stage(client, []);

      expect(runWithVerificationSpy).toHaveBeenCalledWith(['add', '.']);
    });
  });

  describe('commit', () => {
    it('lanza error si el mensaje es vacío', async () => {
      const { client } = makeClient({});
      await expect(commit(client, '')).rejects.toThrow('Commit message is required');
      await expect(commit(client, '   ')).rejects.toThrow('Commit message is required');
    });

    it('no ejecuta commit cuando no hay nada staged', async () => {
      const { client } = makeClient({
        runWithVerification: (args) => (args[0] === 'status' ? { stdout: '' } : { stdout: '' }),
      });

      await commit(client, 'feat: nothing to commit');

      expect(client.runWithVerification).toHaveBeenCalledTimes(1);
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('ejecuta commit, extrae el hash y emite git.commit.created', async () => {
      const { client } = makeClient({
        runWithVerification: (args) => {
          if (args[0] === 'status') return { stdout: 'M  file.ts' };
          if (args[0] === 'commit') return { stdout: '[main 1a2b3c4] feat: test\n 1 file changed' };
          return { stdout: '' };
        },
      });

      await commit(client, 'feat: test');

      expect(client.runWithVerification).toHaveBeenCalledWith(['commit', '-m', 'feat: test']);
      expect(emitSpy).toHaveBeenCalledTimes(1);
      const evt = emitSpy.mock.calls[0]?.[0];
      expect(evt?.type).toBe('git.commit.created');
      expect(evt?.payload).toEqual({
        repoPath: '/fake/repo',
        message: 'feat: test',
        hash: '1a2b3c4',
      });
    });

    it('usa hash "unknown" cuando el output no contiene hash', async () => {
      const { client } = makeClient({
        runWithVerification: (args) => {
          if (args[0] === 'status') return { stdout: 'M  file.ts' };
          return { stdout: 'nada útil.' };
        },
      });

      await commit(client, 'feat: test');

      const evt = emitSpy.mock.calls[0]?.[0];
      expect(evt?.payload).toMatchObject({ hash: 'unknown' });
    });
  });

  describe('checkout', () => {
    it('hace checkout a una rama válida', async () => {
      const { client, runWithVerificationSpy } = makeClient({});

      await checkout(client, 'feat/nueva-rama');

      expect(runWithVerificationSpy).toHaveBeenCalledWith(['checkout', 'feat/nueva-rama']);
    });

    it('rechaza nombres de rama vacíos', async () => {
      const { client } = makeClient({});
      await expect(checkout(client, '')).rejects.toThrow('Branch name is required');
      await expect(checkout(client, '  ')).rejects.toThrow('Branch name is required');
    });

    it('bloquea ramas con secuencia peligrosa (.., ~, ^)', async () => {
      const { client } = makeClient({});
      await expect(checkout(client, 'main..other')).rejects.toThrow('Invalid branch name');
      await expect(checkout(client, 'main~1')).rejects.toThrow('Invalid branch name');
      await expect(checkout(client, 'HEAD^')).rejects.toThrow('Invalid branch name');
    });
  });

  describe('pull', () => {
    it('hace pull con timeout extendido cuando hay rama activa', async () => {
      const { client, runWithVerificationSpy } = makeClient({
        run: () => ({ stdout: 'main\n' }),
      });

      await pull(client);

      expect(runWithVerificationSpy).toHaveBeenCalledWith(['pull'], 120000);
    });

    it('lanza error en detached HEAD (sin rama activa)', async () => {
      const { client } = makeClient({ run: () => ({ stdout: '\n' }) });

      await expect(pull(client)).rejects.toThrow('Cannot pull: not on a branch');
    });
  });

  describe('getBranches', () => {
    it('lista ramas eliminando el prefijo * de la actual', async () => {
      const { client } = makeClient({
        runWithVerification: () => ({ stdout: '* main\n  feat/a\n  feat/b\n' }),
      });

      await expect(getBranches(client)).resolves.toEqual(['main', 'feat/a', 'feat/b']);
    });

    it('filtra líneas vacías', async () => {
      const { client } = makeClient({
        runWithVerification: () => ({ stdout: '* main\n\n  \n' }),
      });

      await expect(getBranches(client)).resolves.toEqual(['main']);
    });
  });

  describe('getWorkingDirectoryStatus', () => {
    it('retorna clean=true con conteos en cero cuando no hay cambios', async () => {
      const { client } = makeClient({ runWithVerification: () => ({ stdout: '' }) });

      const status = await getWorkingDirectoryStatus(client);

      expect(status).toEqual({ clean: true, staged: 0, unstaged: 0, untracked: 0 });
    });

    it('cuenta staged (X no espacio), unstaged (Y no espacio) y untracked', async () => {
      const { client } = makeClient({
        runWithVerification: () => ({
          stdout: [
            'M  staged.ts',
            'A  added.ts',
            ' M modified.ts',
            ' D deleted.ts',
            '?? new.txt',
          ].join('\n'),
        }),
      });

      const status = await getWorkingDirectoryStatus(client);

      expect(status).toEqual({ clean: false, staged: 2, unstaged: 2, untracked: 1 });
    });
  });
});
