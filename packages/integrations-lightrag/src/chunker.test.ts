import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eventBus } from '@ninja/events';
import { SemanticChunker, semanticChunker } from './chunker.js';

describe('SemanticChunker', () => {
  let chunker: SemanticChunker;
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    chunker = new SemanticChunker();
    emitSpy = vi.spyOn(eventBus, 'emit').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function lastChunkEvent(): {
    chunkCount: number;
    totalTokens: number;
    avgTokensPerChunk: number;
  } {
    const calls = emitSpy.mock.calls.map(
      (c: unknown[]) => c[0] as { type: string; payload: unknown }
    );
    const evt = calls.find(
      (e: { type: string; payload: unknown }) => e.type === 'lightrag.chunk.created'
    );
    expect(evt).toBeDefined();
    return evt?.payload as { chunkCount: number; totalTokens: number; avgTokensPerChunk: number };
  }

  // ── Casos límite explícitos ──────────────────────────────────────────────

  it('texto vacío → ningún chunk', () => {
    expect(chunker.chunk('', 10)).toEqual([]);
  });

  it('solo espacios/newlines → ningún chunk', () => {
    expect(chunker.chunk('   \n\n  \n\t ', 10)).toEqual([]);
  });

  it('una sola palabra → un chunk con esa palabra', () => {
    expect(chunker.chunk('hola', 10)).toEqual(['hola']);
  });

  it('texto menor que el chunk → un único chunk intacto', () => {
    const text = 'Hola mundo, esto es un texto corto.';
    expect(chunker.chunk(text, 100)).toEqual([text]);
  });

  it('divide por párrafos preservando el orden', () => {
    const chunks = chunker.chunk('Primer párrafo.\n\nSegundo párrafo.\n\nTercer párrafo.', 100);
    expect(chunks).toEqual(['Primer párrafo.', 'Segundo párrafo.', 'Tercer párrafo.']);
  });

  it('normaliza CRLF y espacios múltiples', () => {
    const chunks = chunker.chunk('Primer  párrafo.\r\n\r\n\r\nSegundo   párrafo.', 100);
    expect(chunks).toEqual(['Primer párrafo.', 'Segundo párrafo.']);
    expect(chunks.join(' ')).not.toContain('\r');
  });

  it('unicode y emojis se preservan sin corrupción', () => {
    const text = '¿Cómo estás? ¡Muy bien! Ñandú 🦩 café naïve ünïcode';
    expect(chunker.chunk(text, 100)).toEqual([text]);
  });

  it('párrafo que excede maxTokens se divide por oraciones completas', () => {
    const s1 = 'Esto es la primera oración completa.';
    const s2 = 'Esto es la segunda oración.';
    const s3 = 'Y aquí la tercera.';
    // 5+5+4 = 14 palabras → ~19 tokens; maxTokens=10 fuerza el split
    const chunks = chunker.chunk(`${s1} ${s2} ${s3}`, 10);

    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      // Ninguna oración cortada a mitad: cada chunk termina en punto
      expect(c.endsWith('.')).toBe(true);
    }
    // Reunir los chunks recupera todas las oraciones
    expect(chunks.join(' ')).toContain(s1);
    expect(chunks.join(' ')).toContain(s2);
    expect(chunks.join(' ')).toContain(s3);
  });

  it('no fusiona oraciones que juntas exceden maxTokens', () => {
    const s = 'Palabra uno dos tres cuatro cinco seis siete ocho nueve.';
    // 10 palabras ≈ 14 tokens por oración; maxTokens 14 → cada oración su chunk
    const chunks = chunker.chunk(`${s} ${s} ${s}`, 14);
    expect(chunks).toHaveLength(3);
  });

  it('fusiona oraciones cuando el conjunto respeta maxTokens', () => {
    const s = 'Palabra uno dos tres cuatro cinco seis siete ocho nueve.';
    // 2 oraciones ≈ 28 tokens ≤ 30 → un solo chunk con ambas
    const chunks = chunker.chunk(`${s} ${s}`, 30);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(`${s} ${s}`);
  });

  it('protege abreviaturas comunes al dividir oraciones', () => {
    const text =
      'El Dr. García presentó el informe completo sobre los resultados anuales. Luego el Sr. López respondió todas las preguntas del público. Finalmente la Prof. Mata cerró la sesión oficial.';
    const chunks = chunker.chunk(text, 15);

    for (const c of chunks) {
      expect(c.trim().endsWith('Dr')).toBe(false);
      expect(c.trim().endsWith('Sr')).toBe(false);
      expect(c.trim().endsWith('Prof')).toBe(false);
    }
    expect(chunks.join(' ')).toContain('El Dr. García presentó');
    expect(chunks.join(' ')).toContain('Sr. López respondió');
  });

  it('una oración gigante sin puntos se mantiene como un único chunk', () => {
    const sentence = Array.from({ length: 30 }, (_, i) => `palabra${i}`).join(' ');
    expect(chunker.chunk(sentence, 5)).toEqual([sentence]);
  });

  // ── Evento y contadores ─────────────────────────────────────────────────

  it('emite lightrag.chunk.created con contadores consistentes', () => {
    const chunks = chunker.chunk('Uno dos tres.\n\nCuatro cinco seis siete ocho.', 100);

    const payload = lastChunkEvent();
    expect(payload.chunkCount).toBe(chunks.length);
    expect(payload.totalTokens).toBeGreaterThan(0);
    expect(payload.avgTokensPerChunk).toBe(Math.round(payload.totalTokens / payload.chunkCount));
  });

  it('emite contadores en cero para contenido vacío', () => {
    chunker.chunk('', 10);

    const payload = lastChunkEvent();
    expect(payload).toEqual({ chunkCount: 0, totalTokens: 0, avgTokensPerChunk: 0 });
  });

  it('expone un singleton SemanticChunker', () => {
    expect(semanticChunker).toBeInstanceOf(SemanticChunker);
  });
});
