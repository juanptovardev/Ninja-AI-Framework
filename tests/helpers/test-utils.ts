import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Logger } from '@ninja/logging';
import type { ResolvedConfig } from '@ninja/config';
import { MockEventBus } from './mock-event-bus';
import { MockLLMClient } from './mock-llm-client';

export interface TestContext {
  logger: Logger;
  eventBus: MockEventBus;
  llmClient: MockLLMClient;
  config: Partial<ResolvedConfig>;
}

function createMockLogger(): Logger {
  const logs: Array<{ level: string; message: string; args: unknown[] }> = [];

  const logger: Logger = {
    name: 'test-mock',
    debug: (message: string, ...args: unknown[]) => {
      logs.push({ level: 'debug', message, args });
    },
    info: (message: string, ...args: unknown[]) => {
      logs.push({ level: 'info', message, args });
    },
    warn: (message: string, ...args: unknown[]) => {
      logs.push({ level: 'warn', message, args });
    },
    error: (message: string, ...args: unknown[]) => {
      logs.push({ level: 'error', message, args });
    },
  };

  return logger;
}

export function createTestContext(): TestContext {
  return {
    logger: createMockLogger(),
    eventBus: new MockEventBus(),
    llmClient: new MockLLMClient(),
    config: {
      runtime: {
        port: 3141,
        host: '127.0.0.1',
        logLevel: 'info',
      },
      global: {
        runtimePort: 3141,
        runtimeHost: '127.0.0.1',
        logLevel: 'info',
        defaultWorkspacePath: '',
      },
      workspace: {
        name: 'test-workspace',
        version: '1.0.0',
      },
      workspacePath: '/test/workspace',
    },
  };
}

export async function wait(ms: number): Promise<void> {
  if (ms < 0) {
    throw new Error(`wait() requires a non-negative number, got: ${ms}`);
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function assertEventEmitted(bus: MockEventBus, eventName: string): void {
  if (!bus) {
    throw new Error('assertEventEmitted: bus is null or undefined');
  }

  const events = bus.getEvents(eventName);

  if (events.length === 0) {
    const allEvents = bus.getEvents();
    const eventTypes = allEvents.map((e) => e.type).join(', ') || 'none';
    throw new Error(
      `Expected event "${eventName}" to be emitted, but it was not found. ` +
        `Events emitted: ${eventTypes}`
    );
  }
}

export async function createTempDir(): Promise<string> {
  const tempPath = path.join(tmpdir(), `ninja-test-${randomUUID()}`);
  await mkdir(tempPath, { recursive: true });
  return tempPath;
}

export async function cleanTempDir(tempPath: string): Promise<void> {
  try {
    await rm(tempPath, { recursive: true, force: true });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.warn(`[test-utils] Warning: Failed to clean temp dir "${tempPath}": ${err.message}`);
  }
}