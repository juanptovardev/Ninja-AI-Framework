import { describe, expect, it } from 'vitest';
import { deepFreeze } from './deep-freeze.js';

describe('deepFreeze (WP-D1)', () => {
  it('congela objetos anidados recursivamente', () => {
    const obj = { a: 1, nested: { b: 2, deeper: { c: 3 } } };
    const frozen = deepFreeze(obj);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.nested)).toBe(true);
    expect(Object.isFrozen(frozen.nested.deeper)).toBe(true);
    expect(() => {
      frozen.nested.b = 99;
    }).toThrow(TypeError);
  });

  it('congela arrays, incluidos sus elementos', () => {
    const arr = [{ x: 1 }, [2, 3]];
    const frozen = deepFreeze(arr);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen[0])).toBe(true);
    expect(Object.isFrozen(frozen[1])).toBe(true);
    expect(() => {
      (frozen as unknown as number[]).push(4);
    }).toThrow(TypeError);
  });

  it('devuelve primitivos sin modificarlos', () => {
    expect(deepFreeze(42)).toBe(42);
    expect(deepFreeze('text')).toBe('text');
    expect(deepFreeze(null)).toBeNull();
    expect(deepFreeze(undefined)).toBeUndefined();
    expect(deepFreeze(true)).toBe(true);
  });

  it('tolera ciclos sin recursión infinita', () => {
    const nodeA: Record<string, unknown> = {};
    const nodeB: Record<string, unknown> = { a: nodeA };
    nodeA.b = nodeB;
    const frozen = deepFreeze(nodeA);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(nodeB)).toBe(true);
  });

  it('idempotente sobre objetos ya congelados', () => {
    const obj = { a: { b: 1 } };
    const frozen1 = deepFreeze(obj);
    const frozen2 = deepFreeze(frozen1);
    expect(frozen2).toBe(frozen1);
  });

  it('congela funciones y sus propiedades', () => {
    const fn = Object.assign(() => 'r', { meta: { label: 'x' } });
    const frozen = deepFreeze(fn);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.meta)).toBe(true);
  });

  it('congela Map y Set junto a sus valores', () => {
    const map = new Map<string, { nested: number }>([['k', { nested: 1 }]]);
    const set = new Set<{ nested: number }>([{ nested: 2 }]);
    const frozenMap = deepFreeze(map);
    const frozenSet = deepFreeze(set);
    expect(Object.isFrozen(frozenMap)).toBe(true);
    expect(Object.isFrozen(frozenSet)).toBe(true);
    expect(Object.isFrozen(map.get('k'))).toBe(true);
    const setEntry = [...set][0];
    expect(Object.isFrozen(setEntry)).toBe(true);
  });

  it('el tipo de retorno es readonly (compile-time)', () => {
    const frozen = deepFreeze({ a: 1 });
    const readonlyValue: Readonly<{ a: number }> = frozen;
    expect(readonlyValue.a).toBe(1);
  });
});
