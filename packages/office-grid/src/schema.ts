/**
 * @ninja/office-grid — schema.ts
 * Schemas Zod para validar tipos del Office Grid.
 */

import { z } from 'zod';
import type {
  AgentRole,
  AgentActivity,
  DepartmentId,
  AgentPosition,
  AgentNode,
  Department,
  OfficeState,
  OfficeEvent,
  OfficeConfig,
} from './types.js';

// ---------------------------------------------------------------------------
// Base Schemas
// ---------------------------------------------------------------------------

export const agentPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const agentNodeSchema = z.object({
  id: z.string(),
  role: z.enum([
    'Planner',
    'Planificator',
    'Librarian',
    'DB Architect',
    'Backend',
    'Connector',
    'Designer',
    'Tester',
    'Quality Gate',
    'Security',
    'Build Fixer',
  ]),
  department: z.enum([
    'Planning',
    'Library & Knowledge',
    'Data',
    'Backend',
    'Integration',
    'Design',
    'Test',
    'Quality',
    'Security',
    'Recovery / Fix',
  ]),
  status: z.enum(['idle', 'thinking', 'working', 'error', 'offline']),
  position: agentPositionSchema,
  currentTask: z.string().optional(),
  tokenUsage: z.number().optional(),
  sessionTime: z.number().optional(),
  lastEvent: z.string().optional(),
  lastEventAt: z.date().optional(),
});

// ---------------------------------------------------------------------------
// Event Schemas
// ---------------------------------------------------------------------------

export const officeEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('agent.status.updated'),
    payload: z.object({
      agentId: z.string(),
      activity: z.enum(['idle', 'thinking', 'working', 'error', 'offline']),
      task: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('agent.token.updated'),
    payload: z.object({
      agentId: z.string(),
      tokens: z.number(),
    }),
  }),
  z.object({
    type: z.literal('office.sync'),
    payload: z.object({
      agents: z.array(agentNodeSchema),
    }),
  }),
  z.object({
    type: z.literal('system.health'),
    payload: z.object({
      status: z.string(),
    }),
  }),
]);

// ---------------------------------------------------------------------------
// Inferred Types
// ---------------------------------------------------------------------------

export type AgentPositionSchema = z.infer<typeof agentPositionSchema>;
export type AgentNodeSchema = z.infer<typeof agentNodeSchema>;
export type OfficeEventSchema = z.infer<typeof officeEventSchema>;
