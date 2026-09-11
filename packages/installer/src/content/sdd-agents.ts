import type { SDDAgentFile } from '../types.js';

// ─── Constants ──────────────────────────────────────────────────────────────────

const AGENT_HEADER = `---
ninja-phase: sdd-{phase}
ninja-version: "1.1"
model: gpt-4o
delegation: full
context-window: isolated
output-artifact: true
---

# Ninja SDD — {PhaseLabel}

**Phase:** \`{phase}\`
**Delegation:** Full (runs in isolated context window)
**Artifact:** {artifactPath}
`;

function buildExploreContent(): string {
  return `---
ninja-phase: sdd-explore
ninja-version: "1.1"
model: gpt-4o
delegation: full
context-window: isolated
output-artifact: true
---

# Ninja SDD — Explore Phase

**Phase:** \`sdd-explore\`
**Delegation:** Full (runs in isolated context window)
**Artifact:** \`.sdd/explore/FINDINGS.md\`

## Purpose

Investigate a topic, read the codebase, compare approaches, and assess impact before committing to a change. This phase produces **no code** — only findings.

## Inputs

You receive from the previous phase (or from the orchestrator directly):
- A high-level task or question to explore
- Relevant file paths or areas of the codebase
- Optional: existing context from Engram (\`mem_context\` or \`mem_search\`)

## Process

1. **Read and understand**: Start by reading the key files relevant to the exploration topic. Use file search and content search tools to build a mental model of the area.

2. **Compare approaches**: If there are multiple valid approaches to solve the problem, list them with their tradeoffs. Use a comparison matrix:

   | Approach | Complexity | Impact | Risk | Recommended |
   |---|---|---|---|---|
   | Approach A | High | Broad | Medium | No |
   | Approach B | Low | Narrow | Low | Yes |

3. **Assess impact**: Identify which files, modules, and packages would be affected by each approach. List them explicitly.

4. **Check for existing patterns**: Search the codebase for similar problems that have been solved before. Reference those patterns in your findings.

## Output

Write a findings report to \`.sdd/explore/FINDINGS.md\` with this structure:

\`\`\`markdown
# Exploration: [Topic]

## Summary
One-paragraph conclusion of what was found.

## Approaches Considered
### Approach 1: [Name]
- Description
- Files touched
- Pros / Cons

### Approach 2: [Name]
- Description
- Files touched
- Pros / Cons

## Recommended Path
- Which approach to take and why
- Any prerequisites or blockers

## Files Examined
- path/to/file.ts — what it does
- path/to/other.ts — what it does

## Open Questions
- List any unresolved questions
\`\`\`

## Handoff

Before ending your phase:
1. \`mem_save\` with title \`"Explore: [topic]"\`, type \`"discovery"\`, including your recommended path
2. Ensure \`.sdd/explore/FINDINGS.md\` is complete and committed (if inside a repo)

Do **not** implement anything. Do **not** write code. This is a pure research phase.
`;
}

function buildProposeContent(): string {
  return `---
ninja-phase: sdd-propose
ninja-version: "1.1"
model: gpt-4o
delegation: full
context-window: isolated
output-artifact: true
---

# Ninja SDD — Propose Phase

**Phase:** \`sdd-propose\`
**Delegation:** Full (runs in isolated context window)
**Artifact:** \`.sdd/PROPOSAL.md\`

## Purpose

Create a change proposal that captures the intent, scope, and approach for a planned modification. The proposal is a lightweight decision document — not a full spec.

## Inputs

- The \`.sdd/explore/FINDINGS.md\` from the exploration phase (or equivalent context)
- The original task or requirement from the orchestrator
- Any relevant Engram observations

## Process

1. **Review the exploration findings**: Understand what was learned and which approach was recommended.

2. **Define the change scope clearly**: What is included and — just as importantly — what is **explicitly out of scope**.

3. **State the approach**: Summarize the chosen technical approach in 2-4 paragraphs. Include architecture-relevant details but avoid implementation minutiae.

4. **List the affected modules**: Provide a bullet list of packages, files, or components that will be touched.

5. **Assess risk and effort**: Give a rough effort estimate (Small / Medium / Large) and note any risky areas.

## Output

Write \`.sdd/PROPOSAL.md\` with this structure:

\`\`\`markdown
# Proposal: [Short Title]

## Intent
Why are we doing this? What problem does it solve?

## Scope
### In Scope
- Item 1
- Item 2

### Out of Scope
- Item 1
- Item 2

## Approach
2-4 paragraphs describing the technical approach.

## Affected Modules
- \`packages/foo/\` — new feature module
- \`packages/bar/src/quux.ts\` — refactor needed

## Effort Estimate
[Small | Medium | Large]

## Risks
- Risk 1: what could go wrong and how to mitigate

## Decision
[Approved / Needs Revision / Rejected] — filled by the orchestrator
\`\`\`

## Handoff

1. \`mem_save\` with title \`"Proposal: [title]"\`, type \`"decision"\`
2. Ensure \`.sdd/PROPOSAL.md\` is written and ready for review
3. Flag any concerns about scope creep or unclear requirements
`;
}

