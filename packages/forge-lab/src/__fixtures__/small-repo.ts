import type { ExtractedContent, RepoAnalysis } from '../schema.js';

export const SMALL_REPO_METADATA = {
  name: 'tiny-skill',
  description: 'A tiny fixture repo',
  stargazers_count: 42,
  language: 'TypeScript',
};

export const SMALL_REPO_STRUCTURE = [
  'README.md',
  'package.json',
  'src',
  'tsconfig.json',
  'tests',
  'LICENSE',
  'pnpm-lock.yaml',
];

export const SMALL_REPO_CONTENTS_PAYLOAD = SMALL_REPO_STRUCTURE.map((name) => ({ name }));

export function makeRepoAnalysisFixture(): RepoAnalysis {
  return {
    repo: {
      url: 'https://github.com/acme/tiny-skill',
      name: 'tiny-skill',
      owner: 'acme',
      description: 'A tiny fixture repo',
      stars: 42,
      language: 'TypeScript',
      id: 'repo-fixture-1',
    },
    structure: [...SMALL_REPO_STRUCTURE],
    fileCount: SMALL_REPO_STRUCTURE.length,
    mainLanguage: 'TypeScript',
    hasReadme: true,
    hasTests: true,
    qualitySignals: {
      hasTypes: true,
      hasLinting: false,
      hasCI: false,
      hasTests: true,
      hasReadme: true,
      licenseType: 'detected',
      isModernPackage: true,
    },
    analyzedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

export function makeExtractedFixture(): ExtractedContent {
  return {
    sourcePath: 'skills/my-skill.md',
    targetType: 'skill',
    rawContent:
      '# My Skill\n\n\nThis skill teaches authentication patterns with examples.\n\n```ts\nconst x = 1;\n```\n',
    metadata: {
      origin: 'https://github.com/acme/tiny-skill',
      originUrl: 'https://raw.githubusercontent.com/acme/tiny-skill/main/skills/my-skill.md',
      extractedAt: new Date('2026-01-01T00:00:00.000Z'),
      language: 'markdown',
    },
  };
}
