import { describe, it, expect } from 'vitest';
import { normalizeContent } from './normalizer.js';
import { makeExtractedFixture } from './__fixtures__/small-repo.js';

describe('normalizeContent', () => {
  it('normaliza segun contrato: colapsa saltos, extrae titulo H1 y tags', () => {
    const out = normalizeContent(makeExtractedFixture());
    expect(out.type).toBe('skill');
    expect(out.title).toBe('My Skill');
    expect(out.content).toBe(
      '# My Skill\n\nThis skill teaches authentication patterns with examples.\n\n```ts\nconst x = 1;\n```'
    );
    expect(out.content).not.toMatch(/\n{3,}/);
    expect(out.id.startsWith('norm-')).toBe(true);
    expect(out.origin.origin).toBe('https://github.com/acme/tiny-skill');
    expect(out.normalizedAt).toBeInstanceOf(Date);
    expect(out.tags).toContain('authentication');
  });

  it('deriva el titulo desde el filename cuando no hay H1', () => {
    const raw = makeExtractedFixture();
    const out = normalizeContent({
      ...raw,
      sourcePath: 'workflows/my-workflow.md',
      rawContent: 'plain body text here',
    });
    expect(out.title).toBe('My Workflow');
  });

  it('filtra stopwords tecnicas del tagset', () => {
    const raw = makeExtractedFixture();
    const out = normalizeContent({
      ...raw,
      rawContent: '# T\n\nconst function return string value authentication',
    });
    expect(out.tags).not.toContain('const');
    expect(out.tags).not.toContain('function');
  });

  it('limita a un maximo de 10 tags', () => {
    const raw = makeExtractedFixture();
    const words = Array.from({ length: 30 }, (_, i) => `keyword${i}alpha`).join(' ');
    const out = normalizeContent({ ...raw, rawContent: `# T\n\n${words}` });
    expect(out.tags.length).toBeLessThanOrEqual(10);
  });

  it('preserva el tipo del target en la salida', () => {
    const raw = makeExtractedFixture();
    const out = normalizeContent({ ...raw, targetType: 'workflow' });
    expect(out.type).toBe('workflow');
  });
});
