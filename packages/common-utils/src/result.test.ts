import { describe, it, expect } from 'vitest';
import { err, isErr, isOk, map, ok } from './result.js';

describe('Result (WP-D1)', () => {
  it('ok() crea un resultado Ok con value', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(42);
  });

  it('err() crea un resultado Err con error', () => {
    const result = err(new Error('boom'));
    expect(result.ok).toBe(false);
    if (isErr(result)) {
      expect(result.error.message).toBe('boom');
    }
  });

  it('ok() no expone error y err() no expone value', () => {
    expect('error' in ok('x')).toBe(false);
    expect('value' in err(new Error('e'))).toBe(false);
  });

  it('isOk()/isErr() discriminan correctamente', () => {
    const okResult = ok('data');
    const errResult = err('failure');
    expect(isOk(okResult)).toBe(true);
    expect(isErr(okResult)).toBe(false);
    expect(isOk(errResult)).toBe(false);
    expect(isErr(errResult)).toBe(true);
  });

  it('map() transforma el valor de un Ok', () => {
    expect(map(ok(2), (n: number) => n * 3).value).toBe(6);
  });

  it('map() deja el Err intacto', () => {
    const source = err(new Error('kaput'));
    const mapped = map(source, (n: number) => n * 3);
    expect(isErr(mapped)).toBe(true);
    if (isErr(mapped)) {
      expect(mapped.error.message).toBe('kaput');
    }
  });

  it('map() anida correctamente en cadenas', () => {
    const result = map(
      map(ok(3), (n) => n + 1),
      (n) => n * 2
    );
    expect(result.value).toBe(8);
  });

  it('el discriminante ok permite acceder a value de forma segura', () => {
    const result = ok('payload');
    if (isOk(result)) {
      expect(result.value).toBe('payload');
    }
  });
});
