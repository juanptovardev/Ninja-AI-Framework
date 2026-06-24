/**
 * @ninja/contracts — index.ts
 * Barrel de exportaciones públicas del paquete de contratos del Ninja AI Framework.
 *
 * Importa desde aquí en cualquier otro paquete:
 *   import { NinjaEvent, RuntimeStatus, Result } from '@ninja/contracts';
 */

// Tipos utilitarios transversales
export * from './common.js';

// Contratos del Kage Runtime
export * from './runtime.js';

// Contratos del sistema de eventos
export * from './events.js';

// Contratos del motor Kage
export * from './engine.js';

// Contratos de integraciones (Fase 8)
export * from './integrations.js';
