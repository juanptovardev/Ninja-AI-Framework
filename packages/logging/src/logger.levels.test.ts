/**
 * Tests de niveles y formato del logger (T5.3, D3).
 *
 * Criterio del plan: los niveles filtran correctamente (debug/info/warn/error/silent),
 * createLogger respeta naming, y la resolución por entorno (LOG_LEVEL / NINJA_LOG_FORMAT)
 * sigue el contrato del F2.7 (Manual §7.1).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createLogger,
  setGlobalLogLevel,
  getGlobalLogLevel,
  setGlobalLogFormat,
} from './logger.js';

interface CapturedLine {
  stream: 'log' | 'warn' | 'error';
  text: string;
}

/** Configura captura de streams de console y nivel/formato base. */
function captureConsole(): CapturedLine[] {
  const captured: CapturedLine[] = [];
  console.log = (...args: unknown[]) => captured.push({ stream: 'log', text: String(args[0]) });
  console.warn = (...args: unknown[]) => captured.push({ stream: 'warn', text: String(args[0]) });
  console.error = (...args: unknown[]) => captured.push({ stream: 'error', text: String(args[0]) });
  return captured;
}

describe('Niveles: filtrado debug < info < warn < error < silent', () => {
  let captured: CapturedLine[];
  let origLog: typeof console.log;
  let origWarn: typeof console.warn;
  let origError: typeof console.error;

  beforeEach(() => {
    origLog = console.log;
    origWarn = console.warn;
    origError = console.error;
    captured = captureConsole();
    setGlobalLogFormat('json');
    setGlobalLogLevel('debug');
  });

  afterEach(() => {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
    setGlobalLogFormat(null);
    setGlobalLogLevel('info');
  });

  it('nivel global debug → los 4 niveles emitidos, cada uno a su stream', () => {
    const log = createLogger('levels-debug');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');

    expect(captured.length).toBe(4);
    expect(captured.map((c) => JSON.parse(c.text).msg)).toEqual(['d', 'i', 'w', 'e']);
    expect(captured.map((c) => JSON.parse(c.text).level)).toEqual([
      'debug',
      'info',
      'warn',
      'error',
    ]);
    // Routing de streams: debug/info → log, warn → warn, error → error
    expect(captured[0].stream).toBe('log');
    expect(captured[1].stream).toBe('log');
    expect(captured[2].stream).toBe('warn');
    expect(captured[3].stream).toBe('error');
  });

  it('nivel global info → debug es silenciado, info/warn/error pasan', () => {
    setGlobalLogLevel('info');
    const log = createLogger('levels-info');
    log.debug('silenciado');
    log.info('pasa');

    expect(captured.length).toBe(1);
    expect(JSON.parse(captured[0].text).level).toBe('info');
  });

  it('nivel global warn → solo warn/error pasan', () => {
    setGlobalLogLevel('warn');
    const log = createLogger('levels-warn');
    log.debug('no');
    log.info('no');
    log.warn('sí warn');
    log.error('sí error');

    expect(captured.length).toBe(2);
    expect(captured[0].stream).toBe('warn');
    expect(captured[1].stream).toBe('error');
  });

  it('nivel global error → solo error pasa (error a console.error)', () => {
    setGlobalLogLevel('error');
    const log = createLogger('levels-error');
    log.debug('no');
    log.info('no');
    log.warn('no');
    log.error('último');

    expect(captured.length).toBe(1);
    expect(captured[0].stream).toBe('error');
    expect(JSON.parse(captured[0].text).level).toBe('error');
  });

  it('nivel global silent → nada se emite (los 4 niveles filtrados)', () => {
    setGlobalLogLevel('silent');
    const log = createLogger('levels-silent');
    log.debug('no');
    log.info('no');
    log.warn('no');
    log.error('no');

    expect(captured.length).toBe(0);
  });

  it('minLevel por instancia overridea el global (más estricto y más laxo)', () => {
    // Global debug, instancia error → solo error
    const strict = createLogger('inst-strict', 'error');
    strict.debug('no');
    strict.error('sí');
    expect(captured.length).toBe(1);
    expect(JSON.parse(captured[0].text).logger).toBe('inst-strict');

    // Global error, instancia debug → debug pasa para esa instancia
    setGlobalLogLevel('error');
    const verbose = createLogger('inst-verbose', 'debug');
    verbose.debug('pasa por instancia');
    const globalOnly = createLogger('inst-global');
    globalOnly.debug('filtrado por global');
    expect(captured.length).toBe(2);
    expect(JSON.parse(captured[1].text).logger).toBe('inst-verbose');
    expect(JSON.parse(captured[1].text).msg).toBe('pasa por instancia');
  });

  it('setGlobalLogLevel / getGlobalLogLevel round-trip', () => {
    expect(getGlobalLogLevel()).toBe('debug'); // set en beforeEach
    setGlobalLogLevel('warn');
    expect(getGlobalLogLevel()).toBe('warn');
    setGlobalLogLevel('silent');
    expect(getGlobalLogLevel()).toBe('silent');
  });

  it('formato pretty sin argumentos → 1 línea por console.log con [name]', () => {
    setGlobalLogFormat('pretty');
    const log = createLogger('pretty-noargs');
    log.info('línea pretty sin args');

    expect(captured.length).toBe(1);
    expect(captured[0].stream).toBe('log');
    expect(captured[0].text).toContain('INFO');
    expect(captured[0].text).toContain('[pretty-noargs]');
    expect(captured[0].text).toContain('línea pretty sin args');
  });
});

