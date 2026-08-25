import { z } from 'zod';

export const ShellExecuteSchema = z.object({
  cmd: z.string().min(1).max(200),
  args: z.array(z.string()).max(50).optional().default([]),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().max(300000).optional(),
});

export const EngineSubmitSchema = z.object({
  prompt: z.string().min(1).max(50000),
  workflowId: z.string().uuid().optional(),
  sessionId: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const VaultWriteSchema = z.object({
  layer: z.enum(['HOT', 'WARM', 'COLD', 'ANCHORS']),
  content: z.string().min(1),
  agentId: z.string().optional(),
  sessionId: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const GitCommitSchema = z.object({
  message: z.string().min(1).max(2000),
  repoPath: z.string().optional(),
  amend: z.boolean().optional(),
});

export const RosterAssignSchema = z.object({
  clientId: z.string().min(1),
  role: z.enum(['orchestrator', 'executor', 'observer', 'admin']),
});

export type ShellExecuteBody = z.infer<typeof ShellExecuteSchema>;
export type EngineSubmitBody = z.infer<typeof EngineSubmitSchema>;
export type VaultWriteBody = z.infer<typeof VaultWriteSchema>;
export type GitCommitBody = z.infer<typeof GitCommitSchema>;
export type RosterAssignBody = z.infer<typeof RosterAssignSchema>;
