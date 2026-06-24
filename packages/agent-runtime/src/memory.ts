import type { AgentMemory } from './schema';

// Gestión de memoria corto plazo del agente durante una tarea

export class MemoryManager {
  private memory: AgentMemory;

  constructor(initialContext?: Record<string, unknown>) {
    this.memory = {
      sessionContext: initialContext || {},
      interactionHistory: [],
      taskData: {},
      intermediateResults: {},
    };
  }

  /**
   * Limpia la memoria del agente
   */
  clearMemory(): void {
    this.memory = {
      sessionContext: this.memory.sessionContext, // Mantener contexto de sesión
      interactionHistory: [],
      taskData: {},
      intermediateResults: {},
    };
  }

  /**
   * Agrega información a la memoria del agente
   */
  addToMemory(
    key: string,
    value: unknown,
    category: 'taskData' | 'intermediateResults' = 'taskData'
  ): void {
    if (category === 'taskData') {
      this.memory.taskData[key] = value;
    } else {
      this.memory.intermediateResults[key] = value;
    }

    // Registrar en el historial de interacciones
    this.memory.interactionHistory.push({
      timestamp: new Date().toISOString(),
      type: 'memory_update',
      content: { key, value, category },
    });
  }

  /**
   * Obtiene información relevante de la memoria con compresión de contexto
   */
  getRelevantMemory(query?: string): Record<string, unknown> {
    const history = this.memory.interactionHistory;
    const recentHistory = history.slice(-5);

    const compressedHistory =
      history.length > 5
        ? history.slice(0, -5).map((item) => ({
            timestamp: item.timestamp,
            type: item.type,
            summary: `[${Object.keys((item.content as Record<string, unknown>) || {}).join(', ')}]`,
          }))
        : [];

    return {
      sessionContext: this.memory.sessionContext,
      recentHistory,
      compressedHistory,
      taskData: this.memory.taskData,
      intermediateResults: this.memory.intermediateResults,
    };
  }

  /**
   * Obtiene el historial de interacciones recientes
   */
  getInteractionHistory(limit = 10): Array<{ timestamp: string; type: string; content: unknown }> {
    // Retornar las últimas 'limit' interacciones
    return this.memory.interactionHistory.slice(-limit);
  }

  /**
   * Actualiza el contexto de sesión
   */
  updateSessionContext(context: Record<string, unknown>): void {
    this.memory.sessionContext = { ...this.memory.sessionContext, ...context };
  }

  /**
   * Obtiene el estado completo de la memoria
   */
  getMemoryState(): AgentMemory {
    return { ...this.memory };
  }

  /**
   * Contrato para integración con Engram (solo contrato, sin implementación aún)
   */
  // NOTA: Esta es solo la definición de la interfaz para futura integración
  // En una implementación futura, se conectaría con el sistema de memoria Engram
}
