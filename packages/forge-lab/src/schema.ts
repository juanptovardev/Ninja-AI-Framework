import { ID } from '@ninja/contracts';

// ---------------------------------------------------------------------------
// Types for Forge Lab Domain
// ---------------------------------------------------------------------------

export type ContentTarget = 'skill' | 'workflow' | 'template' | 'pattern';

export interface SourceRepo {
  /** Full URL of the GitHub repository */
  url: string;
  /** Repository name */
  name: string;
  /** Repository owner/organization */
  owner: string;
  /** Repository description (if available) */
  description?: string;
  /** Number of stars (if available) */
  stars?: number;
  /** Primary language (if detected) */
  language?: string;
  /** Repository ID */
  id: ID;
}

export interface QualitySignals {
  /** Whether the repository uses TypeScript */
  hasTypes: boolean;
  /** Whether the repository has linting configuration */
  hasLinting: boolean;
  /** Whether the repository has CI configuration */
  hasCI: boolean;
  /** Whether the repository has tests */
  hasTests: boolean;
  /** Whether the repository has a README */
  hasReadme: boolean;
  /** License type if detected */
  licenseType?: string;
  /** Whether it's a modern package (uses pnpm/yarn) */
  isModernPackage: boolean;
}

export interface RepoAnalysis {
  /** The repository being analyzed */
  repo: SourceRepo;
  /** Repository structure (file/folder names) */
  structure: string[];
  /** Total number of files in the repository */
  fileCount: number;
  /** Main language detected */
  mainLanguage: string;
  /** Whether the repository has a README */
  hasReadme: boolean;
  /** Whether the repository has tests */
  hasTests: boolean;
  /** Quality signals detected */
  qualitySignals: QualitySignals;
  /** When the analysis was performed */
  analyzedAt: Date;
}

export interface ContentMetadata {
  /** Origin of the content (repository URL) */
  origin: string;
  /** Direct URL to the original content */
  originUrl: string;
  /** When the content was extracted */
  extractedAt: Date;
  /** Language of the content */
  language: string;
}

export interface ExtractedContent {
  /** Path to the source file */
  sourcePath: string;
  /** Target type classification */
  targetType: ContentTarget;
  /** Raw content of the file */
  rawContent: string;
  /** Metadata about the extraction */
  metadata: ContentMetadata;
}

export interface ExtractionOptions {
  /** Target types to extract */
  targetTypes: ContentTarget[];
  /** Maximum number of files to extract */
  maxFiles?: number;
  /** File extensions to include */
  extensions?: string[];
}
