#!/usr/bin/env node
/**
 * scripts/generate-error-docs.ts
 * Generates docs/errors.md from packages/contracts/src/errors.ts.
 *
 * Usage:
 *   pnpm errors:docs   — regenerates docs/errors.md
 *   pnpm errors:check  — exits 1 if docs/errors.md is out of sync (CI gate)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ERRORS_TS = path.join(ROOT, 'packages/contracts/src/errors.ts');
const OUTPUT_MD = path.join(ROOT, 'docs/errors.md');

// ─── Parse error codes from errors.ts ────────────────────────────────────────

interface ErrorEntry {
  code: string;
  jsdoc: string;
  domain?: string;
  httpStatus?: string;
  retryable?: boolean;
}

function parseErrorCodes(source: string): ErrorEntry[] {
  const entries: ErrorEntry[] = [];
  // Match: /** JSDoc */ CODE: 'CODE' as ErrorCode
  const pattern = /\/\*\*\s*([\s\S]*?)\*\/\s+(\w+):\s+'(\w+)'\s+as\s+ErrorCode/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const jsdoc = match[1].trim().replace(/^\s*\*\s?/gm, '').trim();
    const code = match[3];
    entries.push({ code, jsdoc });
  }
  return entries;
}

function parseDomainMap(source: string): Map<string, string> {
  const map = new Map<string, string>();
  // Match: class LLMError extends NinjaError { ... super(code, message, 'llm', opts)
  const pattern = /class\s+(\w+Error)\s+extends\s+NinjaError[\s\S]*?super\(code,\s*message,\s*'(\w+)'/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    map.set(match[1], match[2]);
  }
  return map;
}

function inferDomain(code: string, domainMap: Map<string, string>): string {
  const prefixToDomain: Record<string, string> = {
    LLM_: 'llm',
    APPROVAL_: 'sentinel',
    ENGINE_: 'engine',
    ROSTER_: 'roster',
    BUDGET_: 'budget',
    VAULT_: 'vault',
    SHELL_: 'shell',
    FLOW_: 'flow',
    FS_: 'fs',
  };
  for (const [prefix, domain] of Object.entries(prefixToDomain)) {
    if (code.startsWith(prefix)) return domain;
  }
  return 'runtime';
}

function inferHttpStatus(code: string): string {
  if (code.includes('TIMEOUT')) return '504';
  if (code.includes('RATE_LIMITED')) return '429';
  if (code.includes('AUTH')) return '401';
  if (code.includes('SERVER')) return '502-503';
  if (code.includes('NOT_FOUND')) return '404';
  if (code.includes('DENIED') && !code.includes('INVALID')) return '403';
  if (code.includes('INVALID') || code.includes('INTAKE')) return '400';
  if (code.includes('FAILED') && code.includes('ALL')) return '503';
  return '500';
}

function inferRetryable(code: string): boolean {
  return (
    code.includes('TIMEOUT') ||
    code.includes('RATE_LIMITED') ||
    code.includes('SERVER') ||
    code.includes('ALL_PROVIDERS_FAILED') ||
    code.includes('COORDINATOR_FAILED') ||
    code.includes('PLAN_FAILED') ||
    code.includes('APPROVAL_TIMEOUT')
  );
}

// ─── Generate markdown table ──────────────────────────────────────────────────

function generateMarkdown(entries: ErrorEntry[]): string {
  const rows = entries
    .map((e) => {
      const retryable = inferRetryable(e.code) ? '✅' : '❌';
      const http = inferHttpStatus(e.code);
      const domain = inferDomain(e.code, new Map());
      return `| \`${e.code}\` | \`${domain}\` | ${http} | ${retryable} | ${e.jsdoc} |`;
    })
    .join('\n');

  return `# Error Codes Reference
> **Auto-generated** from \`packages/contracts/src/errors.ts\`. Do not edit manually.
> Run \`pnpm errors:docs\` to regenerate.

## Full Catalog

| Code | Domain | HTTP Status | Retryable | Description |
|------|--------|-------------|-----------|-------------|
${rows}

## Usage

\`\`\`ts
import { LLMError, ErrorCodes, isNinjaError, wrapUnknown } from '@ninja/contracts';

// Throw typed error
throw new LLMError(ErrorCodes.LLM_TIMEOUT, 'Request timed out', {
  retryable: true,
  httpStatus: 504,
  context: { model: 'gpt-4o' },
});

// Narrowing in catch
catch (e: unknown) {
  if (isNinjaError(e)) {
    console.log(e.code, e.domain, e.retryable);
  }
}

// Wrap unknown errors
catch (e: unknown) {
  throw wrapUnknown(e, ErrorCodes.LLM_CALL_FAILED, 'llm');
}
\`\`\`
`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const isCheckMode = process.argv.includes('--check');
const source = fs.readFileSync(ERRORS_TS, 'utf-8');
const entries = parseErrorCodes(source);

if (entries.length === 0) {
  console.error('❌ No error codes found in errors.ts — check the regex pattern.');
  process.exit(1);
}

const generated = generateMarkdown(entries);

if (isCheckMode) {
  if (!fs.existsSync(OUTPUT_MD)) {
    console.error('❌ docs/errors.md does not exist. Run: pnpm errors:docs');
    process.exit(1);
  }
  const existing = fs.readFileSync(OUTPUT_MD, 'utf-8');
  if (existing.trim() !== generated.trim()) {
    console.error('❌ docs/errors.md is out of sync with errors.ts. Run: pnpm errors:docs');
    process.exit(1);
  }
  console.log(`✅ docs/errors.md is up to date (${entries.length} error codes).`);
} else {
  // Ensure docs directory exists (it's tracked via .gitignore exception)
  const docsDir = path.dirname(OUTPUT_MD);
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(OUTPUT_MD, generated, 'utf-8');
  console.log(`✅ docs/errors.md generated with ${entries.length} error codes.`);
}
