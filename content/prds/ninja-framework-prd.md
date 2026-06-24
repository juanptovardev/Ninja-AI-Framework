# Ninja AI Framework v1.0 - Product Requirements Document

## 1. Executive Summary

Ninja AI Framework is a local-first, Windows-based platform for software construction, repair, planning, and evolution through multi-agent orchestration. It operates on two coordinated surfaces: an active terminal (Dojo CLI) and a localhost web dashboard (Forge Console), both running on a shared runtime (Kage Runtime) that exposes a unified experience for project planning, PRD generation, software building, working with existing repositories, knowledge reuse, and quality supervision.

## 2. Problem Statement

Current development workflows suffer from fragmentation between CLI tools and visual dashboards, lack of unified runtime for local development, and no systematic approach to multi-agent software engineering. Developers and AI agents lack a cohesive platform that provides:
- Unified orchestration of multiple specialized agents
- Integrated memory and learning systems
- Local-first operation without external dependencies
- Comprehensive observability and security supervision
- Systematic template-based software construction

## 3. Solution Overview

Ninja AI Framework addresses these issues by providing a complete local-first platform that combines:
- Multi-agent orchestration with 11 specialized agents
- Memory architecture with 4-layer persistence (HOT→FROZEN)
- Security supervision through Sentinel system
- Visual observability via Forge Console dashboard
- Template-based software construction and repair workflows

## 4. Target Users

- Windows-based software developers seeking AI-assisted development
- Small development teams requiring coordinated multi-agent workflows
- AI agents operating within IDEs needing structured development environments
- Organizations requiring local-first, secure software engineering platforms

## 5. Key Features

### 5.1 Core Features
- Build Mode / Repair Mode / Template Mode / Workspace Mode
- 11 specialized agents operating in Office Grid with multi-agent orchestration
- Memory architecture with 4 layers (HOT→WARM→COLD→FROZEN) coordinated by Vault
- Forge Console dashboard with 4 observability widgets
- Sentinel security supervisor system
- Catalog of 238+ models with automatic fallback system
- Integrated development environment with both CLI and visual interfaces

### 5.2 Technical Features
- Local-first operation with no mandatory remote dependencies
- Shared Kage Runtime between CLI and dashboard
- Event-driven architecture with @ninja/events
- Strict TypeScript implementation with Zod schema validation
- Comprehensive observability through Trace Ledger artifacts
- Security supervision through Sentinel policies

## 6. High-Level Architecture

### 6.1 Experience Layer
- Dojo CLI for terminal-based interaction
- Forge Console dashboard for visual management
- Office Grid for agent visualization

### 6.2 Runtime Layer
- Kage Runtime as shared HTTP/WebSocket server
- Lifecycle management for coordinated operations
- Event bus architecture for system communication

### 6.3 Domain Layer
- Kage Engine for multi-agent orchestration
- Flow Matrix for workflow execution
- Arsenal Registry for skills and tools management
- Workbench for workspace management
- Trace Ledger for artifact and session tracking
- Sentinel for security supervision
- Model Gateway for 238+ model catalog with intelligent selection

### 6.4 Integration Layer
- Engram for warm memory (differential compression 5:1)
- LightRAG for cold memory (chunking with 20:1 compression)
- LLM provider integrations (OpenAI-compatible)
- Shell, Git, Filesystem, and HTTP adapters

## 7. Technical Requirements

### 7.1 Stack Requirements
- Language: TypeScript strict (no `any`, no `as any`)
- Package Manager: pnpm 9.x with workspace:* for internal packages
- Monorepo: Turborepo 2.9.x with parallel pipelines
- Runtime: Node.js 18+ with native fetch
- Bundler: tsup 8.x for CJS + ESM + DTS
- Validation: Zod for schemas and events
- Testing: Vitest + Playwright
- HTTP Server: Fastify for kage-runtime only
- Frontend: React + Next.js + Tailwind for forge-console only
- Animation: GSAP (selective, controlled)
- Persistence: SQLite (better-sqlite3) for @ninja/storage only
- Memory: Engram via integrations-engram
- Indexing: LightRAG via integrations-lightrag (HTTP → Python process)

### 7.2 Dependencies
- Foundation packages: @ninja/contracts, @ninja/config, @ninja/logging, @ninja/common-utils, @ninja/storage, @ninja/events, @ninja/vault
- Domain packages: @ninja/flow-matrix, @ninja/arsenal-registry, @ninja/workbench, @ninja/trace-ledger, @ninja/sentinel, @ninja/model-gateway, @ninja/pulse-center, @ninja/learning-loop, @ninja/forge-lab, @ninja/office-grid, @ninja/ui-kit, @ninja/app-shell
- Integration packages: @ninja/integrations-engram, @ninja/integrations-lightrag, @ninja/integrations-llm, @ninja/integrations-shell, @ninja/integrations-git, @ninja/integrations-http, @ninja/integrations-fs

## 8. Security Model

### 8.1 Sentinel Security System
- Policy engine with pre-loaded security policies
- Approval management with dual confirmation
- Audit of sensitive actions
- Guardian control desk for failure intervention
- Action control for sensitive operations

### 8.2 Security Controls
- All sensitive actions observed, controlled, and approved
- Double confirmation for important operations
- Tracing of all relevant actions
- Learning control without automatic knowledge promotion

## 9. Observability Model

### 9.1 Forge Console Dashboard
- Mission Control, Discovery, Plan, Review & Approvals views
- Build Queue and Execution monitoring
- Health and Office Grid visualization
- Settings management

### 9.2 Code-HUD Right Rail
- TokenMeter for real-time token usage
- AgentStatus for visual agent state
- SessionTimer for active session tracking
- ContextDepth for agent context monitoring

## 10. Integration Strategy

### 10.1 Model Gateway Integration
- 238+ models with 25+ providers from free-coding-models
- Dynamic provider selection by task/agent
- Balance of cost, capacity, and latency
- Dynamic Quota Control and Fallback
- Token budget verification pre-call

### 10.2 External Integration Policy
- Engram integration without modification, minimal necessary integration only
- LightRAG as separate Python process (localhost) with HTTP adapter
- No forking or reimplementation of external systems
- Expose via internal contracts (@ninja/contracts)

## 11. Memory Architecture

### 11.1 4-Layer Memory System (Vault-coordinated)
- HOT: Active agent runtime (uncompressed)
- WARM: Engram (differential compression 5:1)
- COLD: LightRAG (semantic chunking 20:1)
- FROZEN: Trace Ledger (Memory Anchors, never compressed)

### 11.2 Memory Operations
- vault.getContext(agentId, task) for optimized context
- vault.writeContext(agentId, output) for agent namespace writing
- vault.compressContext(context) for adapter delegation
- vault.extractAnchors(session) for FROZEN promotion

## 12. Development Roadmap

### 2.1 Completed Phases (0-8)
- Foundation & Bootstrap, Runtime Base, Terminal Client + Persistence
- Motor de Orquestación with LLM integration
- Supervision and Control systems
- Intelligence and Memory layers
- UI Base implementation
- Office Digital environment
- External Integrations

### 2.2 Phase 9 - Hardening and Dogfooding
- Complete testing suite with Playwright
- Security hardening and performance tuning
- Dogfooding demonstration (Ninja builds parts of itself)
- Complete documentation and content pack
- MCP Protocol exposure (optional external exposure)

## 13. Success Metrics

- All 28 @ninja/* packages build with green status
- Typecheck passes without errors
- No premature business logic introduction
- Plan Master compliance in all modules
- Event emission via @ninja/events in all packages
- Delivery of structured FEEDBACK REPORT for all modules