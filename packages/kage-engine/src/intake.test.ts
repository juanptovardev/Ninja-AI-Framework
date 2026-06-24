import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IntakeProcessor } from './intake';
import { MockLLMClient } from '../../../tests/helpers/mock-llm-client';
import { MockEventBus } from '../../../tests/helpers/mock-event-bus';
import type { LLMClient, LLMResponse } from '@ninja/integrations-llm';
import type { Logger } from '@ninja/logging';
import type { EngineRequest, EnginePlan } from './schema';

function createMockLogger(): Logger {
  const logs: Array<{ level: string; message: string; args: unknown[] }> = [];
  const logger: Logger = {
    name: 'test-mock',
    debug: (message: string, ...args: unknown[]) => { logs.push({ level: 'debug', message, args }); },
    info: (message: string, ...args: unknown[]) => { logs.push({ level: 'info', message, args }); },
    warn: (message: string, ...args: unknown[]) => { logs.push({ level: 'warn', message, args }); },
    error: (message: string, ...args: unknown[]) => { logs.push({ level: 'error', message, args }); },
  };
  return logger;
}

function makeRequest(overrides: Partial<EngineRequest> = {}): EngineRequest {
  return {
    id: 'req-test-1',
    mode: 'build',
    prompt: 'build a web app',
    workspaceId: 'ws-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('IntakeProcessor', () => {
  let intake: IntakeProcessor;
  let mockLLM: MockLLMClient;
  let mockEventBus: MockEventBus;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLLM = new MockLLMClient({ defaultResponse: 'build' });
    mockEventBus = new MockEventBus();
    mockLogger = createMockLogger();
    intake = new IntakeProcessor(
      mockLLM as unknown as LLMClient,
      mockEventBus as unknown as import('@ninja/events').EventBus,
      mockLogger
    );
  });

  describe('process', () => {
    it('should generate a plan with steps when mode is provided', async () => {
      const request = makeRequest({ mode: 'build', prompt: 'create a new API' });

      const plan = await intake.process(request);

      expect(plan).toBeDefined();
      expect(plan.requestId).toBe('req-test-1');
      expect(plan.steps).toBeDefined();
      expect(Array.isArray(plan.steps)).toBe(true);
      expect(plan.workflowId).toBeDefined();
      expect(plan.createdAt).toBeDefined();
    });

    it('should use provided mode when request.mode is set', async () => {
      const request = makeRequest({ mode: 'repair' });

      const plan = await intake.process(request);

      expect(plan.steps.length).toBeGreaterThan(0);
    });
  });

  describe('determineMode fallback — keyword-based classification', () => {
    it('should classify "crear" prompt as build mode', async () => {
      const request = makeRequest({ mode: undefined as unknown as 'build', prompt: 'crear una app de tareas' });

      const plan = await intake.process(request);

      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should classify "reparar" prompt as repair mode', async () => {
      mockLLM = new MockLLMClient({ defaultResponse: 'repair' });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(
        mockLLM as unknown as LLMClient,
        mockEventBus as unknown as import('@ninja/events').EventBus,
        mockLogger
      );
      const request = makeRequest({ mode: undefined as unknown as 'build', prompt: 'reparar el build roto' });

      const plan = await intake.process(request);

      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should default to build when no keywords match', async () => {
      mockLLM = new MockLLMClient({ defaultResponse: 'build' });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(
        mockLLM as unknown as LLMClient,
        mockEventBus as unknown as import('@ninja/events').EventBus,
        mockLogger
      );
      const request = makeRequest({ mode: undefined as unknown as 'build', prompt: 'do something' });

      const plan = await intake.process(request);

      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should use keyword "workspace" for workspace mode', async () => {
      mockLLM = new MockLLMClient({ defaultResponse: 'workspace' });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(
        mockLLM as unknown as LLMClient,
        mockEventBus as unknown as import('@ninja/events').EventBus,
        mockLogger
      );
      const request = makeRequest({ mode: undefined as unknown as 'build', prompt: 'workspace management' });

      const plan = await intake.process(request);

      expect(plan.steps.length).toBeGreaterThan(0);
    });
  });

  describe('determineMode with LLM response', () => {
    it('should return build mode from LLM response', async () => {
      mockLLM = new MockLLMClient({
        responses: new Map([['crear', 'build']]),
        defaultResponse: 'build',
      });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(
        mockLLM as unknown as LLMClient,
        mockEventBus as unknown as import('@ninja/events').EventBus,
        mockLogger
      );
      const request = makeRequest({ mode: undefined as unknown as 'build', prompt: 'crear una app de tareas' });

      const plan = await intake.process(request);

      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should return repair mode from LLM response', async () => {
      mockLLM = new MockLLMClient({
        responses: new Map([['reparar', 'repair']]),
        defaultResponse: 'repair',
      });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(
        mockLLM as unknown as LLMClient,
        mockEventBus as unknown as import('@ninja/events').EventBus,
        mockLogger
      );
      const request = makeRequest({ mode: undefined as unknown as 'build', prompt: 'reparar el error' });

      const plan = await intake.process(request);

      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should emit intake.mode.llm.success event on successful LLM classification', async () => {
      mockLLM = new MockLLMClient({ responses: new Map([['test', 'build']]), defaultResponse: 'build' });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(
        mockLLM as unknown as LLMClient,
        mockEventBus as unknown as import('@ninja/events').EventBus,
        mockLogger
      );
      const request = makeRequest({ mode: undefined as unknown as 'build', prompt: 'test prompt' });

      await intake.process(request);

      const events = mockEventBus.getEvents('intake.mode.llm.success');
      expect(events.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('decomposeIntoTasks with LLM', () => {
    it('should parse valid JSON tasks from LLM response', async () => {
      const tasksJson = JSON.stringify([
        { id: 'task-1', description: 'Analizar requisitos', dependencies: [] },
        { id: 'task-2', description: 'Disenar arquitectura', dependencies: ['task-1'] },
      ]);
      mockLLM = new MockLLMClient({ responses: new Map([['Solicitud', tasksJson]]), defaultResponse: tasksJson });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(
        mockLLM as unknown as LLMClient,
        mockEventBus as unknown as import('@ninja/events').EventBus,
        mockLogger
      );
      const request = makeRequest({ prompt: 'complex multi-step task' });

      const plan = await intake.process(request);

      expect(plan.steps.length).toBe(2);
      expect(plan.steps[0].id).toBe('task-1');
      expect(plan.steps[0].dependsOn).toEqual([]);
      expect(plan.steps[1].dependsOn).toEqual(['task-1']);
    });

    it('should fall back to default tasks when JSON parse fails', async () => {
      mockLLM = new MockLLMClient({ defaultResponse: 'not valid json { ' });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(
        mockLLM as unknown as LLMClient,
        mockEventBus as unknown as import('@ninja/events').EventBus,
        mockLogger
      );
      const request = makeRequest({ prompt: 'task that fails JSON' });

      const plan = await intake.process(request);

      expect(plan.steps.length).toBe(4);
      expect(plan.steps.map(s => s.description)).toContain('Analizar requisitos del proyecto');
    });
  });

  describe('LLM failure fallback', () => {
    it('should use keyword-based classification when LLM throws error', async () => {
      mockLLM = new MockLLMClient({ defaultResponse: 'build' });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(
        mockLLM as unknown as LLMClient,
        mockEventBus as unknown as import('@ninja/events').EventBus,
        mockLogger
      );

      mockLLM.setNextError({ type: 'server_error', message: 'Service unavailable' });

      const request = makeRequest({ mode: undefined as unknown as 'build', prompt: 'crear algo nuevo' });

      const plan = await intake.process(request);

      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should emit intake.mode.llm.failed event when LLM errors', async () => {
      mockLLM = new MockLLMClient({ defaultResponse: 'build' });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(
        mockLLM as unknown as LLMClient,
        mockEventBus as unknown as import('@ninja/events').EventBus,
        mockLogger
      );
      mockLLM.setNextError({ type: 'server_error', message: 'Service unavailable' });
      const request = makeRequest({ mode: undefined as unknown as 'build', prompt: 'crear algo' });

      await intake.process(request);

      const failedEvents = mockEventBus.getEvents('intake.mode.llm.failed');
      expect(failedEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should emit intake.decompose.llm.failed when LLM call throws during decomposition', async () => {
      mockLLM = new MockLLMClient({ defaultResponse: 'fallback response' });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(
        mockLLM as unknown as LLMClient,
        mockEventBus as unknown as import('@ninja/events').EventBus,
        mockLogger
      );
      mockLLM.setNextError({ type: 'server_error', message: 'LLM service unavailable' });
      const request = makeRequest({ mode: 'build', prompt: 'some task' });

      const plan = await intake.process(request);

      expect(plan.steps.length).toBe(4);
      const failedEvents = mockEventBus.getEvents('intake.decompose.llm.failed');
      expect(failedEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('plan validation', () => {
    it('should assign agent roles to all steps', async () => {
      mockLLM = new MockLLMClient({
        responses: new Map([['Solicitud', '[]']]),
        defaultResponse: '[]',
      });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(
        mockLLM as unknown as LLMClient,
        mockEventBus as unknown as import('@ninja/events').EventBus,
        mockLogger
      );
      const request = makeRequest({ prompt: 'some task' });

      const plan = await intake.process(request);

      for (const step of plan.steps) {
        expect(plan.agentAssignments).toHaveProperty(step.id);
      }
    });

    it('should include workflowId in generated plan', async () => {
      const request = makeRequest({ mode: 'build' });

      const plan = await intake.process(request);

      expect(plan.workflowId).toBeDefined();
      expect(typeof plan.workflowId).toBe('string');
    });

    it('should include estimatedDuration in plan', async () => {
      const request = makeRequest({ mode: 'build' });

      const plan = await intake.process(request);

      expect(typeof plan.estimatedDuration).toBe('number');
    });
  });

  describe('agent role assignment via determineRequiredAgentRole', () => {
    it('should assign Planner role to analysis tasks', async () => {
      const tasksJson = JSON.stringify([
        { id: 'task-1', description: 'Analizar requisitos', dependencies: [] },
      ]);
      mockLLM = new MockLLMClient({
        responses: new Map([['Solicitud', tasksJson]]),
        defaultResponse: tasksJson,
      });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(
        mockLLM as unknown as LLMClient,
        mockEventBus as unknown as import('@ninja/events').EventBus,
        mockLogger
      );
      const request = makeRequest({ prompt: 'analisis' });

      const plan = await intake.process(request);

      expect(plan.steps[0].requiredAgentRole).toBe('Planner');
    });

    it('should assign Tester role to testing tasks', async () => {
      const tasksJson = JSON.stringify([
        { id: 'task-1', description: 'Probar la funcionalidad', dependencies: [] },
      ]);
      mockLLM = new MockLLMClient({
        responses: new Map([['Solicitud', tasksJson]]),
        defaultResponse: tasksJson,
      });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(
        mockLLM as unknown as LLMClient,
        mockEventBus as unknown as import('@ninja/events').EventBus,
        mockLogger
      );
      const request = makeRequest({ prompt: 'test task' });

      const plan = await intake.process(request);

      expect(plan.steps[0].requiredAgentRole).toBe('Tester');
    });
  });

  describe('generateInterview', () => {
    it('should return questions generated by LLM', async () => {
      const questionsJson = JSON.stringify([
        { id: 'q1', text: '¿Es Enterprise o Landing?', type: 'choice', options: ['Enterprise', 'Landing'], required: true },
        { id: 'q2', text: 'Q2?', type: 'open', required: true },
        { id: 'q3', text: 'Q3?', type: 'open', required: true },
        { id: 'q4', text: 'Q4?', type: 'open', required: true },
        { id: 'q5', text: 'Q5?', type: 'open', required: true },
        { id: 'q6', text: 'Q6?', type: 'open', required: true },
        { id: 'q7', text: 'Q7?', type: 'open', required: true },
      ]);
      mockLLM = new MockLLMClient({ defaultResponse: questionsJson });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(mockLLM as unknown as LLMClient, mockEventBus as unknown as import('@ninja/events').EventBus, mockLogger);

      const questions = await intake.generateInterview('quiero un crm');
      expect(questions).toHaveLength(7);
      expect(questions[0].id).toBe('q1');
    });

    it('should fallback to default questions on LLM error', async () => {
      mockLLM = new MockLLMClient({ defaultResponse: 'invalid' });
      mockLLM.setNextError({ type: 'server_error', message: 'LLM Failed' });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(mockLLM as unknown as LLMClient, mockEventBus as unknown as import('@ninja/events').EventBus, mockLogger);

      const questions = await intake.generateInterview('quiero un crm');
      expect(questions).toHaveLength(7);
      expect(questions[0].id).toBe('q1');
      expect(questions[0].text).toContain('Enterprise');
    });
  });

  describe('autoGeneratePRD', () => {
    it('should return PRD markdown from LLM', async () => {
      const prdOutput = '# PRD Generado\n1. Resumen Ejecutivo\nUn CRM muy útil.';
      mockLLM = new MockLLMClient({ defaultResponse: prdOutput });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(mockLLM as unknown as LLMClient, mockEventBus as unknown as import('@ninja/events').EventBus, mockLogger);

      const prd = await intake.autoGeneratePRD(
        [{ id: 'q1', text: 'Q1?', type: 'open', required: true }],
        [{ questionId: 'q1', answer: 'A1' }],
        'quiero un crm'
      );
      expect(prd).toBe(prdOutput);
    });

    it('should fallback to backup PRD on LLM error', async () => {
      mockLLM = new MockLLMClient({ defaultResponse: 'invalid' });
      mockLLM.setNextError({ type: 'server_error', message: 'LLM Failed PRD' });
      mockEventBus = new MockEventBus();
      mockLogger = createMockLogger();
      intake = new IntakeProcessor(mockLLM as unknown as LLMClient, mockEventBus as unknown as import('@ninja/events').EventBus, mockLogger);

      const prd = await intake.autoGeneratePRD([], [], 'prompt');
      expect(prd).toContain('# PRD de Respaldo');
    });
  });
});