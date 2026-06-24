import { spawn } from 'child_process';
import http from 'http';
import { URL } from 'url';
import { IClientAdapter, AdapterOptions, AdapterResult } from '../types.js';
import { BaseTransportAdapter } from '../base-adapter.js';
import { createLogger } from '@ninja/logging';

const log = createLogger('client-adapters:mcp');

export class McpAdapter extends BaseTransportAdapter {
  async execute(prompt: string, options: AdapterOptions & { connectionType: 'stdio' | 'http'; url?: string; toolName?: string }): Promise<AdapterResult> {
    const startTime = Date.now();
    const toolName = options.toolName || 'delegate_task';

    if (options.connectionType === 'http') {
      const urlStr = options.url || 'http://localhost:8500/mcp';
      log.info(`Sending HTTP MCP request to ${urlStr} for tool ${toolName}`);
      return this.executeHttp(urlStr, toolName, prompt, options, startTime);
    } else {
      const cmd = options.executablePath || 'node';
      const args = options.args || [];
      log.info(`Spawning Stdio MCP process: ${cmd} ${args.join(' ')}`);
      return this.executeStdio(cmd, args, toolName, prompt, options, startTime);
    }
  }

  private executeHttp(urlStr: string, toolName: string, prompt: string, options: AdapterOptions, startTime: number): Promise<AdapterResult> {
    return new Promise((resolve) => {
      try {
        const parsedUrl = new URL(urlStr);
        const requestData = JSON.stringify({
          jsonrpc: '2.0',
          id: options.taskId,
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: {
              prompt: prompt,
              taskId: options.taskId,
            },
          },
        });

        const reqOptions = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestData),
          },
          timeout: options.timeoutMs || 60000,
        };

        const req = http.request(reqOptions, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            const durationMs = Date.now() - startTime;
            try {
              const responseObj = JSON.parse(data);
              if (responseObj.error) {
                resolve({
                  status: 'error',
                  output: `MCP HTTP Error: ${JSON.stringify(responseObj.error)}`,
                  rawOutput: responseObj,
                  durationMs,
                });
              } else {
                const textResult = responseObj.result?.content?.[0]?.text || JSON.stringify(responseObj.result);
                resolve({
                  status: 'success',
                  output: textResult,
                  rawOutput: responseObj,
                  durationMs,
                });
              }
            } catch {
              resolve({
                status: 'success',
                output: data,
                durationMs,
              });
            }
          });
        });

        req.on('error', (err) => {
          resolve({
            status: 'error',
            output: `MCP HTTP request failed: ${err.message}`,
            durationMs: Date.now() - startTime,
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({
            status: 'timeout',
            output: `MCP HTTP request timed out after ${options.timeoutMs || 60000}ms.`,
            durationMs: Date.now() - startTime,
          });
        });

        req.write(requestData);
        req.end();
      } catch (err: any) {
        resolve({
          status: 'error',
          output: `MCP HTTP setup error: ${err.message}`,
          durationMs: Date.now() - startTime,
        });
      }
    });
  }

  private executeStdio(cmd: string, args: string[], toolName: string, prompt: string, options: AdapterOptions, startTime: number): Promise<AdapterResult> {
    return new Promise((resolve) => {
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

      // Send JSON-RPC request to stdio
      const rpcRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: options.taskId,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: {
            prompt: prompt,
            taskId: options.taskId,
          },
        },
      }) + '\n';

      try {
        child.stdin.write(rpcRequest);
      } catch (err) {
        log.warn('Failed to write to stdio MCP stdin:', err);
      }

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({
          status: 'timeout',
          output: stdout || `Stdio MCP timeout: Stderr: ${stderr}`,
          durationMs: Date.now() - startTime,
        });
      }, options.timeoutMs || 60000);

      child.on('close', (code) => {
        clearTimeout(timeout);
        const durationMs = Date.now() - startTime;
        
        try {
          // Parse the lines from stdout to find the matching JSON-RPC response
          const lines = stdout.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const res = JSON.parse(line);
              if (res.id === options.taskId) {
                if (res.error) {
                  return resolve({
                    status: 'error',
                    output: `Stdio MCP error: ${JSON.stringify(res.error)}`,
                    rawOutput: res,
                    durationMs,
                  });
                }
                const textResult = res.result?.content?.[0]?.text || JSON.stringify(res.result);
                return resolve({
                  status: 'success',
                  output: textResult,
                  rawOutput: res,
                  durationMs,
                });
              }
            } catch {
              // Ignore non-JSON lines
            }
          }
          
          // Fallback if no matching JSON RPC message found
          resolve({
            status: code === 0 ? 'success' : 'error',
            output: stdout || stderr || `Stdio MCP closed with code ${code}`,
            durationMs,
          });
        } catch (err: any) {
          resolve({
            status: 'error',
            output: `Failed to parse stdio MCP response: ${err.message}. Raw output: ${stdout}`,
            durationMs,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          status: 'error',
          output: `Stdio MCP process error: ${err.message}`,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }
}
