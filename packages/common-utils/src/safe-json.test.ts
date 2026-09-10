import { describe, expect, it } from 'vitest';
import { isErr, isOk } from './result.js';
import { JsonParseError, safeJsonParse } from './safe-json.js';

interface User {
  id: number;
  name: string;
}

describe('safeJsonParse (WP-D1)', () => {
  it('parsea JSON válido a Result Ok', () => {
    const result = safeJsonParse<User>('{"id":1,"name":"ana"}');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({ id: 1, name: 'ana' });
    }
  });

  it('parsea valores escalares', () => {
    expect(safeJsonParse<number>('42').value).toBe(42);
    expect(safeJsonParse<string>('"str"').value).toBe('str');
    expect(safeJsonParse<null>('null').value).toBeNull();
    expect(safeJsonParse<boolean>('true').value).toBe(true);
    expect(safeJsonParse<unknown[]>('[1,2,3]').value).toEqual([1, 2, 3]);
  });

  it('no tira ante JSON inválido y devuelve Err sintáctico', () => {
    const result = safeJsonParse<User>('{"id":1,');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(JsonParseError);
      expect(result.error.kind).toBe('syntax');
      expect(result.error.position).toBeGreaterThan(-1);
    }
  });

  it('devuelve Err empty-input para cadenas vacías o de solo espacios', () => {
    for (const blank of ['', '   ', '\n\t']) {
      const result = safeJsonParse(blank);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.kind).toBe('empty-input');
        expect(result.error.message).toContain('empty');
      }
    }
  });

  it('devuelve el valor parseado cuando el fallback también está presente', () => {
    const fallback: User = { id: 0, name: 'fallback' };
    expect(safeJsonParse<User, User>('{"id":7,"name":"luis"}', fallback)).toEqual({
      id: 7,
      name: 'luis',
    });
  });

  it('devuelve el fallback ante JSON inválido', () => {
    const fallback: User = { id: 0, name: 'fallback' };
    expect(safeJsonParse<User, User>('not-json', fallback)).toBe(fallback);
  });

  it('devuelve el fallback ante input vacío', () => {
    const fallback = 'default';
    expect(safeJsonParse<string, string>('', fallback)).toBe('default');
  });

  it('nunca lanza: JSON.parse sobre inputs peligrosos devuelve Err', () => {
    const nasty = ['{', 'undefined', 'NaN', '{"a":}', '[1,,2]', '\\"', '01', '{<script>}'];
    for (const input of nasty) {
      const result = safeJsonParse(input);
      expect(isErr(result)).toBe(true);
    }
  });

  it('conserva la profundidad de objetos anidados', () => {
    const result = safeJsonParse<{ deep: { list: number[] } }>('{"deep":{"list":[1,2]}}');
    if (isOk(result)) {
      expect(result.value.deep.list).toEqual([1, 2]);
    }
  });
});
