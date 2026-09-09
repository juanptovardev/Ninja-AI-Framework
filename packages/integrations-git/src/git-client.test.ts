import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeCommand, type ShellResult } from '@ninja/integrations-shell';
import {
  GitClient,
  GitError,
  GitNotAvailableError,
  GitRepoNotFoundError,
  GitCommandFailedError,
} from './git-client.js';

vi.mock('@ninja/integrations-shell', () => ({
  executeCommand: vi.fn(),
}));

const mockExecute = vi.mocked(executeCommand);

function shellResult(overrides: Partial<ShellResult> = {}): ShellResult {
  return {
    exitCode: 0,
    stdout: '',
    stderr: '',
    duration: 1,
    ...overrides,
  };
}

class TestableGitClient extends GitClient {
  exposeParsePorcelain(output: string): Array<{ status: string; path: string }> {
    return this.parsePorcelainLines(output);
  }

  exposeParseLog(output: string, format: string): Array<Record<string, string>> {
    return this.parseLogOutput(output, format);
  }
}

describe('GitClient', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor / getRepoPath', () => {
    it('expone la ruta del repositorio con la que fue construido', () => {
      const client = new GitClient('/fake/repo');
      expect(client.getRepoPath()).toBe('/fake/repo');
    });
  });

  describe('run', () => {
    it('ejecuta git con cwd del repo y env sanitizado', async () => {
      mockExecute.mockResolvedValueOnce(shellResult({ stdout: 'ok\n' }));

      const client = new GitClient('/fake/repo');
      const result = await client.run(['status', '--porcelain']);

      expect(result.stdout).toBe('ok\n');
      expect(mockExecute).toHaveBeenCalledOnce();
      const command = mockExecute.mock.calls[0][0];
      expect(command.cmd).toBe('git');
      expect(command.args).toEqual(['status', '--porcelain']);
      expect(command.cwd).toBe('/fake/repo');
      expect(command.timeout).toBe(60000);
      expect(command.env?.['GIT_TERMINAL_PROMPT']).toBe('0');
      expect(command.env?.['GIT_PAGER']).toBe('');
    });

    it('respeta el timeout personalizado', async () => {
      mockExecute.mockResolvedValueOnce(shellResult());

      const client = new GitClient('/fake/repo');
      await client.run(['pull'], 120000);

      expect(mockExecute.mock.calls[0][0].timeout).toBe(120000);
    });

    it('lanza GitCommandFailedError cuando el exit code no es 0', async () => {
      mockExecute.mockResolvedValue(
        shellResult({ exitCode: 128, stderr: 'fatal: not a git repository' })
      );

      const client = new GitClient('/fake/repo');

      await expect(client.run(['status'])).rejects.toThrow(GitCommandFailedError);
      await expect(client.run(['status'])).rejects.toThrow('fatal: not a git repository');
    });

    it('envuelve fallos de spawn en GitError (no GitCommandFailedError)', async () => {
      mockExecute.mockRejectedValueOnce(new Error('spawn git ENOENT'));

      const client = new GitClient('/fake/repo');

      await expect(client.run(['status'])).rejects.toThrow(
        'Failed to execute git command: spawn git ENOENT'
      );
      await expect(client.run(['status'])).rejects.toThrow(GitError);
      await expect(client.run(['status'])).rejects.not.toThrow(GitCommandFailedError);
    });
  });

  describe('isGitAvailable', () => {
    it('retorna true cuando git --version responde correctamente', async () => {
      mockExecute.mockResolvedValueOnce(shellResult({ stdout: 'git version 2.45.0\n' }));

      const client = new GitClient('/fake/repo');
      await expect(client.isGitAvailable()).resolves.toBe(true);
    });

    it('retorna false cuando el exit code no es 0 aunque el stdout contenga git version', async () => {
      mockExecute.mockResolvedValueOnce(shellResult({ exitCode: 1, stdout: 'git version 2.45.0' }));

      const client = new GitClient('/fake/repo');
      await expect(client.isGitAvailable()).resolves.toBe(false);
    });

    it('retorna false cuando el stdout no contiene "git version"', async () => {
      mockExecute.mockResolvedValueOnce(shellResult({ stdout: 'other output' }));

      const client = new GitClient('/fake/repo');
      await expect(client.isGitAvailable()).resolves.toBe(false);
    });

    it('retorna false cuando la ejecución falla', async () => {
      mockExecute.mockRejectedValueOnce(new Error('boom'));

      const client = new GitClient('/fake/repo');
      await expect(client.isGitAvailable()).resolves.toBe(false);
    });
  });

  describe('isGitRepo', () => {
    it('retorna true cuando rev-parse --git-dir tiene exit 0', async () => {
      mockExecute.mockResolvedValueOnce(shellResult({ stdout: '.git\n' }));

      const client = new GitClient('/fake/repo');
      await expect(client.isGitRepo()).resolves.toBe(true);
      expect(mockExecute.mock.calls[0][0].args).toEqual(['rev-parse', '--git-dir']);
    });

    it('retorna false cuando rev-parse falla con error de comando git', async () => {
      mockExecute.mockResolvedValueOnce(
        shellResult({ exitCode: 128, stderr: 'fatal: not a git repository' })
      );

      const client = new GitClient('/fake/repo');
      await expect(client.isGitRepo()).resolves.toBe(false);
    });

    it('relanza errores que no sean GitCommandFailedError', async () => {
      mockExecute.mockRejectedValueOnce(new Error('spawn ENOENT'));

      const client = new GitClient('/fake/repo');
      await expect(client.isGitRepo()).rejects.toThrow('Failed to execute git command');
    });
  });

  describe('verifyGitRepo', () => {
    it('pasa cuando git está disponible y el directorio es un repo', async () => {
      mockExecute
        .mockResolvedValueOnce(shellResult({ stdout: 'git version 2.45.0\n' }))
        .mockResolvedValueOnce(shellResult({ stdout: '.git\n' }));

      const client = new GitClient('/fake/repo');
      await expect(client.verifyGitRepo()).resolves.toBeUndefined();
    });

    it('lanza GitNotAvailableError cuando git no está en PATH', async () => {
      mockExecute.mockImplementation(async (command) => {
        if (command.args.includes('--version')) {
          throw new Error('git: command not found');
        }
        return shellResult({ stdout: '.git\n' });
      });

      const client = new GitClient('/fake/repo');
      await expect(client.verifyGitRepo()).rejects.toThrow(GitNotAvailableError);
    });

    it('propaga el GitError de ejecución cuando ni --version ni rev-parse responden', async () => {
      mockExecute.mockRejectedValue(new Error('git: command not found'));

      const client = new GitClient('/fake/repo');
      await expect(client.verifyGitRepo()).rejects.toThrow(GitError);
      await expect(client.verifyGitRepo()).rejects.toThrow('git: command not found');
    });

    it('lanza GitRepoNotFoundError cuando el directorio no es un repo git', async () => {
      mockExecute.mockImplementation(async (command) => {
        if (command.args.includes('--version')) {
          return shellResult({ stdout: 'git version 2.45.0\n' });
        }
        return shellResult({ exitCode: 128, stderr: 'fatal: not a git repository' });
      });

      const client = new GitClient('/not/a/repo');
      await expect(client.verifyGitRepo()).rejects.toThrow(GitRepoNotFoundError);
      await expect(client.verifyGitRepo()).rejects.toThrow('/not/a/repo');
    });
  });

  describe('runWithVerification', () => {
    it('verifica el repo antes de ejecutar el comando', async () => {
      mockExecute
        .mockResolvedValueOnce(shellResult({ stdout: 'git version 2.45.0\n' }))
        .mockResolvedValueOnce(shellResult({ stdout: '.git\n' }))
        .mockResolvedValueOnce(shellResult({ stdout: 'main\n' }));

      const client = new GitClient('/fake/repo');
      const result = await client.runWithVerification(['branch', '--show-current']);

      expect(result.stdout).toBe('main\n');
      expect(mockExecute).toHaveBeenCalledTimes(3);
    });
  });

  describe('parsePorcelainLines', () => {
    it('parsea líneas porcelain en pares status/path', () => {
      const client = new TestableGitClient('/fake/repo');
      const parsed = client.exposeParsePorcelain('M  a.ts\n D b.ts\n?? c.txt');

      expect(parsed).toEqual([
        { status: 'M', path: 'a.ts' },
        { status: 'D', path: 'b.ts' },
        { status: '??', path: 'c.txt' },
      ]);
    });

    it('omite líneas demasiado cortas y entradas sin path', () => {
      const client = new TestableGitClient('/fake/repo');
      const parsed = client.exposeParsePorcelain('ab\nM   \n\nM  valid.ts');

      expect(parsed).toEqual([{ status: 'M', path: 'valid.ts' }]);
    });
  });

  describe('parseLogOutput', () => {
    it('mapea columnas del formato a claves', () => {
      const client = new TestableGitClient('/fake/repo');
      const parsed = client.exposeParseLog('h1 | h2 | Juan | msg', 'hash|short|author|msg');

      expect(parsed).toEqual([{ hash: 'h1', short: 'h2', author: 'Juan', msg: 'msg' }]);
    });

    it('omite líneas cuyo número de columnas no coincide con el formato', () => {
      const client = new TestableGitClient('/fake/repo');
      const parsed = client.exposeParseLog('a|b|c|d\ntoo|few', 'hash|short|author|msg');

      expect(parsed).toHaveLength(1);
      expect(parsed[0]?.['hash']).toBe('a');
    });

    it('omite también líneas con más columnas que el formato', () => {
      const client = new TestableGitClient('/fake/repo');
      const parsed = client.exposeParseLog('a|b|c|d|e', 'hash|short|author|msg');

      expect(parsed).toEqual([]);
    });
  });
});
