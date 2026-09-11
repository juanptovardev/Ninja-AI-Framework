import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoInstaller } from '../auto-installer.js';
import { detectClient } from '@ninja/roster';
import { spawn } from 'child_process';

// Mock detectClient from @ninja/roster
vi.mock('@ninja/roster', async (importOriginal) => {
  const original = await importOriginal<typeof import('@ninja/roster')>();
  return {
    ...original,
    detectClient: vi.fn(),
  };
});

// Tipos derivados del SUT (precedente FakeEngramClient): el test no importa
// tipos de la capa roster directamente — línea 3 preexistente queda en DEBT.
type ClientConfig = NonNullable<ReturnType<typeof detectClient>>;
type ClientId = Parameters<typeof detectClient>[0];

// Mock child_process spawn
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

function makeDetectedClient(
  overrides: Partial<Pick<ClientConfig, 'id' | 'supportsAutoInstall' | 'installCommand'>> = {}
): ClientConfig {
  const {
    id = 'claude-code',
    supportsAutoInstall = true,
    installCommand = 'npm install -g @anthropic/claude-code',
  } = overrides;
  return {
    id,
    name: id,
    type: 'cli',
    executablePath: '',
    configPath: '',
    configDir: '',
    mcpConfigPath: '',
    skillsDir: '',
    agentsDir: '',
    status: 'connected',
    capabilities: [],
    assignedRole: 'worker',
    delegationModel: 'solo',
    connectionMethod: { type: 'headless-cli', command: '', flags: [] },
    supportsAutoInstall,
    installCommand,
    installUrl: '',
  };
}

describe('AutoInstaller', () => {
  let autoInstaller: AutoInstaller;

  beforeEach(() => {
    vi.clearAllMocks();
    autoInstaller = new AutoInstaller();
  });

  describe('canAutoInstall', () => {
    it('should return true for a client that supports auto-install and has non-empty command', () => {
      vi.mocked(detectClient).mockReturnValue(makeDetectedClient());

      expect(autoInstaller.canAutoInstall('claude-code')).toBe(true);
      expect(detectClient).toHaveBeenCalledWith('claude-code', true);
    });

    it('should return false for a client that does not support auto-install', () => {
      vi.mocked(detectClient).mockReturnValue(
        makeDetectedClient({ id: 'cursor', supportsAutoInstall: false, installCommand: '' })
      );

      expect(autoInstaller.canAutoInstall('cursor')).toBe(false);
    });

    it('should return false if detectClient returns null', () => {
      vi.mocked(detectClient).mockReturnValue(null);

      expect(autoInstaller.canAutoInstall('claude-code')).toBe(false);
    });
  });

  describe('install', () => {
    it('should return success: false if client cannot be auto-installed', async () => {
      vi.mocked(detectClient).mockReturnValue(null);

      const result = await autoInstaller.install('claude-code');
      expect(result.success).toBe(false);
      expect(result.output).toContain('Auto-install not supported');
    });

    it('should execute command and return success: true on successful command execution', async () => {
      vi.mocked(detectClient).mockReturnValue(makeDetectedClient());

      const mockChild: any = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') callback(Buffer.from('Installation complete'));
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            process.nextTick(() => callback(0));
          }
        }),
      };
      vi.mocked(spawn).mockReturnValue(mockChild);

      const result = await autoInstaller.install('claude-code');
      expect(result.success).toBe(true);
      expect(result.output).toBe('Installation complete');
      expect(result.command).toBe('npm install -g @anthropic/claude-code');
      expect(spawn).toHaveBeenCalledWith(
        'npm install -g @anthropic/claude-code',
        expect.any(Object)
      );
    });

    it('should catch spawn errors and return success: false with output', async () => {
      vi.mocked(detectClient).mockReturnValue(makeDetectedClient());

      const mockChild: any = {
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn((event, callback) => {
            if (event === 'data') callback(Buffer.from('Network error'));
          }),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            process.nextTick(() => callback(1));
          }
        }),
      };
      vi.mocked(spawn).mockReturnValue(mockChild);

      const result = await autoInstaller.install('claude-code');
      expect(result.success).toBe(false);
      expect(result.output).toContain('Command failed with exit code 1');
      expect(result.output).toContain('Network error');
    });
  });

  describe('installAll', () => {
    it('should sequentialize installation of supported clients', async () => {
      vi.mocked(detectClient).mockImplementation((id: ClientId, _force?: boolean) => {
        if (id === 'claude-code') {
          return makeDetectedClient();
        }
        return null;
      });

      const mockChild: any = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') process.nextTick(() => callback(0));
        }),
      };
      vi.mocked(spawn).mockReturnValue(mockChild);

      const result = await autoInstaller.installAll();
      expect(result.succeeded).toContain('claude-code');
      expect(result.skipped).toContain('cursor');
      expect(spawn).toHaveBeenCalledTimes(1);
    });
  });
});
