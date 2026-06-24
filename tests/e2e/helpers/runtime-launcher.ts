import { spawn, ChildProcess } from 'node:child_process';
import { waitForRuntime } from './e2e-utils';

const STARTUP_TIMEOUT = 15000;
const GRACEFUL_SHUTDOWN_TIMEOUT = 5000;

export class RuntimeLauncher {
  private runtimeProcess: ChildProcess | null = null;

  async start(): Promise<void> {
    this.runtimeProcess = spawn('pnpm', ['runtime:dev'], {
      stdio: 'pipe',
      shell: true,
      cwd: process.cwd(),
    });

    this.runtimeProcess.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(`[runtime] ${data.toString()}`);
    });

    this.runtimeProcess.on('error', (err: Error) => {
      this.runtimeProcess = null;
      throw err;
    });

    try {
      await waitForRuntime('http://localhost:3141', STARTUP_TIMEOUT);
    } catch (err) {
      this.killProcess();
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (!this.runtimeProcess) return;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.killProcess();
        resolve();
      }, GRACEFUL_SHUTDOWN_TIMEOUT);

      this.runtimeProcess!.on('exit', () => {
        clearTimeout(timer);
        this.runtimeProcess = null;
        resolve();
      });

      this.runtimeProcess!.kill('SIGTERM');
    });
  }

  private killProcess(): void {
    if (this.runtimeProcess) {
      try {
        this.runtimeProcess.kill('SIGKILL');
      } catch {
        // Process may already be dead
      }
      this.runtimeProcess = null;
    }
  }
}