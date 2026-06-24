/**
 * @ninja/kage-runtime — env-schema.ts
 * Zod-validated environment variables with fail-fast boot.
 * ADR: docs/adr/0004-env-validation-strategy.md
 */
import { z } from 'zod';

export const EnvSchema = z.object({
  // ── Required ─────────────────────────────────────────────────────
  LLM_BASE_URL: z.string().url('LLM_BASE_URL must be a valid URL (e.g. https://api.openai.com/v1)'),
  LLM_API_KEY: z.string().min(8, 'LLM_API_KEY requerida (≥8 chars)'),
  LLM_DEFAULT_MODEL: z.string().min(1, 'LLM_DEFAULT_MODEL cannot be empty'),
  // ── Optional with defaults ────────────────────────────────────────
  LLM_PROVIDER: z.string().default('openai'),
  NINJA_RUNTIME_PORT: z.coerce.number().int().positive().default(3141),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  LIGHTRAG_API_URL: z.string().url().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // ── Feature flag — ADR-0003 ───────────────────────────────────────
  /** Controls behavior when LLM fallback chain is exhausted.
   *  strict (default): throw LLMError → task.failed
   *  legacy: return fallback object for backward compat (WP-B6 transition) */
  NINJA_LLM_FAIL_MODE: z.enum(['strict', 'legacy']).default('strict'),
  /** Per-session token budget for pre-call enforcement (WP-B4). Absent = unlimited. */
  NINJA_SESSION_TOKEN_BUDGET: z.coerce.number().int().positive().optional(),
});

export type NinjaEnv = z.infer<typeof EnvSchema>;

/**
 * Parse and validate env vars. Throws ZodError if invalid.
 * Testeable — no process.exit side effects.
 */
export function parseEnv(env: Record<string, string | undefined>): NinjaEnv {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}

/**
 * Load and validate process.env. Exits with code 1 on failure.
 * Call this once at boot before any LLM or service initialization.
 */
export function loadEnv(): NinjaEnv {
  try {
    return parseEnv(process.env as Record<string, string | undefined>);
  } catch (e) {
    console.error('\n❌ Kage Runtime cannot start — invalid environment variables:');
    console.error((e as Error).message);
    console.error('\nSee .env.example for required variables.\n');
    process.exit(1);
  }
}
