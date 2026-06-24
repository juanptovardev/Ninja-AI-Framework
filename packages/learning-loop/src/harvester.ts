/**
 * @ninja/learning-loop — harvester.ts
 * Recolector de runs exitosos desde Trace Ledger.
 * Lee runs completados y los convierte en candidatos de aprendizaje.
 */

import { eventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';
import { RunRepository, ArtifactRepository, SessionRepository } from '@ninja/trace-ledger';
import type { Run, RunStatus } from '@ninja/trace-ledger';
import type { ID, Timestamp } from '@ninja/contracts';
import type { LearningCandidate, LearningHarvestCompletedPayload } from './schema.js';

const log = createLogger('learning-harvester');

interface LearningHarvesterDeps {
  runRepository: RunRepository;
  artifactRepository: ArtifactRepository;
  sessionRepository: SessionRepository;
  eventBus?: typeof eventBus;
}

/**
 * LearningHarvester
 *
 * Responsable de:
 * - Leer runs completados del Trace Ledger
 * - Filtrar solo runs con status 'completed'
 * - Convertir runs a LearningCandidates
 * - Emitir evento 'learning.harvest.completed'
 */
export class LearningHarvester {
  private runRepository: RunRepository;
  private artifactRepository: ArtifactRepository;
  private sessionRepository: SessionRepository;
  private eventBus: typeof eventBus;

  constructor(deps: LearningHarvesterDeps) {
    this.runRepository = deps.runRepository;
    this.artifactRepository = deps.artifactRepository;
    this.sessionRepository = deps.sessionRepository;
    this.eventBus = deps.eventBus ?? eventBus;
  }

  /**
   * Cosecha runs exitosos desde una fecha.
   * @param sinceDays Días hacia atrás para buscar (default: 7)
   * @returns Array de LearningCandidates
   */
  async harvest(sinceDays?: number): Promise<LearningCandidate[]> {
    const days = sinceDays ?? 7;
    const sinceTimestamp = this.calculateSinceTimestamp(days);

    log.info('Starting harvest', { sinceDays: days, sinceTimestamp });

    // Obtener todos los runs completados desde el timestamp
    const completedRuns = await this.fetchCompletedRuns(sinceTimestamp);

    log.info('Runs fetched', { completed: completedRuns.length });

    // Convertir runs a candidatos
    const candidates = await Promise.all(completedRuns.map((run) => this.runToCandidate(run)));

    // Emitir evento de cosecha completada
    this.emitHarvestCompleted(candidates.length);

    log.info('Harvest completed', { candidatesCount: candidates.length });

    return candidates;
  }

  /**
   * Calcula el timestamp de inicio basado en días.
   */
  private calculateSinceTimestamp(days: number): Timestamp {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  }

  /**
   * Obtiene runs completados desde el repositorio.
   * Usa findAll() heredado de BaseRepository y filtra por status y fecha.
   */
  private async fetchCompletedRuns(sinceTimestamp: Timestamp): Promise<Run[]> {
    const allRuns = this.runRepository.findAll();

    return allRuns.filter((run) => {
      // Filtrar por status 'completed' y fecha posterior a sinceTimestamp
      const isCompleted = run.status === 'completed';
      const isAfter = run.updatedAt >= sinceTimestamp;
      return isCompleted && isAfter;
    });
  }

  /**
   * Convierte un Run a LearningCandidate.
   * Busca el artifact asociado para obtener el resultado y sesión para contexto.
   */
  private async runToCandidate(run: Run): Promise<LearningCandidate> {
    // Obtener artifacts del run para extraer el resultado
    const artifacts = this.artifactRepository.findByRunId(run.id);

    // El resultado principal es la concatenación de contenidos relevantes
    const result = artifacts
      .filter((a) => a.type === 'code' || a.type === 'template' || a.type === 'plan')
      .map((a) => a.content)
      .join('\n---\n')
      .slice(0, 2000); // Limitar a 2000 chars para el candidato

    // Obtener la sesión para extraer contexto
    const session = this.sessionRepository.findById(run.sessionId);

    // El agentId puede derivarse del contexto o usar un default
    // Para ahora, usamos el sessionId como proxy del agent
    const agentId = session?.workspaceId ?? run.sessionId;

    return {
      runId: run.id,
      agentId,
      taskType: run.mode,
      result: result || '[No artifacts with code/template/plan]',
      qualityScore: 0, // Score inicial, será calculado por el evaluador (Turno 2)
    };
  }

  /**
   * Emite el evento 'learning.harvest.completed'.
   */
  private emitHarvestCompleted(count: number): void {
    const payload: LearningHarvestCompletedPayload = {
      count,
      harvestedAt: new Date().toISOString(),
    };
    const evt = createEvent('learning.harvest.completed', 'learning-loop', payload);
    this.eventBus.emit(evt);
  }
}

// Singleton export
export const learningHarvester = new LearningHarvester({
  runRepository: {} as RunRepository, // Placeholder - se inyectará en producción
  artifactRepository: {} as ArtifactRepository,
  sessionRepository: {} as SessionRepository,
});
