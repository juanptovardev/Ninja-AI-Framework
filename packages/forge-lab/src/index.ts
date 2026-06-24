/**
 * @ninja/forge-lab - index.ts
 * Barrel export for the Forge Lab package.
 */

export type {
  SourceRepo,
  RepoAnalysis,
  QualitySignals,
  ExtractedContent,
  ContentMetadata,
  ExtractionOptions,
  ContentTarget,
} from './schema.js';

export { RepoAnalyzer, ForgeLabError, GitHubApiError, RateLimitError } from './repo-analyzer.js';

export { ContentExtractor, ContentExtractionError } from './content-extractor.js';

export type { NormalizedContent } from './normalizer.js';
export { normalizeContent } from './normalizer.js';

export type { QualityScore } from './quality-scorer.js';
export { scoreContent } from './quality-scorer.js';

export type { PromotionResult } from './promoter.js';
export { promoteContent, LabPromoter } from './promoter.js';
