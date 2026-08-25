# 🥷 Ninja AI Framework

Plataforma local-first de ingeniería asistida por IA con runtime único,
dashboard observable, oficina digital multiagente y aprendizaje controlado.

## Stack

- pnpm workspaces + Turborepo
- TypeScript strict
- Fastify · SQLite · Zod · Vitest

## Desarrollo

\`\`\`bash
pnpm install
pnpm build
pnpm runtime:dev # Levanta kage-runtime en :3141
\`\`\`

## Estado

- ✅ Foundation (Fases 0–7): runtime, CLI, persistencia, motor de orquestación, Pulse + Sentinel, memoria 4 capas, UI
- ✅ EPIC A: Hygiene & Coherencia (S0–S5)
- ✅ EPIC B: Correctitud crítica & Seguridad P0 (WP-B1..B15)
- 🟡 EPIC C: Resiliencia & Error Handling (50% — WP-C1 y WP-C2 cerrados)

**Tests:** 766 passing (+1 skipped) · **Commits:** 100 · **Branch activo:** `fix/epic-b-foundations`

```