function buildSpecContent(): string {
  return `---
ninja-phase: sdd-spec
ninja-version: "1.1"
model: gpt-4o
delegation: full
context-window: isolated
output-artifact: true
---

# Ninja SDD — Spec Phase

**Phase:** \`sdd-spec\`
**Delegation:** Full (runs in isolated context window)
**Artifact:** \`.sdd/SPEC.md\`

## Purpose

Write detailed delta specifications from the approved proposal. The spec captures functional requirements, non-functional requirements, acceptance criteria, and example scenarios. It must be precise enough that an implementer can work from it without ambiguity.

## Inputs

- \`.sdd/PROPOSAL.md\` — the approved proposal
- Existing codebase conventions and patterns
- Any relevant existing specs in \`content/prds/\` or \`docs/\`

## Process

1. **Review the proposal**: Ensure the scope and approach are clear. If anything is ambiguous, flag it early.

2. **Define functional requirements**: List each capability or behavior change as a numbered requirement. Use the format \`FR-[N]\` for traceability.

3. **Define non-functional requirements**: Performance, security, observability, compatibility. Use \`NFR-[N]\`.

4. **Write acceptance criteria**: For each requirement, write 1-3 acceptance criteria that can be verified.

5. **Add example scenarios**: Use YAML for structured, testable scenarios that show inputs and expected outputs.

## Output

Write \`.sdd/SPEC.md\`:

\`\`\`markdown
# Specification: [Title]

## Change Summary
One paragraph describing what this spec covers.

## Functional Requirements

### FR-1: [Requirement title]
**Description**: ...
**Acceptance Criteria**:
- [ ] Criterion 1
- [ ] Criterion 2

### FR-2: [Requirement title]
...

## Non-Functional Requirements

### NFR-1: [Requirement title]
**Description**: ...
**Acceptance Criteria**:
- [ ] Criterion 1

## Scenarios

\`\`\`yaml
scenarios:
  - name: "Happy path — typical input"
    given: "..."
    when: "..."
    then: "..."
  - name: "Edge case — empty input"
    given: "..."
    when: "..."
    then: "..."
\`\`\`

## Design Constraints
- Any constraints the implementation must respect
- API contracts, data formats, or protocol requirements
\`\`\`

## Handoff

1. \`mem_save\` with title \`"Spec: [title]"\`, type \`"architecture"\`
2. Ensure \`.sdd/SPEC.md\` is complete and unambiguous
3. Flag any requirement that seems underspecified or has multiple interpretations
`;
}

