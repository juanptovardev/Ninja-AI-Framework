/**
 * @ninja/contracts — common.ts
 * Tipos utilitarios compartidos en todo el sistema Ninja AI Framework.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Alias para IDs únicos del sistema (string UUID o similar). */
export type ID = string;

/** Alias para timestamps en formato ISO 8601. */
export type Timestamp = string;

// ---------------------------------------------------------------------------
// Result pattern
// ---------------------------------------------------------------------------

/** Resultado exitoso. */
export interface Ok<T> {
  readonly success: true;
  readonly data: T;
}

/** Resultado con error. */
export interface Err<E = Error> {
  readonly success: false;
  readonly error: E;
}

/**
 * Union discriminada para operaciones que pueden fallar.
 * Uso: `Result<MiTipo>` o `Result<MiTipo, MiError>`
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

/** Crea un resultado exitoso. */
export function ok<T>(data: T): Ok<T> {
  return { success: true, data };
}

/** Crea un resultado de error. */
export function err<E = Error>(error: E): Err<E> {
  return { success: false, error };
}
