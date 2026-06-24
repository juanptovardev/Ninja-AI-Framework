import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryManager } from './memory';
import type { AgentMemory } from './schema';

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;

  describe('constructor', () => {
    it('should initialize with empty memory when no context provided', () => {
      memoryManager = new MemoryManager();
      const state = memoryManager.getMemoryState();

      expect(state.sessionContext).toEqual({});
      expect(state.interactionHistory).toEqual([]);
      expect(state.taskData).toEqual({});
      expect(state.intermediateResults).toEqual({});
    });

    it('should initialize with provided context', () => {
      memoryManager = new MemoryManager({ projectId: 'test-123', user: 'admin' });
      const state = memoryManager.getMemoryState();

      expect(state.sessionContext).toEqual({ projectId: 'test-123', user: 'admin' });
    });
  });

  describe('addToMemory', () => {
    beforeEach(() => {
      memoryManager = new MemoryManager();
    });

    it('should add value to taskData by default', () => {
      memoryManager.addToMemory('architecture', { type: 'microservices' });

      const state = memoryManager.getMemoryState();
      expect(state.taskData).toHaveProperty('architecture');
      expect(state.taskData['architecture']).toEqual({ type: 'microservices' });
    });

    it('should add value to taskData when explicitly specified', () => {
      memoryManager.addToMemory('apiSpec', { version: '1.0' }, 'taskData');

      const state = memoryManager.getMemoryState();
      expect(state.taskData['apiSpec']).toEqual({ version: '1.0' });
    });

    it('should add value to intermediateResults when specified', () => {
      memoryManager.addToMemory('validationResult', { valid: true }, 'intermediateResults');

      const state = memoryManager.getMemoryState();
      expect(state.intermediateResults).toHaveProperty('validationResult');
      expect(state.intermediateResults['validationResult']).toEqual({ valid: true });
    });

    it('should register interaction in history', () => {
      memoryManager.addToMemory('testKey', 'testValue');

      const history = memoryManager.getInteractionHistory();
      expect(history.length).toBe(1);
      expect(history[0].type).toBe('memory_update');
      expect((history[0].content as Record<string, unknown>)['key']).toBe('testKey');
    });
  });

  describe('clearMemory', () => {
    it('should clear interactionHistory, taskData, and intermediateResults but preserve sessionContext', () => {
      memoryManager = new MemoryManager({ persistentKey: 'persistentValue' });
      memoryManager.addToMemory('key1', 'value1', 'taskData');
      memoryManager.addToMemory('key2', 'value2', 'intermediateResults');

      memoryManager.clearMemory();

      const state = memoryManager.getMemoryState();
      expect(state.sessionContext).toEqual({ persistentKey: 'persistentValue' });
      expect(state.interactionHistory).toEqual([]);
      expect(state.taskData).toEqual({});
      expect(state.intermediateResults).toEqual({});
    });
  });

  describe('getRelevantMemory', () => {
    beforeEach(() => {
      memoryManager = new MemoryManager({ workspace: 'test-workspace' });
    });

    it('should return recentHistory with max 5 items', () => {
      for (let i = 0; i < 8; i++) {
        memoryManager.addToMemory(`key${i}`, `value${i}`);
      }

      const result = memoryManager.getRelevantMemory() as {
        recentHistory: Array<{ timestamp: string; type: string; content: unknown }>;
        compressedHistory: Array<{ timestamp: string; type: string; summary: string }>;
        sessionContext: Record<string, unknown>;
        taskData: Record<string, unknown>;
        intermediateResults: Record<string, unknown>;
      };

      expect(result.recentHistory).toHaveLength(5);
      expect(result.recentHistory[0].type).toBe('memory_update');
    });

    it('should compress older history beyond 5 items into summary-only format', () => {
      for (let i = 0; i < 8; i++) {
        memoryManager.addToMemory(`key${i}`, `value${i}`);
      }

      const result = memoryManager.getRelevantMemory() as {
        recentHistory: Array<{ timestamp: string; type: string; content: unknown }>;
        compressedHistory: Array<{ timestamp: string; type: string; summary: string }>;
        sessionContext: Record<string, unknown>;
        taskData: Record<string, unknown>;
        intermediateResults: Record<string, unknown>;
      };

      expect(result.compressedHistory).toHaveLength(3);
      for (const item of result.compressedHistory) {
        expect(item).toHaveProperty('summary');
        expect(item).toHaveProperty('timestamp');
        expect(item).toHaveProperty('type');
        expect(item).not.toHaveProperty('content');
      }
      expect(result.compressedHistory[0].summary).toBe('[key, value, category]');
      expect(result.compressedHistory[1].summary).toBe('[key, value, category]');
    });

    it('should return empty compressedHistory when 5 or fewer items', () => {
      for (let i = 0; i < 3; i++) {
        memoryManager.addToMemory(`key${i}`, `value${i}`);
      }

      const result = memoryManager.getRelevantMemory();

      expect(result.compressedHistory).toHaveLength(0);
      expect(result.recentHistory).toHaveLength(3);
    });

    it('should return full sessionContext', () => {
      const result = memoryManager.getRelevantMemory();

      expect(result.sessionContext).toEqual({ workspace: 'test-workspace' });
    });

    it('should return empty memory without errors', () => {
      memoryManager = new MemoryManager();
      const result = memoryManager.getRelevantMemory();

      expect(result.sessionContext).toEqual({});
      expect(result.recentHistory).toEqual([]);
      expect(result.compressedHistory).toEqual([]);
      expect(result.taskData).toEqual({});
      expect(result.intermediateResults).toEqual({});
    });

    it('should optimize context by keeping recent complete and older as summaries', () => {
      for (let i = 0; i < 10; i++) {
        memoryManager.addToMemory(`data${i}`, { index: i });
      }

      const result = memoryManager.getRelevantMemory();

      expect(result.recentHistory).toHaveLength(5);
      expect(result.compressedHistory).toHaveLength(5);
      expect(result.taskData).toHaveProperty('data0');
      expect(result.taskData).toHaveProperty('data9');
    });
  });

  describe('getInteractionHistory', () => {
    beforeEach(() => {
      memoryManager = new MemoryManager();
      for (let i = 0; i < 15; i++) {
        memoryManager.addToMemory(`key${i}`, `value${i}`);
      }
    });

    it('should return last 10 items by default', () => {
      const history = memoryManager.getInteractionHistory();

      expect(history).toHaveLength(10);
    });

    it('should respect custom limit', () => {
      const history = memoryManager.getInteractionHistory(5);

      expect(history).toHaveLength(5);
    });

    it('should return empty array on empty memory', () => {
      memoryManager = new MemoryManager();
      const history = memoryManager.getInteractionHistory();

      expect(history).toEqual([]);
    });

    it('should return items in chronological order (oldest first)', () => {
      memoryManager = new MemoryManager();
      memoryManager.addToMemory('first', 1);
      memoryManager.addToMemory('second', 2);

      const history = memoryManager.getInteractionHistory();

      expect(history).toHaveLength(2);
      expect((history[0].content as Record<string, unknown>)['value']).toBe(1);
      expect((history[1].content as Record<string, unknown>)['value']).toBe(2);
    });
  });

  describe('updateSessionContext', () => {
    it('should merge new context into existing sessionContext', () => {
      memoryManager = new MemoryManager({ existing: 'value' });
      memoryManager.updateSessionContext({ added: 'newValue' });

      const state = memoryManager.getMemoryState();
      expect(state.sessionContext).toEqual({ existing: 'value', added: 'newValue' });
    });

    it('should overwrite existing keys with new values', () => {
      memoryManager = new MemoryManager({ key: 'oldValue' });
      memoryManager.updateSessionContext({ key: 'newValue' });

      const state = memoryManager.getMemoryState();
      expect(state.sessionContext['key']).toBe('newValue');
    });

    it('should handle empty update without errors', () => {
      memoryManager = new MemoryManager({ existing: 'value' });
      memoryManager.updateSessionContext({});

      const state = memoryManager.getMemoryState();
      expect(state.sessionContext).toEqual({ existing: 'value' });
    });
  });

  describe('getMemoryState', () => {
    it('should return a copy of memory state', () => {
      memoryManager = new MemoryManager({ test: 'context' });
      memoryManager.addToMemory('key', 'value');

      const state = memoryManager.getMemoryState();
      state.sessionContext = {};

      const currentState = memoryManager.getMemoryState();
      expect(currentState.sessionContext).toEqual({ test: 'context' });
    });

    it('should return complete AgentMemory structure', () => {
      memoryManager = new MemoryManager({ project: 'test' });
      memoryManager.addToMemory('taskKey', 'taskValue', 'taskData');

      const state = memoryManager.getMemoryState();

      expect(state).toHaveProperty('sessionContext');
      expect(state).toHaveProperty('interactionHistory');
      expect(state).toHaveProperty('taskData');
      expect(state).toHaveProperty('intermediateResults');
    });
  });
});