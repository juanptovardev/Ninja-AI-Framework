import { createLogger } from '@ninja/logging';
import { eventBus, createEvent } from '@ninja/events';
import { ExtractedContent, ContentMetadata } from './schema.js';

const logger = createLogger('forge-lab');

export interface NormalizedContent {
  id: string;
  type: 'skill' | 'workflow' | 'template' | 'pattern';
  title: string;
  content: string;
  tags: string[];
  origin: ContentMetadata;
  normalizedAt: Date;
}

function generateDeterministicId(sourcePath: string, origin: ContentMetadata): string {
  const hash = simpleHash(sourcePath + origin.originUrl);
  return `norm-${hash}-${Date.now().toString(36)}`;
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}

function cleanMarkdown(content: string): string {
  let cleaned = content;

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  cleaned = cleaned.replace(/^(#{1,6})\s*(.+)$/gm, '$1 $2');

  cleaned = cleaned.replace(/^(\s*)$/gm, '');

  return cleaned.trim();
}

function extractTitle(content: string, sourcePath: string): string {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match && h1Match[1]) {
    return h1Match[1].trim();
  }

  const fileName = sourcePath.split('/').pop() || sourcePath;
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');

  return nameWithoutExt
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function extractTags(content: string): string[] {
  const wordFrequency = new Map<string, number>();

  const words = content
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 4);

  const stopWords = new Set([
    'about',
    'above',
    'after',
    'again',
    'against',
    'being',
    'below',
    'between',
    'both',
    'could',
    'does',
    'doing',
    'during',
    'each',
    'either',
    'enough',
    'every',
    'first',
    'following',
    'further',
    'had',
    'have',
    'having',
    'here',
    'infront',
    'into',
    'itself',
    'just',
    'might',
    'more',
    'most',
    'must',
    'myself',
    'neither',
    'once',
    'only',
    'other',
    'ourselves',
    'over',
    'same',
    'shall',
    'should',
    'their',
    'theirs',
    'them',
    'themselves',
    'there',
    'these',
    'they',
    'this',
    'those',
    'through',
    'under',
    'until',
    'very',
    'what',
    'when',
    'where',
    'which',
    'while',
    'with',
    'within',
    'without',
    'would',
    'your',
    'yours',
    'yourself',
    'also',
    'using',
    'because',
    'before',
    'since',
    'then',
    'than',
    'that',
    'will',
    'been',
    'were',
    'said',
    'some',
    'such',
    'from',
    'used',
    'code',
    'file',
    'files',
    'function',
    'functions',
    'example',
    'return',
    'const',
    'import',
    'export',
    'default',
    'string',
    'number',
    'value',
    'values',
    'type',
    'types',
    'object',
    'array',
    'class',
    'method',
    'methods',
    'true',
    'false',
    'null',
    'undefined',
    'async',
    'await',
    'this',
    'self',
  ]);

  for (const word of words) {
    if (!stopWords.has(word) && word.length > 4) {
      wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
    }
  }

  const sortedTags = Array.from(wordFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  return sortedTags;
}

export function normalizeContent(raw: ExtractedContent): NormalizedContent {
  logger.info('Normalizing content', { sourcePath: raw.sourcePath });

  const cleanedContent = cleanMarkdown(raw.rawContent);

  const title = extractTitle(raw.rawContent, raw.sourcePath);

  const tags = extractTags(raw.rawContent);

  const normalized: NormalizedContent = {
    id: generateDeterministicId(raw.sourcePath, raw.metadata),
    type: raw.targetType,
    title,
    content: cleanedContent,
    tags,
    origin: raw.metadata,
    normalizedAt: new Date(),
  };

  eventBus.emit(
    createEvent('forgelab.content.normalized', 'forge-lab', {
      id: normalized.id,
      type: normalized.type,
      tagsCount: tags.length,
    })
  );

  logger.debug('Content normalized', {
    id: normalized.id,
    title: normalized.title,
    tagsCount: tags.length,
  });

  return normalized;
}
