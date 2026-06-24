import { spawn } from 'child_process';
import { IClientAdapter, AdapterOptions, AdapterResult } from '../types.js';
import { BaseTransportAdapter } from '../base-adapter.js';
import { createLogger } from '@ninja/logging';

const log = createLogger('client-adapters:headless');

export class HeadlessCliAdapter extends BaseTransportAdapter {
  async execute(prompt: string, options: AdapterOptions): Promise<AdapterResult> {
    const startTime = Date.now();
    const cmd = options.executablePath || 'node';
    const args = [...(options.args || []), ...(options.flags || [])];
    
    log.info(`Executing headless CLI task: ${cmd} ${args.join(' ')}`);

    return new Promise((resolve) => {
      // For some CLI engines, we pass the prompt as the last argument or pipe it to stdin.
      // We'll support both: we'll append the prompt if it's CLI args-based,
      // and we'll write it to stdin if requested, or write it as a general fallback.
      const child = spawn(cmd, args, {
        shell: true,
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Write prompt to stdin and close it
      try {
        child.stdin.write(prompt + '\n');
        child.stdin.end();
      } catch (err) {
        log.warn('Failed to write to child process stdin:', err);
      }

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({
          status: 'timeout',
          output: stdout || `Timeout: Process did not respond within ${options.timeoutMs || 60000}ms. Stderr: ${stderr}`,
          durationMs: Date.now() - startTime,
        });
      }, options.timeoutMs || 60000);

      child.on('close', (code) => {
        clearTimeout(timeout);
        const durationMs = Date.now() - startTime;
        
        if (code === 0) {
          resolve({
            status: 'success',
            output: stdout.trim(),
            durationMs,
          });
        } else {
          resolve({
            status: 'error',
            output: stdout || stderr || `Process exited with code ${code}`,
            durationMs,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          status: 'error',
          output: `Failed to start process: ${err.message}`,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }
}