describe('createLogger respeta naming', () => {
  let origLog: typeof console.log;
  let origWarn: typeof console.warn;
  let origError: typeof console.error;

  beforeEach(() => {
    origLog = console.log;
    origWarn = console.warn;
    origError = console.error;
    console.log = () => undefined;
    console.warn = () => undefined;
    console.error = () => undefined;
    setGlobalLogLevel('debug');
  });

  afterEach(() => {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
    setGlobalLogLevel('info');
  });

  it('la propiedad readonly name coincide con el nombre dado', () => {
    const log = createLogger('dojo-cli');
    expect(log.name).toBe('dojo-cli');
    const other = createLogger('sentinel');
    expect(other.name).toBe('sentinel');
  });

  it('dos loggers con distinto nombre son independientes', () => {
    const a = createLogger('a');
    const b = createLogger('b');
    expect(a.name).not.toBe(b.name);
    expect(typeof a.info).toBe('function');
    expect(typeof b.error).toBe('function');
  });
});

describe('Resolución por entorno (module-load)', () => {
  const capture: string[] = [];
  let origLog: typeof console.log;
  let origWarn: typeof console.warn;
  let origError: typeof console.error;

  beforeEach(() => {
    origLog = console.log;
    origWarn = console.warn;
    origError = console.error;
    console.log = (...args: unknown[]) => capture.push(String(args[0]));
    console.warn = (...args: unknown[]) => capture.push(String(args[0]));
    console.error = (...args: unknown[]) => capture.push(String(args[0]));
  });

  afterEach(() => {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
    capture.length = 0;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('LOG_LEVEL válido fija el nivel global inicial de la instancia', async () => {
    vi.resetModules(); // fuerza re-evaluación del módulo (el import estático ya lo cacheó)
    vi.stubEnv('LOG_LEVEL', 'warn');
    const mod = await import('./logger.js');
    expect(mod.getGlobalLogLevel()).toBe('warn');

    mod.setGlobalLogFormat('json');
    const log = mod.createLogger('env-valid');
    log.debug('no');
    log.info('no');
    log.warn('sí');
    expect(capture.length).toBe(1);
    expect(JSON.parse(capture[0]).msg).toBe('sí');
  });

  it('LOG_LEVEL=silent silencia todos los niveles', async () => {
    vi.resetModules();
    vi.stubEnv('LOG_LEVEL', 'silent');
    const mod = await import('./logger.js');
    expect(mod.getGlobalLogLevel()).toBe('silent');

    mod.setGlobalLogFormat('json');
    const log = mod.createLogger('env-silent');
    log.debug('no');
    log.error('tampoco');
    expect(capture.length).toBe(0);
  });

  it('LOG_LEVEL inválido cae al default info (sin crash)', async () => {
    vi.resetModules();
    vi.stubEnv('LOG_LEVEL', 'no-existe');
    const mod = await import('./logger.js');
    expect(mod.getGlobalLogLevel()).toBe('info');
  });

  it('LOG_LEVEL sin definir → default info', async () => {
    vi.resetModules();
    const mod = await import('./logger.js');
    expect(mod.getGlobalLogLevel()).toBe('info');
  });
});

describe('NINJA_LOG_FORMAT por entorno (leído por log, no solo al cargar)', () => {
  let captured: CapturedLine[];
  let origLog: typeof console.log;
  let origWarn: typeof console.warn;
  let origError: typeof console.error;

  beforeEach(() => {
    origLog = console.log;
    origWarn = console.warn;
    origError = console.error;
    captured = captureConsole();
    setGlobalLogFormat(null); // 'auto' → delega en env
    setGlobalLogLevel('debug');
  });

  afterEach(() => {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
    vi.unstubAllEnvs();
    setGlobalLogFormat(null);
    setGlobalLogLevel('info');
  });

  it('NINJA_LOG_FORMAT=pretty fuerza salida de texto aunque stdout no sea TTY', () => {
    vi.stubEnv('NINJA_LOG_FORMAT', 'pretty');
    const log = createLogger('env-format');
    log.info('pretty por env', { k: 1 });

    expect(captured.length).toBe(1);
    expect(captured[0].text).toContain('INFO');
    expect(captured[0].text).toContain('[env-format]');
    expect(() => JSON.parse(captured[0].text)).toThrow();
  });

  it('NINJA_LOG_FORMAT=json fuerza JSONL', () => {
    vi.stubEnv('NINJA_LOG_FORMAT', 'json');
    const log = createLogger('env-format');
    log.info('json por env');

    expect(captured.length).toBe(1);
    const parsed = JSON.parse(captured[0].text);
    expect(parsed.logger).toBe('env-format');
    expect(parsed.msg).toBe('json por env');
  });

  it('NINJA_LOG_FORMAT inválido → auto (json en stdout no TTY)', () => {
    vi.stubEnv('NINJA_LOG_FORMAT', 'no-existe');
    const log = createLogger('env-format');
    log.info('auto');

    expect(captured.length).toBe(1);
    const parsed = JSON.parse(captured[0].text);
    expect(parsed.msg).toBe('auto');
  });
});
