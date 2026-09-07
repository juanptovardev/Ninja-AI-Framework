/**
 * apps/kage-runtime — shutdown-registry.ts
 * Registro ordenado de pasos de cierre (WP-C4a / F2.4).
 *
 * Los componentes del runtime registran aquí sus hooks de cierre en el orden
 * dictado por el plan (WS/HTTP → servicios → memoria → DB última) y
 * lifecycle.shutdown() los ejecuta secuencialmente, tolerando fallos por paso.
 *
 * Módulo sin dependencias para evitar ciclos de import entre server.ts y lifecycle.ts.
 */

export interface ShutdownStep {
  /** Nombre legible del paso (aparece en logs y en el array de retorno de shutdown()). */
  readonly name: string;
  /** Hook de cierre. Puede ser síncrono o asíncrono. */
  readonly close: () => void | Promise<void>;
}

const steps: ShutdownStep[] = [];

/** Registra un paso de cierre (se ejecuta en orden de registro). */
export function registerShutdownStep(name: string, close: () => void | Promise<void>): void {
  steps.push({ name, close });
}

/** Pasos registrados en orden (solo lectura). */
export function getShutdownSteps(): readonly ShutdownStep[] {
  return steps;
}

/** Limpia el registro. createServer() lo llama al inicio para ser idempotente en tests. */
export function clearShutdownSteps(): void {
  steps.length = 0;
}
