import { describe, it, expect } from 'vitest';
import { scoreContent } from './quality-scorer.js';
import { normalizeContent } from './normalizer.js';
import { makeExtractedFixture } from './__fixtures__/small-repo.js';
import type { NormalizedContent } from './normalizer.js';

function base(): NormalizedContent {
  return normalizeContent(makeExtractedFixture());
}

describe('scoreContent', () => {
  it('puntua contenido rico por encima del umbral y marca passed', () => {
    const rich: NormalizedContent = {
      ...base(),
      content:
        '# My Skill\n\n' +
        'This guide explains authentication with a full example of usage. '.repeat(12) +
        '\n\n```ts\nconst token = sign(payload);\n```\n',
    };
    const score = scoreContent(rich);
    expect(score.passed).toBe(true);
    expect(score.score).toBeGreaterThanOrEqual(60);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(score.breakdown.hasCodeBlocks).toBe(20);
    expect(score.breakdown.hasExamples).toBe(15);
  });

  it('siempre acota el score a 0-100 en el caso limite vacio', () => {
    const empty: NormalizedContent = { ...base(), title: '  ', content: '  ' };
    const score = scoreContent(empty);
    expect(score.score).toBe(0);
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(score.passed).toBe(false);
  });

  it('penaliza contenido muy corto aunque tenga titulo y codeblock', () => {
    const short: NormalizedContent = { ...base(), content: '```ts\nx\n```' };
    const score = scoreContent(short);
    expect(score.breakdown.hasCodeBlocks).toBe(20);
    expect(score.score).toBeLessThanOrEqual(35);
    expect(score.passed).toBe(false);
  });

  it('distingue tramo de longitud 200-500 frente a 500+', () => {
    const mid: NormalizedContent = {
      ...base(),
      content: `x\n\n${'lorem ipsum dolor '.repeat(15)}`,
    };
    const long: NormalizedContent = {
      ...base(),
      content: `x\n\n${'lorem ipsum dolor '.repeat(40)}`,
    };
    expect(scoreContent(mid).breakdown.contentLength).toBe(20);
    expect(scoreContent(long).breakdown.contentLength).toBe(30);
  });

  it('pasa exactamente en el umbral 60 (15+15+30 sin ejemplos ni code)', () => {
    const atThreshold: NormalizedContent = {
      ...base(),
      content: '# Doc\n\n' + 'contenido descriptivo neutral '.repeat(25),
    };
    const score = scoreContent(atThreshold);
    expect(score.breakdown.contentLength).toBe(30);
    expect(score.breakdown.hasExamples).toBe(0);
    expect(score.score).toBe(60);
    expect(score.passed).toBe(true);
  });

  it('detecta ejemplo por la palabra uso en espanol', () => {
    const es: NormalizedContent = {
      ...base(),
      content: `# Doc\n\nExplicacion del uso del modulo. ${'relleno '.repeat(40)}`,
    };
    expect(scoreContent(es).breakdown.hasExamples).toBe(15);
  });
});
