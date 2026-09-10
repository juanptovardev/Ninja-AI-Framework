export function deepFreeze<T>(value: T): Readonly<T> {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return value;
  }
  if (Object.isFrozen(value)) return value;

  if (value instanceof Map) {
    Object.freeze(value);
    value.forEach((entryValue) => {
      deepFreeze(entryValue);
    });
    return value as Readonly<T>;
  }
  if (value instanceof Set) {
    Object.freeze(value);
    value.forEach((entryValue) => {
      deepFreeze(entryValue);
    });
    return value as Readonly<T>;
  }

  Object.freeze(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value as Readonly<T>;
}
