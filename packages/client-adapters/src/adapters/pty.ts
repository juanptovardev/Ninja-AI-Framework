import { spawn } from 'child_process';
import { IClientAdapter, AdapterOptions, AdapterResult } from '../types.js';
import { BaseTransportAdapter } from '../base-adapter.js';
import { createLogger } from '@ninja/logging';

const log = createLogger('client-adapters:pty');

export class PtyInteractiveAdapter extends BaseTransportAdapter {
  async execute(prompt: string, options: AdapterOptions): Promise<AdapterResult> {
    const startTime = Date.now();
    const cmd = options.executablePath || 'node';
    const args = options.args || [];

    log.info(`Spawning simulated PTY process: ${cmd} ${args.join(' ')}`);

    return new Promise((resolve) => {
      // Simulate PTY by spawning process and handling input/output streams
      const child = spawn(cmd, args, {
        shell: true,
        env: { ...process.env, TERM: 'xterm', FORCE_COLOR: '0' },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        
        // Feed the prompt if the process is prompting for input.
        // In a simulated PTY, we can watch stdout for cues like ">", "?", "input", "password"
        // and automatically write to stdin.
        if (chunk.match(/[>?:]\s*$/) || chunk.toLowerCase().includes('prompt') || chunk.toLowerCase().includes('enter')) {
          try {
            child.stdin.write(prompt + '\n');
          } catch (e) {
            log.warn('PTY simulation failed to write to stdin:', e);
          }
        }
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Write initial prompt just in case the program starts directly in input-wait mode
      try {
        child.stdin.write(prompt + '\n');
      } catch (err) {
        log.warn('PTY simulation: initial write error:', err);
      }

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({
          status: 'timeout',
          output: stdout || `Interactive timeout: Stderr: ${stderr}`,
          durationMs: Date.now() - startTime,
        });
      }, options.timeoutMs || 90000); // Interactive tasks might need more time

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
            output: stdout || stderr || `PTY process exited with code ${code}`,
            durationMs,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          status: 'error',
          output: `PTY spawn error: ${err.message}`,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }
}
