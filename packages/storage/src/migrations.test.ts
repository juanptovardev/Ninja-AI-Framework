/**
 * Tests del sistema de migraciones con down path (WP-C4b / F2.5, Gate 4 §3.1).
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations, revertMigrations, type Migration } from './migrations.js';

/** Migración de juguete con up/down para probar el ciclo completo. */
const sampleMigrations: Migration[] = [
  {
    id: 1,
    name: 'create gadgets',
    up: (db) => {
      db.exec('CREATE TABLE gadgets (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
    },
    down: (db) => {
      db.exec('DROP TABLE IF EXISTS gadgets');
    },
  },
  {
    id: 2,
    name: 'add gadgets count table',
    up: (db) => {
      db.exec('CREATE TABLE gadget_counts (count INTEGER NOT NULL)');
    },
    down: (db) => {
      db.exec('DROP TABLE IF EXISTS gadget_counts');
    },
  },
];

describe('revertMigrations (Gate 4 up/down)', () => {
  it('up → tabla existe · down → tabla desaparece · up de nuevo → reaplica', () => {
    const db = new Database(':memory:');

    runMigrations(db, sampleMigrations);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gadgets'").get()
    ).toBeDefined();

    const first = revertMigrations(db, sampleMigrations); // revierte la 2 (gadget_counts)
    expect(first.reverted).toBe(true);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gadget_counts'").get()
    ).toBeUndefined();
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gadgets'").get()
    ).toBeDefined(); // la 1 sigue

    const second = revertMigrations(db, sampleMigrations); // revierte la 1
    expect(second.reverted).toBe(true);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gadgets'").get()
    ).toBeUndefined();

    // Re-aplicar después de revertir: runMigrations reaplica ambas
    runMigrations(db, sampleMigrations);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gadgets'").get()
    ).toBeDefined();
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gadget_counts'").get()
    ).toBeDefined();
    db.close();
  });

  it('idempotente: revertir sin pendientes → not-applied (sin error)', () => {
    const db = new Database(':memory:');
    runMigrations(db, sampleMigrations);
    revertMigrations(db, sampleMigrations);
    revertMigrations(db, sampleMigrations);
    const third = revertMigrations(db, sampleMigrations); // ya no hay nada aplicado
    expect(third.reverted).toBe(false);
    expect(third.reason).toBe('not-applied');
    db.close();
  });

  it('migración sin down path → se salta y reporta no-down-path', () => {
    const db = new Database(':memory:');
    const noDown: Migration[] = [
      {
        id: 1,
        name: 'legacy up-only',
        up: (d) => d.exec('CREATE TABLE legacy (id TEXT PRIMARY KEY)'),
      },
    ];
    runMigrations(db, noDown);
    const result = revertMigrations(db, noDown);
    expect(result.reverted).toBe(false);
    expect(result.reason).toBe('no-down-path');
    // La tabla sigue ahí
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='legacy'").get()
    ).toBeDefined();
    db.close();
  });

  it('borra la fila de __migrations al revertir (up puede reaplicar)', () => {
    const db = new Database(':memory:');
    runMigrations(db, sampleMigrations);
    expect(
      (db.prepare('SELECT id FROM __migrations ORDER BY id').all() as { id: number }[]).length
    ).toBe(2);
    revertMigrations(db, sampleMigrations);
    const remaining = db.prepare('SELECT id FROM __migrations ORDER BY id').all() as {
      id: number;
    }[];
    expect(remaining.map((r) => r.id)).toEqual([1]);
    db.close();
  });
});