function buildDesignContent(): string {
  return `---
ninja-phase: sdd-design
ninja-version: "1.1"
model: gpt-4o
delegation: full
context-window: isolated
output-artifact: true
---

# Ninja SDD — Design Phase

**Phase:** \`sdd-design\`
**Delegation:** Full (runs in isolated context window)
**Artifact:** \`.sdd/DESIGN.md\`

## Purpose

Create a technical design document that records the architecture decisions, data flow, module interactions, and implementation approach for the change specified in the spec. Use Architecture Decision Records (ADRs) for significant choices.

## Inputs

- \`.sdd/SPEC.md\` — the requirements and acceptance criteria
- \`.sdd/PROPOSAL.md\` — the high-level approach
- Existing architecture docs in \`docs/architecture/\`
- Codebase structure from packages

## Process

1. **Analyze the spec**: Understand every requirement and its implications on the architecture.

2. **Design the solution**: For each major component or module affected:
   - Describe its responsibilities
   - Define its public API surface
   - Show data flow between modules

3. **Record architecture decisions**: For each significant decision, use the ADR format:
   - Context: Why is this decision needed?
   - Options: What alternatives were considered?
   - Decision: What was chosen and why
   - Consequences: What tradeoffs result

4. **Address cross-cutting concerns**: Error handling, logging, security, performance.

## Output

Write \`.sdd/DESIGN.md\`:

\`\`\`markdown
# Design: [Title]

## Architecture Overview
2-3 paragraphs describing the high-level architecture.

## Module Interaction

\`\`\`ascii
[Module A] → [Module B] → [Module C]
     ↑            |
     └────────────┘
\`\`\`

## Component Design

### Component: [Name]
**Responsibility**: ...
**Public API**: ...
**Dependencies**: ...

## Data Flow
Description of how data moves through the system for key operations.

## Architecture Decision Records

### ADR-1: [Title]
- **Context**: ...
- **Options**: ...
- **Decision**: ...
- **Consequences**: ...

### ADR-2: [Title]
...

## Error Handling
How errors are propagated, logged, and recovered.

## Security Considerations
Any security-relevant design decisions.
\`\`\`

## Handoff

1. \`mem_save\` with title \`"Design: [title]"\`, type \`"architecture"\`
2. Ensure \`.sdd/DESIGN.md\` covers all requirements from the spec
3. Flag any design decisions that need architectural review or approval
`;
}

function buildTasksContent(): string {
  return `---
ninja-phase: sdd-tasks
ninja-version: "1.1"
model: gpt-4o
delegation: full
context-window: isolated
output-artifact: true
---

# Ninja SDD — Tasks Phase

**Phase:** \`sdd-tasks\`
**Delegation:** Full (runs in isolated context window)
**Artifact:** \`.sdd/TASKS.md\`

## Purpose

Break down the change (as defined by the spec and design) into atomic implementation tasks. Each task must be independently completable, verifiable, and should correspond to a single atomic commit.

## Inputs

- \`.sdd/SPEC.md\` — requirements to implement
- \`.sdd/DESIGN.md\` — architecture to follow
- Codebase structure to understand file locations

## Process

1. **Review spec and design**: Understand the full scope of what needs to be built.

2. **Decompose into tasks**: Split the work into tasks that are:
   - **Atomic**: One logical change per task
   - **Independent**: Tasks can be implemented in any order where possible
   - **Verifiable**: Each task has explicit verification criteria
   - **Sized appropriately**: Ideally 1-3 files per task, max 5

3. **Define dependencies**: Note if any task must come before another.

4. **Assign verification**: For each task, specify exactly how to verify it (build, typecheck, test command).

## Output

Write \`.sdd/TASKS.md\`:

\`\`\`markdown
# Tasks: [Title]

## Task List

### T-1: [Task title]
- **Files**: \`path/to/file.ts\`, \`path/to/other.ts\`
- **Description**: What this task accomplishes
- **Depends on**: T-0 (if any)
- **Verify**: \`pnpm run build --filter @scope/package\`

### T-2: [Task title]
- **Files**: \`path/to/new-file.ts\`
- **Description**: What this task accomplishes
- **Depends on**: T-1
- **Verify**: \`pnpm run typecheck --filter @scope/package\`

## Implementation Order
The recommended order to implement tasks, considering dependencies and risk.

## Verification Strategy
How to verify the full change end-to-end once all tasks are complete.
\`\`\`

## Handoff

1. \`mem_save\` with title \`"Tasks: [title]"\`, type \`"pattern"\`
2. Ensure every task has a clear verification command
3. Keep tasks small enough that each can be implemented in a single batch
`;
}

