import { printInfo, printWarning, printDivider } from './display.js';
import { getActiveRuns, getArtifacts } from './runtime-client.js';

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
 * Ver historial de artifacts via /api/artifacts del Kage Runtime.
 */
export async function viewArtifactHistory(limit = 10): Promise<void> {
  printInfo(`Cargando historial de artifacts (último ${limit})...`);
  printDivider();

  const artifacts = await getArtifacts(limit);

  if (!artifacts || artifacts.length === 0) {
    printWarning('No hay artifacts registrados.');
    printInfo('Ejecuta un build para generar artifacts.');
    return;
  }

  console.log('');
  console.log('  ID                    | Tipo       | Run ID               | Creado');
  console.log('  ' + '─'.repeat(80));

  for (const artifact of artifacts) {
    const id = (artifact.id ?? '—').toString().slice(0, 20).padEnd(20);
    const type = (artifact.type ?? '—').padEnd(10);
    const runId = (artifact.runId ?? artifact.sessionId ?? '—').toString().slice(0, 20).padEnd(20);
    const ts = artifact.createdAt ? new Date(artifact.createdAt).toLocaleString('es') : '—';
    console.log(`  ${id} | ${type} | ${runId} | ${ts}`);
  }

  console.log('');
  printInfo(`Mostrando ${artifacts.length} artifacts.`);
}
