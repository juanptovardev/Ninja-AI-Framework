import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { loadEnv } from './env-schema.js';

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
} else {
  console.warn('[dotenv] WARNING: No .env file found! CWD =', process.cwd());
}

// Validate env vars fail-fast — exits with code 1 if invalid (ADR-0004)
const env = loadEnv();
const urlHost = new URL(env.LLM_BASE_URL).host;
console.log(`[env] LLM_BASE_URL host = ${urlHost} (model=${env.LLM_DEFAULT_MODEL})`);
console.log(`[env] LLM_API_KEY = ***SET*** (${env.LLM_API_KEY.length} chars)`);
console.log(`[env] NINJA_LLM_FAIL_MODE = ${env.NINJA_LLM_FAIL_MODE}`);

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
