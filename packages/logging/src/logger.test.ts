/**
 * Tests del formato de logs JSON (WP-F2.7, Manual §7.1).
 *
 * Criterio del plan: log capturado parsea como JSON con campos obligatorios
 * (ts, level, logger, msg).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createLogger,
  setGlobalLogLevel,
  setGlobalLogFormat,
  getGlobalLogFormat,
} from './logger.js';

interface CapturedLine {
  stream: 'log' | 'warn' | 'error';
  text: string;
}

describe('JSON structured logs (WP-F2.7)', () => {
  let captured: CapturedLine[];
  let origLog: typeof console.log;
  let origWarn: typeof console.warn;
  let origError: typeof console.error;

  beforeEach(() => {
    captured = [];
    origLog = console.log;
    origWarn = console.warn;
    origError = console.error;
    console.log = (...args: unknown[]) => captured.push({ stream: 'log', text: String(args[0]) });
    console.warn = (...args: unknown[]) => captured.push({ stream: 'warn', text: String(args[0]) });
    console.error = (...args: unknown[]) =>
      captured.push({ stream: 'error', text: String(args[0]) });
    setGlobalLogLevel('debug');
    setGlobalLogFormat('json');
  });

  afterEach(() => {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
    setGlobalLogFormat(null);
    setGlobalLogLevel('info');
  });

  it('log básico → 1 línea que parsea como JSON con ts/level/logger/msg', () => {
    const log = createLogger('test-module');
    log.info('hello world');

    expect(captured.length).toBe(1);
    const parsed = JSON.parse(captured[0].text);
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(parsed.level).toBe('info');
    expect(parsed.logger).toBe('test-module');
    expect(parsed.msg).toBe('hello world');
  });

  it('contexto objeto → campos en el mismo nivel; Error → { err: { name, message, stack } }', () => {
    const log = createLogger('test-module');
    log.warn('with context', { correlationId: 'corr-123', userId: 'u1' });

    const ctx = JSON.parse(captured[0].text);
    expect(ctx.msg).toBe('with context');
    expect(ctx.correlationId).toBe('corr-123');
    expect(ctx.userId).toBe('u1');
    expect(ctx.level).toBe('warn');

    log.error('boom', new Error('exploded'));
    const err = JSON.parse(captured[1].text);
    expect(err.level).toBe('error');
    expect(err.err.name).toBe('Error');
    expect(err.err.message).toBe('exploded');
    expect(typeof err.err.stack).toBe('string');
  });

  it('campos reservados: el contexto NO puede sobrescribir ts/level/logger/msg', () => {
    const log = createLogger('test-module');
    log.info('sabotage', { ts: 'fake', level: 'critical', logger: 'evil', msg: 'evil' });

    const parsed = JSON.parse(captured[0].text);
    expect(parsed.level).toBe('info');
    expect(parsed.logger).toBe('test-module');
    expect(parsed.msg).toBe('sabotage');
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('un evento por línea, sin caracteres de nueva línea dentro (JSONL)', () => {
    const log = createLogger('test-module');
    log.info('line 1', { note: 'multi\nline' });
    log.info('line 2');

    // JSON.stringify escapa \n dentro de strings — cada console call es 1 línea.
    expect(captured.length).toBe(2);
    expect(captured[0].text.split('\n').length).toBe(1);
    expect(JSON.parse(captured[0].text).note).toBe('multi\nline');
    expect(JSON.parse(captured[1].text).msg).toBe('line 2');
  });

  it('minLevel global sigue funcionando en modo JSON', () => {
    setGlobalLogLevel('warn');
    const log = createLogger('test-module');
    log.debug('no debería salir');
    log.info('tampoco');
    log.warn('esta sí');

    expect(captured.length).toBe(1);
    expect(JSON.parse(captured[0].text).level).toBe('warn');
  });

  it('formato auto: json cuando NO es TTY (process.stdout no TTY en tests)', () => {
    setGlobalLogFormat(null); // auto
    const log = createLogger('test-module');
    log.info('auto format');

    // En entorno de test stdout no es TTY → auto resuelve 'json'
    const parsed = JSON.parse(captured[0].text);
    expect(parsed.msg).toBe('auto format');
    expect(getGlobalLogFormat()).toBe(null);
  });

  it('formato pretty (forzado) mantiene el formato legacy de texto', () => {
    setGlobalLogFormat('pretty');
    const log = createLogger('test-module');
    log.info('pretty line', { k: 'v' });

    expect(captured.length).toBe(1);
    expect(captured[0].text).toContain('INFO');
    expect(captured[0].text).toContain('[test-module]');
    expect(captured[0].text).toContain('pretty line');
    // El contexto se pasa como argumento (comportamiento legacy)
    expect(() => JSON.parse(captured[0].text)).toThrow();
  });

  it('valores primitivos extra → campo args', () => {
    const log = createLogger('test-module');
    log.info('primitives', 42, 'abc', true);

    const parsed = JSON.parse(captured[0].text);
    expect(parsed.args).toEqual([42, 'abc', true]);
  });
});
