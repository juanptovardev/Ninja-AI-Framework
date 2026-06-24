/**
 * @ninja/learning-loop — promoter.ts
 * LearningPromoter: Promueve ejecuciones exitosas a plantillas reutilizables.
 *
 * Responsabilidades:
 * - Evalúa si un candidato debe ser promocionado según EvaluationReport
 * - Persiste ejecuciones exitosas en Engram con tag "promoted-template"
 * - Emite eventos de promoción al EventBus
 */

import type { ID, Result } from '@ninja/contracts';
import { ok, err } from '@ninja/contracts';
import { eventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';
import type { EngramClient } from '@ninja/integrations-engram';
import type { MemoryEntry } from '@ninja/integrations-engram';
import type {
  LearningCandidate,
  EvaluationReport,
  LearningCandidatePromotedPayload,
} from './schema.js';

const log = createLogger('learning-loop:promoter');

// ---------------------------------------------------------------------------
// LearningPromoter
// ---------------------------------------------------------------------------

/**
 * Promotor de aprendizaje que persiste ejecuciones exitosas como plantillas.
 */
export class LearningPromoter {
  private readonly engramClient: EngramClient;
  private readonly eventBus: typeof eventBus;
  private readonly log: ReturnType<typeof createLogger>;

  constructor(engramClient: EngramClient, eventBusInstance?: typeof eventBus) {
    this.engramClient = engramClient;
    this.eventBus = eventBusInstance ?? eventBus;
    this.log = log;
  }

  /**
   * Promueve un candidato a plantilla si cumple los criterios de calidad.
   *
   * @param report    Reporte de evaluación del candidato
   * @param candidate Candidato a promocionar
   * @returns Result<void, Error> - ok() si se promocionó o no era necesario, err() si falló
   */
  async promote(
    report: EvaluationReport,
    candidate: LearningCandidate
  ): Promise<Result<void, Error>> {
    if (!report.recommendPromotion) {
      this.log.info('Candidate not recommended for promotion', {
        candidateId: report.candidateId,
        totalScore: report.totalScore,
      });
      return ok(undefined);
    }

    try {
      const memoryEntry = this.buildMemoryEntry(candidate, report);
      const storeResult = await this.engramClient.store(memoryEntry);

      if (!storeResult.success) {
        this.log.error('Failed to store promoted candidate', {
          candidateId: report.candidateId,
          error: storeResult.error.message,
        });
        return err(storeResult.error);
      }

      await this.emitPromotionEvent(candidate);
      this.log.info('Candidate promoted successfully', {
        candidateId: report.candidateId,
        taskType: candidate.taskType,
        runId: candidate.runId,
      });

      return ok(undefined);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log.error('Unexpected error during promotion', {
        candidateId: report.candidateId,
        error: errorMessage,
      });
      return err(new Error(`Promotion failed: ${errorMessage}`));
    }
  }

  // ---------------------------------------------------------------------------
  // Métodos Privados
  // ---------------------------------------------------------------------------

  /**
   * Construye una MemoryEntry para persistir en Engram.
   */
  private buildMemoryEntry(
    candidate: LearningCandidate,
    report: EvaluationReport
  ): Omit<MemoryEntry, 'id'> {
    const content = JSON.stringify({
      taskType: candidate.taskType,
      result: candidate.result,
      evaluation: {
        totalScore: report.totalScore,
        criteria: report.criteria,
      },
    });

    const tokenCount = this.estimateTokens(content);

    return {
      sessionId: candidate.runId,
      agentId: candidate.agentId,
      content,
      compressed: false,
      tokenCount,
      timestamp: new Date().toISOString(),
      tags: ['promoted-template', candidate.taskType],
    };
  }

  /**
   * Emite el evento de promoción al EventBus.
   */
  private async emitPromotionEvent(candidate: LearningCandidate): Promise<void> {
    const payload: LearningCandidatePromotedPayload = {
      candidateId: candidate.runId,
      taskType: candidate.taskType,
      runId: candidate.runId,
      agentId: candidate.agentId,
    };

    const event = createEvent('learning.candidate.promoted', 'learning-loop', payload);

    this.eventBus.emit(event);
  }

  /**
   * Estima el número de tokens de un texto.
   * Aproximación simple: 1 token ≈ 4 caracteres.
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
