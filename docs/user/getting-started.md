# Getting Started — Ninja AI Framework

## Prerequisites

- Node.js 22+
- pnpm 9+
- An LLM API key (OpenAI-compatible endpoint)

## Installation

```bash
git clone <repo-url>
cd ninja-ai-framework
pnpm install
cp .env.example .env
# Edit .env with your values
pnpm runtime:dev
```

## Required Environment Variables

| Variable | Description |
|----------|-------------|
| `LLM_BASE_URL` | Your LLM provider base URL (e.g. `https://api.openai.com/v1`) |
| `LLM_API_KEY` | Your API key (minimum 8 characters) |
| `LLM_DEFAULT_MODEL` | Model to use (e.g. `gpt-4o-mini`) |

## Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NINJA_LLM_FAIL_MODE` | `strict` | `strict` = fail hard on missing config; `legacy` = warn and continue |
| `NINJA_SESSION_TOKEN_BUDGET` | unlimited | Max tokens per session |
| `NEXT_PUBLIC_RUNTIME_WS_URL` | `ws://localhost:3141` | WebSocket URL for Forge Console |

## Quick Start

```bash
pnpm runtime:dev   # Start kage-runtime on :3141
pnpm console:dev   # Start Forge Console on :3001
pnpm dojo          # Start Dojo CLI
```

Open your browser at [http://localhost:3001](http://localhost:3001) to access Forge Console.
