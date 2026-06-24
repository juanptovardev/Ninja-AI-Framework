/**
 * @ninja/integrations-engram — compressor.ts
 * Compresor heurístico de memoria con stopwords bilingües y preservación de keywords.
 * Target ratio: ~30% del original.
 */

import { eventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';
import type { ID } from '@ninja/contracts';
import type { MemoryEntry, CompressionResult } from './schema.js';

const log = createLogger('memory-compressor');

// Stopwords bilingües (EN + ES)
const STOPWORDS = new Set([
  // Inglés
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their',
  // Español
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'pero', 'en', 'de',
  'a', 'por', 'para', 'con', 'sin', 'sobre', 'entre', 'desde', 'hasta', 'durante',
  'es', 'son', 'era', 'eran', 'fue', 'fueron', 'ser', 'sido', 'estar', 'estado',
  'tengo', 'tiene', 'tienen', 'había', 'habían', 'hace', 'hicieron', 'hará', 'harían',
  'puede', 'pueden', 'podría', 'podrían', 'debe', 'deben', 'debería', 'este', 'esta',
  'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'yo', 'tú', 'él', 'ella', 'nosotros',
  'nosotras', 'vosotros', 'vosotras', 'ellos', 'ellas', 'me', 'te', 'le', 'les', 'nos',
  'os', 'mi', 'tu', 'su', 'nuestro', 'nuestra', 'vuestro', 'vuestra',
]);

// Keywords a preservar (alta relevancia semántica)
const PRESERVE_KEYWORDS = new Set([
  'error', 'bug', 'fix', 'issue', 'problem', 'solution', 'implement', 'create',
  'delete', 'update', 'change', 'important', 'critical', 'warning', 'success',
  'failed', 'decision', 'action', 'result', 'data', 'file', 'module', 'function',
  'class', 'method', 'variable', 'constant', 'config', 'setting', 'parameter',
  'argument', 'return', 'output', 'input', 'value', 'type', 'interface',
  'error', 'excepción', 'bug', 'arreglo', 'solución', 'problema', 'implementar',
  'crear', 'eliminar', 'actualizar', 'cambiar', 'importante', 'crítico', 'advertencia',
  'éxito', 'fallido', 'decisión', 'acción', 'resultado', 'datos', 'archivo', 'módulo',
  'función', 'clase', 'método', 'variable', 'constante', 'configuración', 'parámetro',
  'argumento', 'retorno', 'salida', 'entrada', 'valor', 'tipo', 'interfaz',
]);

interface MemoryCompressorDeps {
  eventBus?: typeof eventBus;
}

export class MemoryCompressor {
  private eventBus: typeof eventBus;
  private targetRatio: number;

  constructor(deps: MemoryCompressorDeps = {}) {
    this.eventBus = deps.eventBus ?? eventBus;
    this.targetRatio = 0.3; // 30% del original
  }

  /**
   * Comprime una entrada de memoria usando heurísticas.
   * Target: ~30% del tamaño original.
   */
  compress(entry: MemoryEntry): CompressionResult {
    const original = entry.content;
    const originalTokens = this.estimateTokens(original);

    // Paso 1: Extraer oraciones con keywords
    const summary = this.extractSummary(original);

    // Paso 2: Calcular tokens resultantes
    const compressedTokens = this.estimateTokens(summary);
    const ratio = originalTokens > 0 ? compressedTokens / originalTokens : 1;

    const result: CompressionResult = {
      original,
      compressed: summary,
      originalTokens,
      compressedTokens,
      ratio,
    };

    // Emitir evento de compresión
    this.emitCompressed(entry.id, ratio, originalTokens - compressedTokens);

    log.info('Memory compressed', {
      id: entry.id,
      originalTokens,
      compressedTokens,
      ratio: ratio.toFixed(2),
    });

    return result;
  }

  /**
   * Extrae un resumen preservando oraciones con keywords relevantes.
   */
  private extractSummary(text: string): string {
    // Dividir en oraciones
    const sentences = this.splitSentences(text);

    // Filtrar oraciones con keywords
    const keywordSentences = sentences.filter((s) => this.hasKeywords(s));

    // Si no hay oraciones con keywords, usar las más largas
    let selectedSentences: string[];
    if (keywordSentences.length > 0) {
      selectedSentences = keywordSentences;
    } else {
      // Ordenar por longitud y tomar las primeras
      selectedSentences = sentences
        .sort((a, b) => b.length - a.length)
        .slice(0, Math.ceil(sentences.length * this.targetRatio));
    }

    // Unir oraciones seleccionadas
    let summary = selectedSentences.join(' ');

    // Truncar al ratio objetivo si es necesario
    summary = this.truncateToTargetRatio(summary, text.length * this.targetRatio);

    return summary;
  }

  /**
   * Divide el texto en oraciones.
   */
  private splitSentences(text: string): string[] {
    // Regex que considera . ! ? como finales de oración
    return text
      .replace(/([.!?])\s+/g, '$1|')
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * Verifica si una oración contiene keywords relevantes.
   */
  private hasKeywords(sentence: string): boolean {
    const words = sentence.toLowerCase().split(/\W+/);
    return words.some((w) => PRESERVE_KEYWORDS.has(w));
  }

  /**
   * Elimina stopwords del texto.
   */
  private removeStopwords(words: string[]): string[] {
    return words.filter((w) => !STOPWORDS.has(w.toLowerCase()));
  }

  /**
   * Prioriza palabras que son keywords.
   */
  private prioritizeKeywords(words: string[]): string[] {
    return words.sort((a, b) => {
      const aIsKeyword = PRESERVE_KEYWORDS.has(a.toLowerCase()) ? 1 : 0;
      const bIsKeyword = PRESERVE_KEYWORDS.has(b.toLowerCase()) ? 1 : 0;
      return bIsKeyword - aIsKeyword;
    });
  }

  /**
   * Trunca el texto al tamaño objetivo preservando oraciones completas.
   */
  private truncateToTargetRatio(text: string, targetLength: number): string {
    if (text.length <= targetLength) {
      return text;
    }

    const sentences = this.splitSentences(text);
    let result = '';

    for (const sentence of sentences) {
      if ((result + sentence).length > targetLength && result.length > 0) {
        break;
      }
      result += (result ? ' ' : '') + sentence;
    }

    return result || text.slice(0, Math.floor(targetLength));
  }

  /**
   * Estima el número de tokens (caracteres / 4).
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Emite el evento 'memory.compressed'.
   */
  private emitCompressed(id: ID, ratio: number, tokensSaved: number): void {
    const payload = { id, ratio, tokensSaved };
    const evt = createEvent('memory.compressed', 'integrations-engram', payload);
    this.eventBus.emit(evt);
  }
}

// Singleton export
export const memoryCompressor = new MemoryCompressor();
