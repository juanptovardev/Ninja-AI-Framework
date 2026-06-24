export interface LightRAGDocument {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  indexedAt?: string;
}

export interface LightRAGQuery {
  text: string;
  limit?: number;
  threshold?: number;
}

export interface LightRAGResult {
  documentId: string;
  chunk: string;
  score: number;
}