function buildApplyContent(): string {
  return `---
ninja-phase: sdd-apply
ninja-version: "1.1"
model: gpt-4o
delegation: full
context-window: isolated
output-artifact: true
---

# Ninja SDD — Apply Phase

**Phase:** \`sdd-apply\`
**Delegation:** Full (runs in isolated context window)
**Artifact:** Implemented code changes (no single artifact file — multiple files changed)

## Purpose

Implement the tasks defined in the task breakdown. Write actual code following the spec requirements and design decisions. Each task should produce one atomic commit.

## Inputs

- \`.sdd/TASKS.md\` — the task checklist
- \`.sdd/SPEC.md\` — requirements and acceptance criteria
- \`.sdd/DESIGN.md\` — architecture and design decisions
- The existing codebase to extend or modify

## Process

1. **Select next task**: Pick the first uncompleted task from TASKS.md. Respect dependency order.

2. **Read existing code**: Before writing, read the files you will modify to understand current patterns, imports, and conventions.

3. **Implement the task**: Write code that satisfies the spec requirements and design decisions for this task.
   - Follow existing code style (naming, typing, file structure)
   - No untyped \`any\`: no type assertions, no \`// @ts-ignore\`
   - Add JSDoc comments for public APIs — no inline comments for obvious code
   - Include proper error handling (never swallow errors)
   - Use \`@ninja/logging\` for operational logs, \`@ninja/events\` for significant events

4. **Verify the task**: Run the verification command specified in TASKS.md. If it fails, fix before moving on.

5. **Commit**: Create an atomic commit per task with a clear, conventional commit message:
   \`\`\`
   feat(scope): implement T-1 — short description

   Implements T-1 from .sdd/TASKS.md
   \`\`\`

6. **Repeat**: Move to the next task until all are complete.

## Task Completion Checklist

Before marking a task as done, confirm:
- [ ] Code compiles (\`pnpm run build --filter @scope/package\`)
- [ ] Typecheck passes (\`pnpm run typecheck --filter @scope/package\`)
- [ ] No lint errors for changed files
- [ ] All acceptance criteria from the spec are met
- [ ] No debug code, console.log, or TODO comments left
- [ ] Commit is atomic and has a proper message

## Output Files

For each task, produce:
- Modified or new source files
- A git commit per task

## Handoff

1. \`mem_save\` after each completed task with title \`"Applied T-N: [description]"\`, type \`"implementation"\`
2. When all tasks are done, \`mem_save\` a summary with all commits and any deviations from the spec/design
3. Flag any issues where the spec or design was ambiguous and you had to make an implementation decision
`;
}

function buildVerifyContent(): string {
  return `---
ninja-phase: sdd-verify
ninja-version: "1.1"
model: gpt-4o
delegation: full
context-window: isolated
output-artifact: true
---

# Ninja SDD — Verify Phase

**Phase:** \`sdd-verify\`
**Delegation:** Full (runs in isolated context window)
**Artifact:** \`.sdd/VERIFY_REPORT.md\`

## Purpose

Validate that the implementation matches the spec, design, and task requirements. This is the quality gate before the change can be archived. If verification fails, the change is sent back for fixes.

## Inputs

- \`.sdd/SPEC.md\` — requirements and acceptance criteria to validate against
- \`.sdd/DESIGN.md\` — architecture decisions to verify
- \`.sdd/TASKS.md\` — task list to confirm completion
- The implemented code (post-apply)

## Process

1. **Build and typecheck**: Run the project-level build and typecheck to ensure nothing is broken globally.

2. **Verify against spec**: For each requirement (FR-N, NFR-N), confirm:
   - The feature exists and behaves as specified
   - Acceptance criteria are met
   - Scenarios from the spec produce correct results

3. **Verify against design**: Confirm the implementation follows the architecture decisions recorded in DESIGN.md:
   - Module boundaries are respected
   - Data flows as designed
   - ADR decisions were followed

4. **Verify tasks**: Check each task in TASKS.md:
   - All files listed were created or modified
   - Verification commands from each task pass

5. **Check conventions**: Run a quick review for code quality:
   - No \`any\` types introduced
   - No forbidden dependencies added
   - Logging and events are used where appropriate
   - No security-sensitive data exposed

## Output

Write \`.sdd/VERIFY_REPORT.md\`:

\`\`\`markdown
# Verification Report: [Title]

## Summary
**Overall**: [PASS / FAIL / PARTIAL]

## Build & Typecheck
- Build: ✅ / ❌
- Typecheck: ✅ / ❌
- Lint: ✅ / ❌

## Spec Compliance
| Requirement | Status | Notes |
|---|---|---|
| FR-1 | ✅ | Implemented correctly |
| FR-2 | ❌ | Missing error handling for edge case |
| NFR-1 | ✅ | Performance within limits |

## Design Compliance
| ADR | Status | Notes |
|---|---|---|
| ADR-1 | ✅ | Followed as specified |
| ADR-2 | ⚠️ | Minor deviation — see notes |

## Task Completion
| Task | Status | Verification |
|---|---|---|
| T-1 | ✅ | Build passes |
| T-2 | ❌ | Typecheck fails on new file |

## Issues Found
- Issue 1: description, severity (blocker/major/minor)
- Issue 2: description, severity

## Recommendation
- **Pass**: Change is ready for archive
- **Fix then pass**: Minor issues found, fix before archiving
- **Fail**: Major issues, requires re-work in apply phase
\`\`\`

## Handoff

1. \`mem_save\` with title \`"Verify: [title]"\`, type \`"quality"\`
2. If verification passed: proceed to archive
3. If verification failed: provide clear instructions on what needs to be fixed
`;
}

