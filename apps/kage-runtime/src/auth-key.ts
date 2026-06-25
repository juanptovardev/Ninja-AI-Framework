import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const KEY_PATH = join(homedir(), '.ninja', 'runtime.key');

export function getOrCreateRuntimeKey(): string {
  if (existsSync(KEY_PATH)) {
    return readFileSync(KEY_PATH, 'utf8').trim();
  }
  mkdirSync(dirname(KEY_PATH), { recursive: true });
  const key = randomBytes(32).toString('hex');
  writeFileSync(KEY_PATH, key, { encoding: 'utf8' });
  if (process.platform !== 'win32') {
    chmodSync(KEY_PATH, 0o600);
  }
  return key;
}

export function getRuntimeKeyPath(): string {
  return KEY_PATH;
}
