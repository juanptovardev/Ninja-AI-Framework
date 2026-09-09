# WP-D3 — logging + learning-loop suites (T5.3)

**Estado:** ✅ · **Rama:** `feat/wp-d3-logloop` · **Coverage:** learning-loop 98.31% líneas · logging 98.43% líneas (meta ≥50% superada en ambos).

## Alcance

- `packages/learning-loop/src/harvester.test.ts`, `evaluator.test.ts`, `promoter.test.ts`, `compression-learner.test.ts` (tests nuevos del worker T5.3)
- `packages/logging/src/logger.levels.test.ts` (nuevo)
- `packages/logging/src/logger.ts` (+4 líneas: nivel `'silent'` + orden — micro-cambio de producción para silenciar logs en tests, backward-compatible)
- `packages/learning-loop/src/promoter.test.ts` reescrito por orquestador: fake en memoria en vez del EngramClient real (ver Decisiones)

## Evidencia

```
pnpm vitest run packages/learning-loop packages/logging → 6 files, 61 tests passed
pnpm --filter @ninja/learning-loop typecheck → exit 0
pnpm --filter @ninja/logging typecheck → exit 0
npx eslint packages/learning-loop/src/promoter.test.ts → exit 0
```

## Decisiones

1. **Mock en vez de cliente real en promoter.test.ts** — el test original importaba `EngramClient`
   (L3) desde learning-loop (L2) y el hook G1 lo bloqueó correctamente (`no-restricted-imports`).
   Solución: `FakeEngramClient` en memoria con semántica observable (store por sessionId + error
   de FK ante sessionId desconocido). El tipo estructural se deriva del SUT
   (`ConstructorParameters<typeof LearningPromoter>[0]`) — cero imports L3, ni siquiera de tipo
   (la regla también bloquea `import type`). Los 5 tests conservan sus asserts originales.
2. **Nivel `'silent'` en logger.ts** — necesario para `setGlobalLogLevel('silent')` en tests sin
   spam; no altera el orden de niveles existentes.
3. **Intento previo fallido (documentado):** el primer worker murió en parálisis por análisis
   (docenas de lecturas, 0 archivos) + outage de proveedores; el retry usó prompt con lecturas
   acotadas. Lección: prompts de test deben prohibir arqueología de dossiers.
