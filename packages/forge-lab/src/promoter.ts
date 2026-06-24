import { createLogger } from '@ninja/logging';
import { eventBus, createEvent } from '@ninja/events';
import { NormalizedContent } from './normalizer.js';
import { QualityScore } from './quality-scorer.js';
import { ArtifactRepository } from '@ninja/trace-ledger';
import type { ArtifactType } from '@ninja/trace-ledger';

const logger = createLogger('forge-lab');

export interface PromotionResult {
  promoted: boolean;
  reason: string;
  contentId?: string;
  artifactId?: string;
}

function mapArtifactType(contentType: NormalizedContent['type']): ArtifactType {
  switch (contentType) {
    case 'skill':
      return 'template';
    case 'workflow':
      return 'plan';
    case 'template':
      return 'template';
    case 'pattern':
      return 'code';
    default:
      return 'other';
  }
}

export class LabPromoter {
  constructor(
    private readonly artifactRepo: ArtifactRepository,
    private readonly runId: string,
    private readonly eventBus: any,
    private readonly logger: ReturnType<typeof createLogger>
  ) {}

  async promoteContent(content: NormalizedContent, score: QualityScore): Promise<PromotionResult> {
    this.logger.info('Evaluating content for promotion', { id: content.id });

    if (!score.passed) {
      const reason = 'quality_score_too_low';

      this.eventBus.emit(
        createEvent('forgelab.content.rejected', 'forge-lab', {
          id: content.id,
          reason,
        })
      );

      this.logger.info('Content rejected', {
        id: content.id,
        reason,
        score: score.score,
      });

      return {
        promoted: false,
        reason,
      };
    }

    // Create artifact in database
    const artifact = this.artifactRepo.create({
      runId: this.runId,
      type: mapArtifactType(content.type),
      name: content.title,
      content: content.content,
    });

    // Emit promoted event with real artifact ID
    this.eventBus.emit(
      createEvent('forgelab.content.promoted', 'forge-lab', {
        id: artifact.id,
        artifactId: artifact.id,
        type: content.type,
        origin: content.origin.origin,
      })
    );

    this.logger.info('Content promoted', {
      id: content.id,
      artifactId: artifact.id,
      type: content.type,
      score: score.score,
    });

    return {
      promoted: true,
      reason: 'passed_quality_threshold',
      contentId: artifact.id,
      artifactId: artifact.id,
    };
  }
}

function generateContentId(title: string): string {
  const hash = title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);

  return `forgelab-${Date.now()}-${hash}`;
}

/**
 * @deprecated Use LabPromoter class instead for database persistence
 */
export function promoteContent(content: NormalizedContent, score: QualityScore): PromotionResult {
  logger.warn('Using deprecated promoteContent function - migrate to LabPromoter class for full functionality');
  
  logger.info('Evaluating content for promotion', { id: content.id });

  if (!score.passed) {
    const reason = 'quality_score_too_low';

    eventBus.emit(
      createEvent('forgelab.content.rejected', 'forge-lab', {
        id: content.id,
        reason,
      })
    );

    logger.info('Content rejected', {
      id: content.id,
      reason,
      score: score.score,
    });

    return {
      promoted: false,
      reason,
    };
  }

  const contentId = generateContentId(content.title);

  eventBus.emit(
    createEvent('forgelab.content.promoted', 'forge-lab', {
      id: contentId,
      type: content.type,
      origin: content.origin.origin,
    })
  );

  logger.info('Content promoted', {
    id: content.id,
    contentId,
    type: content.type,
    score: score.score,
  });

  return {
    promoted: true,
    reason: 'passed_quality_threshold',
    contentId,
  };
}
