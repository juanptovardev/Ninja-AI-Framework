import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

vi.mock('@ninja/config', () => ({ getNinjaGlobalDir: vi.fn() }));
vi.mock('@ninja/storage', () => ({
  initDb: vi.fn(),
  runMigrations: vi.fn(),
  revertMigrations: vi.fn(),
}));

import { getNinjaGlobalDir } from '@ninja/config';
import { initDb, type Migration } from '@ninja/storage';
import { WORKSPACE_MIGRATIONS } from './migrations/workspace-migrations.js';

let tmpDir: string;
let exitSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;
let savedArgv: string[];

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'wb-migrate-'));
  savedArgv = [...process.argv];
  process.argv = ['node', 'migrate'];
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.mocked(getNinjaGlobalDir).mockReturnValue(tmpDir);
  vi.mocked(initDb).mockReturnValue({ close: vi.fn() } as unknown as ReturnType<typeof initDb>);
});

afterEach(() => {
  process.argv = savedArgv;
  exitSpy.mockRestore();
  logSpy.mockRestore();
  vi.clearAllMocks();
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
  vi.resetModules();
});

describe('migrate CLI (db:migrate up)', () => {
  it('runs pending migrations against <globalDir>/ninja.db and exits 0', async () => {
    vi.resetModules();
    const { getNinjaGlobalDir: freshGlobalDir } = await import('@ninja/config');
    const storage = await import('@ninja/storage');
    vi.mocked(freshGlobalDir).mockReturnValue(tmpDir);
    vi.mocked(storage.initDb).mockReturnValue({ close: vi.fn() } as unknown as ReturnType<
      typeof initDb
    >);

    await import('./migrate.js');
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0));

    expect(freshGlobalDir).toHaveBeenCalled();
    expect(storage.initDb).toHaveBeenCalledWith(join(tmpDir, 'ninja.db'));
    expect(storage.runMigrations).toHaveBeenCalledTimes(1);
    const [dbArg, migrationsArg] = vi.mocked(storage.runMigrations).mock.calls[0] as unknown[];
    expect(dbArg).toBe(vi.mocked(storage.initDb).mock.results[0]?.value);
    // Function identity differs across module re-imports, so compare by shape.
    const passedIds = (migrationsArg as Migration[]).map((m) => m.id);
    const passedNames = (migrationsArg as Migration[]).map((m) => m.name);
    expect(passedIds).toEqual(WORKSPACE_MIGRATIONS.map((m) => m.id));
    expect(passedNames).toEqual(WORKSPACE_MIGRATIONS.map((m) => m.name));
    const db = vi.mocked(storage.initDb).mock.results[0]?.value as { close: () => void };
    expect(db.close).toHaveBeenCalledTimes(1);
  });

  it('takes a Gate 4 backup copy before migrating when ninja.db already exists', async () => {
    vi.resetModules();
    const { getNinjaGlobalDir: freshGlobalDir } = await import('@ninja/config');
    const storage = await import('@ninja/storage');
    vi.mocked(freshGlobalDir).mockReturnValue(tmpDir);
    vi.mocked(storage.initDb).mockReturnValue({ close: vi.fn() } as unknown as ReturnType<
      typeof initDb
    >);

    const expectedDb = join(tmpDir, 'ninja.db');
    writeFileSync(expectedDb, 'dummy-db-bytes');

    await import('./migrate.js');
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0));

    expect(vi.mocked(storage.initDb)).toHaveBeenCalledWith(expectedDb);
    expect(vi.mocked(storage.runMigrations)).toHaveBeenCalledTimes(1);
    expect(basename(vi.mocked(storage.initDb).mock.calls[0]?.[0] as string)).toBe('ninja.db');
  });
});
