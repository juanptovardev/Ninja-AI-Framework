# WP-D3 · T5.4 · forge-lab + integrations-engram tests

## Alcance
- `packages/forge-lab/**` (fixture + analyzer/normalizer/scorer tests)
- `packages/integrations-engram/**` (compressor/client/retriever/manager tests + fix FK)
- Este dossier.

## Hallazgo (bug real, corregido dentro del alcance)
- `EngramClient.store` fallaba contra SQLite `:memory:` con
  `no such table: main.sessions`: la tabla `memories` declaraba
  `FOREIGN KEY (sessionId) REFERENCES sessions(id)` pero `sessions`
  solo existe tras las migraciones de workbench.
- Fix: `packages/integrations-engram/src/engram-client.ts` — eliminada la
  cláusula FK huérfana (la columna `sessionId` se conserva como índice).

## Tests añadidos
- forge-lab: `__fixtures__/small-repo.ts`, `repo-analyzer.test.ts` (6),
  `normalizer.test.ts` (5), `quality-scorer.test.ts` (6).
- engram: `compressor.test.ts` (6), `engram-client.test.ts` (7, :memory:),
  `retriever.test.ts` (5), `memory-manager.test.ts` (2).
- Red mockeada (`vi.mock('@ninja/integrations-http')`); sin red real.

## Aceptación (output pegado)
```text
Test Files  7 passed (7)
     Tests  37 passed (37)
```

## Cobertura por paquete (% Lines, v8)
| Paquete | Lines | Detalle |
|---|---|---|
| forge-lab | 57.83% | normalizer 100%, repo-analyzer 94.66%, content-extractor 0%, promoter 0% |
| integrations-engram | 77.86% | compressor 89.36%, engram-client 88.63%, retriever 76.47%, memory-manager 53.44% |

Comando:
`pnpm vitest run packages/forge-lab packages/integrations-engram --coverage`
→ lines ≥50% en ambos. OK.

## Typecheck
- `pnpm --filter @ninja/forge-lab typecheck` → OK
- `pnpm --filter @ninja/integrations-engram typecheck` → OK
