import type { NinjaSkill } from '../types.js';

/**
 * Default Ninja skills injected into every agent's skills directory.
 * These skills provide core orchestration capabilities for the Ninja AI Framework.
 */
export function getDefaultSkills(): NinjaSkill[] {
  return [
    {
      id: 'ninja-sdd-orchestrator',
      filename: 'ninja-sdd-orchestrator.md',
      content: `# Ninja SDD Orchestrator

## Spec-Driven Development Workflow

Ninja uses an 8-phase SDD workflow for systematic, auditable changes:

| Phase | Purpose |
|-------|---------|
| \`/sdd-explore\` | Investigate codebase, compare approaches, no files created |
| \`/sdd-propose\` | Write change proposal with intent, scope, approach |
| \`/sdd-spec\` | Write delta specifications with requirements |
| \`/sdd-design\` | Create technical design with architecture decisions |
| \`/sdd-tasks\` | Break down into implementation checklist |
| \`/sdd-apply\` | Implement tasks writing actual code |
| \`/sdd-verify\` | Validate implementation against specs |
| \`/sdd-archive\` | Sync delta specs to main, archive change |

## Delegation Rules

Keep orchestrator thread thin — delegate heavy work:

- **Inline**: Read 1-3 files to decide, write one atomic file
- **Delegate**: Read 4+ files, write multiple files, run tests/build

## Golden Rules

1. Never skip phases — each builds on the previous
2. Archive every change — main specs stay current
3. One commit per task — atomic, verifiable changes
4. Tests required — no merge without verification
`,
    },
    {
      id: 'ninja-engram-protocol',
      filename: 'ninja-engram-protocol.md',
      content: `# Engram Persistent Memory Protocol

## Overview

Engram is a persistent memory system that survives across sessions and compactions.

## Mandatory Save Triggers

Call \`mem_save\` immediately after:

- Architecture or design decision made
- Team convention established
- Bug fix completed (include root cause)
- Feature implemented with non-obvious approach
- Configuration change or environment setup
- Non-obvious discovery about codebase
- Gotcha or edge case found

## Content Format

\`\`\`
**What**: One sentence — what was done
**Why**: What motivated it (user request, bug, performance)
**Where**: Files or paths affected
**Learned**: Gotchas, edge cases, surprises (omit if none)
\`\`\`

## Search Protocol

Before starting work:
1. Call \`mem_context\` — recent session history (fast)
2. Call \`mem_search\` — full-text search with keywords
3. Use \`mem_get_observation\` — full untruncated content

## Session Close

Always call \`mem_session_summary\` before ending:

\`\`\`
## Goal
[What we worked on]

## Discoveries
- [Technical findings]

## Accomplished
- [Completed items]

## Next Steps
- [What remains]

## Relevant Files
- path/to/file — [what changed]
\`\`\`
`,
    },
    {
      id: 'ninja-conventions',
      filename: 'ninja-conventions.md',
      content: `# Ninja Code Conventions

## TypeScript Standards

### Types

- No \`any\` types — use \`unknown\` with type guards
- Explicit return types on functions
- Interface over type alias for object shapes
- Prefix interfaces with \`I\` only for DI abstractions

### Naming

- PascalCase: classes, interfaces, types
- camelCase: variables, functions, methods
- CONSTANT_CASE: literal constants, enums
- kebab-case: file names

### Imports

- Absolute imports: \`@ninja/package-name\`
- Group imports: stdlib → third-party → internal
- No circular dependencies — use dependency injection

### Error Handling

- Throw custom Error classes with context
- Never swallow errors — log or rethrow
- Use Result<T, E> pattern for recoverable errors

### Async/Await

- Always await promises — no floating promises
- Use Promise.all for parallel independent operations
- Timeout long-running operations

## Forbidden Patterns

- ❌ axios — use native fetch
- ❌ var — use const/let
- ❌ default exports — use named exports only
- ❌ magic strings — extract to constants
`,
    },
  ];
}