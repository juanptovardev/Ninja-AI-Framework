import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Buscar .env subiendo desde cwd (Turbo puede cambiar el directorio de trabajo)
function findEnvFile(): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const envPath = findEnvFile();
if (envPath) {
  const result = dotenv.config({ path: envPath, override: true });
  console.log(`[dotenv] Loaded ${Object.keys(result.parsed || {}).length} vars from ${envPath}`);
  console.log(`[dotenv] LLM_BASE_URL = ${process.env.LLM_BASE_URL}`);
  console.log(`[dotenv] LLM_DEFAULT_MODEL = ${process.env.LLM_DEFAULT_MODEL}`);
  console.log(`[dotenv] LLM_API_KEY = ${process.env.LLM_API_KEY ? '***SET***' : 'NOT SET'}`);
} else {
  console.warn('[dotenv] WARNING: No .env file found! CWD =', process.cwd());
}

import { createLogger } from '@ninja/logging';
import { bootstrap, shutdown } from './lifecycle.js';

const log = createLogger('kage-runtime');

async function main(): Promise<void> {
  try {
    await bootstrap();
    log.info('Bootstrap completed successfully. Server should be running.');

    process.on('SIGINT', async () => {
      log.info('Received SIGINT. Initiating shutdown...');
      await shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      log.info('Received SIGTERM. Initiating shutdown...');
      await shutdown();
      process.exit(0);
    });

    log.info('Process is waiting for connections...');
  } catch (err) {
    log.error('Kage Runtime failed to start', err);
    process.exit(1);
  }
}

main();
