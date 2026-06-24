import { createLogger } from '@ninja/logging';
import { eventBus, createEvent } from '@ninja/events';
import { NormalizedContent } from './normalizer.js';

const logger = createLogger('forge-lab');

export interface QualityScore {
  score: number;
  breakdown: {
    hasTitle: number;
    hasContent: number;
    contentLength: number;
    hasCodeBlocks: number;
    hasExamples: number;
  };
  passed: boolean;
}

const PASS_THRESHOLD = 60;

const POINTS_HAS_TITLE = 15;
const POINTS_HAS_CONTENT = 15;
const POINTS_LENGTH_200 = 20;
const POINTS_LENGTH_500 = 30;
const POINTS_HAS_CODE_BLOCKS = 20;
const POINTS_HAS_EXAMPLES = 15;
const PENALTY_SHORT_CONTENT = 30;

function hasTitle(content: NormalizedContent): boolean {
  return content.title.trim().length > 0;
}

function hasContent(content: NormalizedContent): boolean {
  return content.content.trim().length > 0;
}

function checkContentLength(content: NormalizedContent): number {
  const length = content.content.length;

  if (length > 500) {
    return POINTS_LENGTH_500;
  } else if (length > 200) {
    return POINTS_LENGTH_200;
  }

  return 0;
}

function hasCodeBlocks(content: NormalizedContent): boolean {
  const codeBlockPattern = /```[\s\S]*?```/;
  return codeBlockPattern.test(content.content);
}

function hasExamples(content: NormalizedContent): boolean {
  const examplePatterns = [/\bexample\b/i, /\busage\b/i, /\buso\b/i, /\bejemplo\b/i];

  return examplePatterns.some((pattern) => pattern.test(content.content));
}

function isVeryShort(content: NormalizedContent): boolean {
  return content.content.length < 100;
}

export function scoreContent(content: NormalizedContent): QualityScore {
  logger.info('Scoring content quality', { id: content.id });

  const breakdown = {
    hasTitle: hasTitle(content) ? POINTS_HAS_TITLE : 0,
    hasContent: hasContent(content) ? POINTS_HAS_CONTENT : 0,
    contentLength: checkContentLength(content),
    hasCodeBlocks: hasCodeBlocks(content) ? POINTS_HAS_CODE_BLOCKS : 0,
    hasExamples: hasExamples(content) ? POINTS_HAS_EXAMPLES : 0,
  };

  let totalScore =
    breakdown.hasTitle +
    breakdown.hasContent +
    breakdown.contentLength +
    breakdown.hasCodeBlocks +
    breakdown.hasExamples;

  if (isVeryShort(content)) {
    totalScore -= PENALTY_SHORT_CONTENT;
  }

  totalScore = Math.max(0, Math.min(100, totalScore));

  const passed = totalScore >= PASS_THRESHOLD;

  const score: QualityScore = {
    score: totalScore,
    breakdown,
    passed,
  };

  eventBus.emit(
    createEvent('forgelab.content.scored', 'forge-lab', {
      id: content.id,
      score: totalScore,
      passed,
    })
  );

  logger.debug('Content scored', {
    id: content.id,
    score: totalScore,
    passed,
    breakdown,
  });

  return score;
}
