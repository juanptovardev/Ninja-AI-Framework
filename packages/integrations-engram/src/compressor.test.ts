import { describe, it, expect } from 'vitest';
import { MemoryCompressor } from './compressor.js';
import type { MemoryEntry } from './schema.js';

function entry(content: string): MemoryEntry {
  return {
    id: 'mem-1',
    sessionId: 'sess-1',
    content,
    compressed: false,
    tokenCount: Math.ceil(content.length / 4),
    timestamp: new Date().toISOString(),
    tags: [],
  };
}

const compressor = new MemoryCompressor();

describe('MemoryCompressor', () => {
  it('reduce texto redundante con ratio < 1 y preserva keywords', () => {
    const content =
      'Fix the critical bug in the module now. ' +
      'The weather is pleasant and the birds are singing calmly today. '.repeat(4) +
      'Decision: implement the solution for the error handling path.';
    const result = compressor.compress(entry(content));
    expect(result.original).toBe(content);
    expect(result.compressed.length).toBeLessThan(content.length);
    expect(result.ratio).toBeLessThan(1);
    expect(result.ratio).toBeCloseTo(result.compressedTokens / result.originalTokens, 5);
    expect(result.compressed).toContain('bug');
  });

  it('caso borde vacio: ratio 1 y tokens en cero', () => {
    const result = compressor.compress(entry(''));
    expect(result.originalTokens).toBe(0);
    expect(result.compressedTokens).toBe(0);
    expect(result.ratio).toBe(1);
    expect(result.compressed).toBe('');
  });

  it('caso borde identico: contenido repetido se trunca al ratio objetivo', () => {
    const sentence = 'Fix the error in the function now.';
    const content = Array.from({ length: 20 }, () => sentence).join(' ');
    const result = compressor.compress(entry(content));
    expect(result.compressed.length).toBeLessThan(content.length);
    expect(result.ratio).toBeLessThanOrEqual(0.5);
    expect(result.compressed).toContain('error');
  });

  it('caso borde completamente distinto (sin keywords): selecciona un subconjunto', () => {
    const content = [
      'The golden sunset painted the quiet harbor in warm amber tones.',
      'A small wooden boat drifted slowly across the calm water surface.',
      'Children played near the old lighthouse while seagulls circled above.',
      'The baker prepared fresh bread before the sunrise every single morning.',
      'Clouds gathered over distant mountains as evening approached softly.',
    ].join(' ');
    const result = compressor.compress(entry(content));
    expect(result.compressed.length).toBeGreaterThan(0);
    expect(result.compressed.length).toBeLessThan(content.length);
    expect(result.ratio).toBeLessThan(1);
  });

  it('estima tokens como ceil(chars / 4)', () => {
    const content = 'abcdefghij'; // 10 chars -> 3 tokens
    const result = compressor.compress(entry(content));
    expect(result.originalTokens).toBe(3);
  });

  it('oracion unica corta con keyword se preserva integra', () => {
    const content = 'Fix the bug.';
    const result = compressor.compress(entry(content));
    expect(result.compressed).toBe('Fix the bug.');
    expect(result.ratio).toBe(1);
  });
});
