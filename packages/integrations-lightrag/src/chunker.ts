import { eventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';

export interface ChunkCreatedPayload {
  chunkCount: number;
  totalTokens: number;
  avgTokensPerChunk: number;
}

export class SemanticChunker {
  private logger: ReturnType<typeof createLogger>;

  constructor() {
    this.logger = createLogger('LightRAG-Chunker');
  }

  /**
   * Divide contenido en chunks respetando límites semánticos.
   * Estrategia:
   * 1. Dividir por párrafos
   * 2. Si párrafo > maxTokens → dividir por oraciones
   * 3. Nunca cortar oraciones a mitad
   */
  chunk(content: string, maxTokens: number): string[] {
    const normalized = this.normalizeContent(content);
    const paragraphs = this.splitParagraphs(normalized);
    const chunks: string[] = [];
    let totalTokens = 0;

    for (const paragraph of paragraphs) {
      const paraTokens = this.estimateTokens(paragraph);

      if (paraTokens <= maxTokens) {
        // Párrafo completo cabe en un chunk
        chunks.push(paragraph);
        totalTokens += paraTokens;
      } else {
        // Párrafo muy largo, dividir por oraciones
        const sentences = this.splitSentences(paragraph);
        let currentChunk = '';
        let currentTokens = 0;

        for (const sentence of sentences) {
          const sentenceTokens = this.estimateTokens(sentence);

          if (currentTokens + sentenceTokens > maxTokens && currentChunk.length > 0) {
            // Guardar chunk actual y empezar nuevo
            chunks.push(currentChunk.trim());
            totalTokens += currentTokens;
            currentChunk = sentence;
            currentTokens = sentenceTokens;
          } else {
            // Agregar oración al chunk actual
            currentChunk += (currentChunk ? ' ' : '') + sentence;
            currentTokens += sentenceTokens;
          }
        }

        // Guardar último chunk del párrafo
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          totalTokens += currentTokens;
        }
      }
    }

    // Emitir evento de chunks creados
    const payload: ChunkCreatedPayload = {
      chunkCount: chunks.length,
      totalTokens,
      avgTokensPerChunk: chunks.length > 0 ? Math.round(totalTokens / chunks.length) : 0,
    };

    eventBus.emit(createEvent('lightrag.chunk.created', 'integrations-lightrag', payload));

    this.logger.debug('Content chunked', {
      originalLength: content.length,
      chunks: chunks.length,
      totalTokens,
      maxTokens,
    });

    return chunks;
  }

  /**
   * Normaliza el contenido: trim, remover espacios extras.
   */
  private normalizeContent(content: string): string {
    return content
      .trim()
      .replace(/\r\n/g, '\n') // Normalizar newlines
      .replace(/\n{3,}/g, '\n\n') // Máximo 2 newlines seguidos
      .replace(/[ \t]+/g, ' '); // Normalizar espacios
  }

  /**
   * Divide contenido en párrafos.
   * Usa doble newline como separador de párrafos.
   */
  private splitParagraphs(content: string): string[] {
    return content
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  /**
   * Divide un párrafo en oraciones.
   * Respeta abreviaciones comunes.
   */
  private splitSentences(paragraph: string): string[] {
    // Guardar abreviaciones para no cortarlas
    const abbreviations = [
      'Dr.',
      'Sr.',
      'Sra.',
      'Prof.',
      'Ing.',
      'Lic.',
      'etc.',
      'vs.',
      'p.ej.',
      'i.e.',
      'e.g.',
    ];
    let protectedText = paragraph;

    // Reemplazar abreviaciones con placeholders
    const placeholders: string[] = [];
    abbreviations.forEach((abbr, index) => {
      const regex = new RegExp(abbr.replace('.', '\\.'), 'g');
      protectedText = protectedText.replace(regex, () => {
        placeholders.push(abbr);
        return `\x00${placeholders.length - 1}\x00`;
      });
    });

    // Dividir por puntos seguidos de espacio y mayúscula
    const sentences = protectedText
      .split(/(?<=[.!?])\s+(?=[A-Z])/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Restaurar abreviaciones
    return sentences.map((sentence) => {
      return sentence.replace(/\x00(\d+)\x00/g, (_, index) => {
        return placeholders[parseInt(index)] || '';
      });
    });
  }

  /**
   * Estima el número de tokens en un texto.
   * Aproximación: ~1.33 tokens por palabra (promedio inglés/español).
   */
  private estimateTokens(text: string): number {
    const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
    return Math.ceil(wordCount * 1.33);
  }
}

// Instancia singleton
export const semanticChunker = new SemanticChunker();
