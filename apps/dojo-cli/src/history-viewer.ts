import { printInfo, printWarning, printDivider } from './display.js';
import { getRuntimeInfo, getActiveRuns } from './runtime-client.js';

/**
 * history-viewer.ts
 *
 * Visor de historial de sesiones y artifacts via API del Kage Runtime.
 * Cuando el Trace Ledger esté expuesto por HTTP, este módulo consumirá
 * su API. Por ahora muestra los runs activos del engine como proxy.
 *
 * Inspiración de patrón: artifacts/sessions viewer de Paperclip.
 */

export interface SessionSummary {
  id: string;
  workspaceId: string;
  status: string;
  createdAt: string;
  agentCount?: number;
  artifactCount?: number;
}

/**
 * Ver historial de sesiones del runtime.
 * Implementación actual: usa /engine/runs como proxy hasta que
 * el Trace Ledger exponga su propia API HTTP.
 */
export async function viewSessionHistory(limit = 10): Promise<void> {
  printInfo(`Cargando historial de sesiones (último ${limit} runs)...`);
  printDivider();

  const runs = await getActiveRuns();

  if (!runs || !Array.isArray(runs) || runs.length === 0) {
    printWarning('No hay sesiones/runs activos registrados.');
    printInfo('Levanta el runtime y ejecuta un build para ver el historial.');
    return;
  }

  const limited = runs.slice(0, limit);

  console.log('');
  console.log('  ID                    | Estado    | Workspace              | Iniciado');
  console.log('  ' + '─'.repeat(80));

  for (const run of limited) {
    const id = (run.id ?? '—').toString().slice(0, 20).padEnd(20);
    const status = (run.status ?? '—').padEnd(9);
    const ws = (run.workspaceId ?? '—').slice(0, 20).padEnd(22);
    const ts = run.startedAt ? new Date(run.startedAt).toLocaleString('es') : '—';
    console.log(`  ${id} | ${status} | ${ws} | ${ts}`);
  }

  console.log('');
  printInfo(`Mostrando ${limited.length} de ${runs.length} runs totales.`);
}

/**
 * Ver historial de artifacts.
 * Implementación real pendiente de la exposición HTTP de Trace Ledger (Fase 2.5+).
 */
export async function viewArtifactHistory(limit = 10): Promise<void> {
  printInfo(`Historial de artifacts (último ${limit}):`);
  printDivider();

  // TODO (Fase 4 / UI): exponer /api/artifacts desde Kage Runtime y consumir aquí
  const info = await getRuntimeInfo();
  if (!info) {
    printWarning('Runtime no disponible. Levanta el servidor con: ninja start');
    return;
  }

  printInfo('Trace Ledger conectado. Exposición de artifacts via HTTP disponible en Fase 6 (UI Base).');
  printInfo('Los artifacts se almacenan localmente en la base SQLite del Trace Ledger.');
}
