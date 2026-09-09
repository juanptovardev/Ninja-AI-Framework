import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getStatus, getBranch, getChangedFiles, getLog } from './status.js';
import { GitClient } from './git-client.js';

// GitClient se mockea completo: NUNCA se ejecuta git real en tests.
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

type RunHandler = (args: string[]) => { stdout: string; stderr?: string };

function makeClient(handler: RunHandler): GitClient {
  const client = new GitClient('/fake/repo');
  vi.spyOn(client, 'runWithVerification').mockImplementation(async (args) => {
    const res = handler(args);
    return { exitCode: 0, stdout: res.stdout, stderr: res.stderr ?? '', duration: 1 };
  });
  return client;
}

describe('status parsing (child_process mockeado)', () => {
  let handler: RunHandler;

  beforeEach(() => {
    handler = () => ({ stdout: '' });
  });

  function clientFor(): GitClient {
    return makeClient((args) => handler(args));
  }

  describe('getBranch', () => {
    it('retorna el nombre de la rama trimeado', async () => {
      handler = (args) => {
        expect(args).toEqual(['branch', '--show-current']);
        return { stdout: 'feat/wp-d3-gitlight\n' };
      };

      await expect(getBranch(clientFor())).resolves.toBe('feat/wp-d3-gitlight');
    });

    it('retorna string vacío en detached HEAD', async () => {
      handler = () => ({ stdout: '\n' });
      await expect(getBranch(clientFor())).resolves.toBe('');
    });
  });

  describe('getStatus', () => {
    it('parsea staged, unstaged y untracked desde porcelain v1', async () => {
      handler = (args) => {
        if (args[0] === 'branch') return { stdout: 'main\n' };
        return {
          stdout: [
            '## main...origin/main',
            'M  src/app.ts',
            'A  src/new.ts',
            ' M src/old.ts',
            '?? notes.txt',
            'R  old.ts -> renamed.ts',
            '',
          ].join('\n'),
        };
      };

      const status = await getStatus(clientFor());

      expect(status.branch).toBe('main');
      expect(status.staged).toEqual([
        { path: 'src/app.ts', status: 'M', staged: true },
        { path: 'src/new.ts', status: 'A', staged: true },
        { path: 'old.ts -> renamed.ts', status: 'R', staged: true },
      ]);
      expect(status.unstaged).toEqual([{ path: 'src/old.ts', status: 'M', staged: false }]);
      expect(status.untracked).toEqual([{ path: 'notes.txt', status: '?', staged: false }]);
      expect(status.ahead).toBe(0);
      expect(status.behind).toBe(0);
    });

    it('parsea ahead/behind desde la línea de rama', async () => {
      handler = (args) => {
        if (args[0] === 'branch') return { stdout: 'main\n' };
        return {
          stdout: ['## main...origin/main [ahead 2, behind 5]', ' M x.ts'].join('\n'),
        };
      };

      const status = await getStatus(clientFor());
      expect(status.ahead).toBe(2);
      expect(status.behind).toBe(5);
    });

    it('retorna ceros cuando no hay línea de rama (detached)', async () => {
      handler = (args) => {
        if (args[0] === 'branch') return { stdout: '\n' };
        return { stdout: ' M x.ts' };
      };

      const status = await getStatus(clientFor());
      expect(status.branch).toBe('');
      expect(status.ahead).toBe(0);
      expect(status.behind).toBe(0);
      expect(status.unstaged).toHaveLength(1);
    });

    it('clasifica como unstaged el archivo con workspace-modified y columna X vacía', async () => {
      handler = (args) => {
        if (args[0] === 'branch') return { stdout: 'main\n' };
        return { stdout: ['## main', ' D deleted.ts', ' M mod.ts'].join('\n') };
      };

      const status = await getStatus(clientFor());
      expect(status.unstaged).toEqual([
        { path: 'deleted.ts', status: 'D', staged: false },
        { path: 'mod.ts', status: 'M', staged: false },
      ]);
      expect(status.staged).toHaveLength(0);
    });

    it('ignora líneas sin path', async () => {
      handler = (args) => {
        if (args[0] === 'branch') return { stdout: 'main\n' };
        return { stdout: ['## main', 'M ', '   '].join('\n') };
      };

      const status = await getStatus(clientFor());
      expect(status.staged).toHaveLength(0);
      expect(status.unstaged).toHaveLength(0);
      expect(status.untracked).toHaveLength(0);
    });
  });

  describe('getChangedFiles', () => {
    it('retorna todos los archivos cambiados en una sola lista', async () => {
      handler = (args) => {
        expect(args).toEqual(['status', '--porcelain=v1']);
        return {
          stdout: ['M  staged.ts', ' M unstaged.ts', '?? untracked.ts'].join('\n'),
        };
      };

      const files = await getChangedFiles(clientFor());

      expect(files).toEqual([
        { path: 'staged.ts', status: 'M', staged: true },
        { path: 'unstaged.ts', status: 'M', staged: false },
        { path: 'untracked.ts', status: '?', staged: false },
      ]);
    });

    it('retorna lista vacía con árbol limpio', async () => {
      handler = () => ({ stdout: '' });
      await expect(getChangedFiles(clientFor())).resolves.toEqual([]);
    });
  });

  describe('getLog (log parsing con formato NINJA)', () => {
    const FORMAT = '%H_NINJA_%h_NINJA_%an_NINJA_%ae_NINJA_%ad_NINJA_%s_NINJA_%p';

    it('parsea commits completos con fecha ISO', async () => {
      handler = (args) => {
        expect(args[0]).toBe('log');
        expect(args[1]).toBe('--max-count=10');
        expect(args[2]).toBe(`--pretty=format:${FORMAT}`);
        expect(args[3]).toBe('--date=iso');
        return {
          stdout: [
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_NINJA_aaa1111_NINJA_Juan Pérez_NINJA_juan@example.com_NINJA_2026-09-01 10:00:00 +0200_NINJA_feat: initial commit_NINJA_',
          ].join('\n'),
        };
      };

      const commits = await getLog(clientFor());

      expect(commits).toHaveLength(1);
      expect(commits[0]).toMatchObject({
        hash: 'a'.repeat(40),
        shortHash: 'aaa1111',
        author: 'Juan Pérez',
        email: 'juan@example.com',
        message: 'feat: initial commit_NINJA_',
        isMerge: false,
      });
      expect(commits[0]?.date).toEqual(new Date('2026-09-01 10:00:00 +0200'));
    });

    it('respeta el límite solicitado', async () => {
      handler = (args) => {
        expect(args[1]).toBe('--max-count=3');
        return { stdout: '' };
      };

      await expect(getLog(clientFor(), 3)).resolves.toEqual([]);
    });

    it('marca commits de merge por la columna de padres con espacio', async () => {
      handler = () => ({
        stdout: [
          'b000000000000000000000000000000000000000_NINJA_bbb2222_NINJA_Dev_NINJA_dev@example.com_NINJA_2026-09-02 11:00:00 +0000_NINJA_merge branch feature_NINJA_b111111 b222222',
        ].join('\n'),
      });

      const commits = await getLog(clientFor());
      expect(commits[0]?.isMerge).toBe(true);
    });

    it('omite líneas malformadas con menos de 6 columnas', async () => {
      handler = () => ({
        stdout: ['solo_dos_NINJA_columnas'].join('\n'),
      });

      await expect(getLog(clientFor())).resolves.toEqual([]);
    });

    it('soporta mensajes de commit que contienen el separador _NINJA_', async () => {
      handler = () => ({
        stdout: [
          'c000000000000000000000000000000000000000_NINJA_ccc3333_NINJA_Dev_NINJA_dev@example.com_NINJA_2026-09-03 12:00:00 +0000_NINJA_fix: handle _NINJA_ separator in message_NINJA_',
        ].join('\n'),
      });

      const commits = await getLog(clientFor());
      expect(commits).toHaveLength(1);
      expect(commits[0]?.message).toBe('fix: handle _NINJA_ separator in message_NINJA_');
    });
  });
});
