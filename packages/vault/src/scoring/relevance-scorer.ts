import type { VaultEntry } from '../schema.js';

/**
 * Scorer de relevancia para entradas de Vault
 * Combina similitud de texto con recencia temporal
 */
export class RelevanceScorer {
  private readonly WORD_OVERLAP_WEIGHT = 0.7;
  private readonly RECENCY_WEIGHT = 0.3;
  private readonly RECENCY_DECAY_HOURS = 24;

  /**
   * Calcula relevancia de una entrada respecto a una query
   * @param entry Entrada de Vault
   * @param query Query de búsqueda
   * @returns Score entre 0 y 1
   */
  score(entry: VaultEntry, query: string): number {
    const wordOverlap = this.calculateWordOverlap(entry.content, query);
    const recencyScore = this.calculateRecencyScore(entry);

    const combinedScore =
      this.WORD_OVERLAP_WEIGHT * wordOverlap + this.RECENCY_WEIGHT * recencyScore;

    return Math.max(0, Math.min(1, combinedScore));
  }

  /**
   * Calcula scores para todas las entradas y las ordena
   * @param entries Entradas a rankear
   * @param query Query de búsqueda
   * @returns Entradas ordenadas por relevancia (descendente)
   */
  scoreAll(entries: VaultEntry[], query: string): VaultEntry[] {
    const scoredEntries = entries.map((entry) => ({
      ...entry,
      relevance: this.score(entry, query),
    }));

    return scoredEntries.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Rankea y recorta entradas respetando el presupuesto de tokens
   * @param entries Entradas a procesar
   * @param query Query de búsqueda
   * @param tokenBudget Presupuesto máximo de tokens
   * @returns Entradas seleccionadas dentro del presupuesto
   */
  rankAndTrim(entries: VaultEntry[], query: string, tokenBudget: number): VaultEntry[] {
    const rankedEntries = this.scoreAll(entries, query);

    const selectedEntries: VaultEntry[] = [];
    let currentTokens = 0;

    for (const entry of rankedEntries) {
      const entryTokens = this.estimateTokens(entry.content);
      if (currentTokens + entryTokens <= tokenBudget) {
        selectedEntries.push(entry);
        currentTokens += entryTokens;
      } else {
        break;
      }
    }

    return selectedEntries;
  }

  /**
   * Calcula similitud de palabras usando Jaccard similarity
   * @param content Contenido de la entrada
   * @param query Query de búsqueda
   * @returns Score entre 0 y 1
   */
  private calculateWordOverlap(content: string, query: string): number {
    if (!query || !content) return 0;

    const contentWords = this.tokenize(content);
    const queryWords = this.tokenize(query);

    if (queryWords.size === 0) return 0;

    const intersection: string[] = [];
    queryWords.forEach((word) => {
      if (contentWords.has(word)) {
        intersection.push(word);
      }
    });
    const union = new Set([...contentWords, ...queryWords]);

    if (union.size === 0) return 0;

    return intersection.length / union.size;
  }

  /**
   * Calcula score de recencia basado en temporal decay
   * @param entry Entrada de Vault
   * @returns Score entre 0 y 1
   */
  private calculateRecencyScore(entry: VaultEntry): number {
    const now = Date.now();
    const entryTime = new Date(entry.timestamp).getTime();
    const hoursSinceAccess = (now - entryTime) / (1000 * 60 * 60);

    const decay = 1 / (1 + hoursSinceAccess / this.RECENCY_DECAY_HOURS);
    return Math.max(0, Math.min(1, decay));
  }

  /**
   * Tokeniza texto en palabras normalizadas
   * @param text Texto a tokenizar
   * @returns Set de palabras únicas
   */
  private tokenize(text: string): Set<string> {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2);

    return new Set(words);
  }

  /**
   * Estima tokens basado en longitud de texto
   * @param text Texto a estimar
   * @returns Número estimado de tokens
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