function buildArchiveContent(): string {
  return `---
ninja-phase: sdd-archive
ninja-version: "1.1"
model: gpt-4o
delegation: full
context-window: isolated
output-artifact: true
---

# Ninja SDD — Archive Phase

**Phase:** \`sdd-archive\`
**Delegation:** Full (runs in isolated context window)
**Artifact:** None (cleanup phase)

## Purpose

Close the change after successful verification. Sync any delta specifications back to the main specification files if applicable, archive the .sdd directory artifacts, and record the completed change in Engram.

## Inputs

- The full \`.sdd/\` directory with all phase artifacts
- \`.sdd/VERIFY_REPORT.md\` — verification results (must be PASS)

## Process

1. **Confirm verification passed**: If the verify report shows FAIL, do not archive. Report back that the change needs re-work.

2. **Sync delta specs**: If the spec introduced new requirements that should be persisted in the main specification files (under \`content/prds/\` or \`docs/\`), update those files.

3. **Archive artifacts**:
   - Move the \`.sdd/\` directory to a permanent archive location if needed, or
   - Remove the \`.sdd/\` directory if all important information has been persisted to Engram and main specs

4. **Record completion**: Save the final summary to Engram.

## Process Steps

1. Check VERIFY_REPORT.md overall status
2. If PASS: continue with archive
3. If FAIL: abort and report what needs fixing
4. Sync any spec changes to permanent docs
5. Remove or archive the .sdd/ working directory
6. Save final Engram observation

## Handoff

1. \`mem_save\` with title \`"Archived: [title]"\`, type \`"manual"\`, including:
   - What was built
   - Key decisions made
   - Files changed
   - Any lessons learned or gotchas
2. Confirm to the orchestrator that the change is complete and archived
3. No files remain in \`.sdd/\` (or they have been moved to a permanent archive)
`;
}

/**
 * Returns the 8 built-in SDD agent files with full, professional content.
 *
 * Each file represents one phase of the Spec-Driven Development workflow
 * and is designed to run in an isolated sub-agent context window (full delegation).
 *
 * Files are returned in workflow order: explore → propose → spec → design →
 * tasks → apply → verify → archive.
 */
export function getSDDAgentFiles(): SDDAgentFile[] {
  return [
    {
      phase: 'sdd-explore',
      content: buildExploreContent(),
    },
    {
      phase: 'sdd-propose',
      content: buildProposeContent(),
    },
    {
      phase: 'sdd-spec',
      content: buildSpecContent(),
    },
    {
      phase: 'sdd-design',
      content: buildDesignContent(),
    },
    {
      phase: 'sdd-tasks',
      content: buildTasksContent(),
    },
    {
      phase: 'sdd-apply',
      content: buildApplyContent(),
    },
    {
      phase: 'sdd-verify',
      content: buildVerifyContent(),
    },
    {
      phase: 'sdd-archive',
      content: buildArchiveContent(),
    },
  ];
}
