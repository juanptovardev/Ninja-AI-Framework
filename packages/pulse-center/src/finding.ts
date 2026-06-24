/**
 * @ninja/pulse-center — finding.ts
 * CRUD de findings (hallazgos/alertas) en memoria.
 * Persistencia abstracta - será reemplazada por @ninja/storage en futuras iteraciones.
 */

import {
  type Finding,
  type FindingType,
  type FindingSeverity,
  type FindingFilter,
  FindingSchema,
} from './schema.js';

// ============================================================================
// Almacenamiento en Memoria
// ============================================================================

/**
 * Store interno para findings.
 * En producción será reemplazado por persistencia en @ninja/storage.
 */
const findingsStore = new Map<string, Finding>();

// ============================================================================
// Utilidades
// ============================================================================

/**
 * Genera un UUID v4 para identificadores.
 * Fallback para entornos sin crypto.randomUUID.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback simple
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// ============================================================================
// Operaciones CRUD
// ============================================================================

/**
 * Datos necesarios para crear un nuevo finding.
 */
export interface OpenFindingInput {
  /** Tipo de finding */
  type: FindingType;
  /** Nivel de severidad */
  severity: FindingSeverity;
  /** Mensaje descriptivo del problema */
  message: string;
  /** ID del agente asociado (opcional) */
  agentId?: string;
}

/**
 * Abre (crea) un nuevo finding en el sistema.
 *
 * @param data - Datos del finding a crear
 * @returns El Finding creado y validado
 * @throws Error si los datos no pasan la validación del schema
 */
export function openFinding(data: OpenFindingInput): Finding {
  // Construir el objeto finding
  const findingData = {
    id: generateId(),
    type: data.type,
    severity: data.severity,
    message: data.message,
    agentId: data.agentId,
    timestamp: Date.now(),
    resolved: false,
  };

  // Validar contra el schema Zod
  const validation = FindingSchema.safeParse(findingData);

  if (!validation.success) {
    throw new Error(
      `Invalid finding data: ${validation.error.issues.map((e) => e.message).join(', ')}`
    );
  }

  const finding = validation.data;

  // Almacenar en memoria
  findingsStore.set(finding.id, finding);

  return finding;
}

/**
 * Resuelve un finding existente por su ID.
 *
 * @param id - ID del finding a resolver
 * @returns El Finding actualizado, o null si no existe
 */
export function resolveFinding(id: string): Finding | null {
  const finding = findingsStore.get(id);

  if (!finding) {
    return null;
  }

  // Crear copia con resolved = true
  const resolvedFinding: Finding = {
    ...finding,
    resolved: true,
  };

  // Actualizar en el store
  findingsStore.set(id, resolvedFinding);

  return resolvedFinding;
}

/**
 * Obtiene un finding específico por su ID.
 *
 * @param id - ID del finding
 * @returns El Finding encontrado, o undefined si no existe
 */
export function getFindingById(id: string): Finding | undefined {
  return findingsStore.get(id);
}

/**
 * Obtiene todos los findings abiertos (no resueltos).
 *
 * @returns Array de findings abiertos, ordenados por timestamp descendente (más reciente primero)
 */
export function getOpenFindings(): Finding[] {
  const openFindings: Finding[] = [];

  for (const finding of findingsStore.values()) {
    if (!finding.resolved) {
      openFindings.push(finding);
    }
  }

  // Ordenar por timestamp descendente
  return openFindings.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Obtiene todos los findings resueltos.
 *
 * @returns Array de findings resueltos, ordenados por timestamp descendente
 */
export function getResolvedFindings(): Finding[] {
  const resolvedFindings: Finding[] = [];

  for (const finding of findingsStore.values()) {
    if (finding.resolved) {
      resolvedFindings.push(finding);
    }
  }

  return resolvedFindings.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Obtiene findings con filtros opcionales.
 *
 * @param filter - Filtros a aplicar (type, severity, agentId, resolved, since, until)
 * @returns Array de findings que cumplen los filtros, ordenados por timestamp descendente
 */
export function getFindings(filter?: FindingFilter): Finding[] {
  let findings = Array.from(findingsStore.values());

  if (!filter) {
    // Sin filtros: retornar todos ordenados
    return findings.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Aplicar filtros
  if (filter.type !== undefined) {
    findings = findings.filter((f) => f.type === filter.type);
  }

  if (filter.severity !== undefined) {
    findings = findings.filter((f) => f.severity === filter.severity);
  }

  if (filter.agentId !== undefined) {
    findings = findings.filter((f) => f.agentId === filter.agentId);
  }

  if (filter.resolved !== undefined) {
    findings = findings.filter((f) => f.resolved === filter.resolved);
  }

  if (filter.since !== undefined) {
    findings = findings.filter((f) => f.timestamp >= filter.since!);
  }

  if (filter.until !== undefined) {
    findings = findings.filter((f) => f.timestamp <= filter.until!);
  }

  // Ordenar por timestamp descendente
  return findings.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Cuenta la cantidad de findings según filtros.
 *
 * @param filter - Filtros opcionales
 * @returns Número de findings que cumplen los criterios
 */
export function countFindings(filter?: FindingFilter): number {
  return getFindings(filter).length;
}

/**
 * Elimina un finding por su ID.
 * Útil para limpieza manual o tests.
 *
 * @param id - ID del finding a eliminar
 * @returns true si se eliminó, false si no existía
 */
export function deleteFinding(id: string): boolean {
  return findingsStore.delete(id);
}

/**
 * Limpia todos los findings del store.
 * Útil para tests o reset del sistema.
 * ¡CUIDADO! Esta operación es irreversible.
 */
export function clearFindings(): void {
  findingsStore.clear();
}

/**
 * Obtiene estadísticas de findings.
 *
 * @returns Objeto con conteos por estado y severidad
 */
export function getFindingStats(): {
  total: number;
  open: number;
  resolved: number;
  bySeverity: {
    info: number;
    warning: number;
    critical: number;
  };
  byType: {
    performance: number;
    stability: number;
    context: number;
    system: number;
  };
} {
  const allFindings = Array.from(findingsStore.values());
  const openFindings = allFindings.filter((f) => !f.resolved);
  const resolvedFindings = allFindings.filter((f) => f.resolved);

  const bySeverity = {
    info: allFindings.filter((f) => f.severity === 'info').length,
    warning: allFindings.filter((f) => f.severity === 'warning').length,
    critical: allFindings.filter((f) => f.severity === 'critical').length,
  };

  const byType = {
    performance: allFindings.filter((f) => f.type === 'performance').length,
    stability: allFindings.filter((f) => f.type === 'stability').length,
    context: allFindings.filter((f) => f.type === 'context').length,
    system: allFindings.filter((f) => f.type === 'system').length,
  };

  return {
    total: allFindings.length,
    open: openFindings.length,
    resolved: resolvedFindings.length,
    bySeverity,
    byType,
  };
}
