# WP-D2 — Thresholds de cobertura (T6.2)

**Fecha:** 2026-09-10 · **Rama:** `feat/wp-d2-thresholds` · **Alcance:** `vitest.config.ts` (raíz) + este dossier · nada más.

## Qué se añadió

En `vitest.config.ts` → `test.coverage`:

1. **Threshold global** `thresholds: { lines: 50, functions: 45, statements: 50 }`.
2. **Overrides por paquete crítico** `lines: 70` vía glob-patterns (sintaxis Vitest 4, ver abajo):
   `contracts, kage-engine, agent-runtime, sentinel, model-gateway, vault, flow-matrix, workbench`.
3. **EXC-3 exclusion** en `coverage.exclude` con el comentario literal:
   `// EXC-3: hook DOM/WS no testable sin jsdom (decisión cerrada)` → excluye
   `packages/office-grid/src/hooks/use-office-state.ts`. No se instaló jsdom, no se rebajó el global,
   no se añadió ninguna excepción nueva.
4. **Fix pre-existente (obligatorio para que corra coverage):** faltaba el alias `@ninja/installer` en
   `vitest.config.ts`. `packages/installer/package.json` apunta a `./dist/index.js` (no construido) y no
   había entrada en `resolve.alias` → 14 test files de `kage-runtime` + 2 integration tests fallaban con
   _"Failed to resolve entry for package '@ninja/installer'"_ y **no se generaba ningún reporte de
   coverage**. Se añadió `'@ninja/installer': path.resolve(__dirname, 'packages/installer/src')`
   (mismo patrón que las 30 aliases hermanas; el paquete existe y exporta `src/index.ts`).

### Sintaxis per-package usada y por qué

Vitest 4.1.4 (verificado contra docs oficiales v4.1.6, `docs/config/coverage.md`) soporta **thresholds
por glob-pattern** como claves de `coverage.thresholds`:

```ts
thresholds: {
  lines: 50,                       // global (todos los archivos)
  functions: 45,
  statements: 50,
  'packages/kage-engine/src/**/*.ts': { lines: 70 },  // override por paquete crítico
}
```

Se eligió esto porque Vitest 4 cambió el modelo de thresholds por directorio (eliminado en 4.0) por el
modelo clave-glob. **Gotcha documentado:** según las docs, un pattern que fija solo `lines` **no hereda**
los thresholds globales de functions/statements para esos archivos — el override (70) aplica solo a lines,
que es exactamente lo pedido en el prompt (solo `lines: 70` por paquete crítico). Los archivos con glob
overrides **sí siguen contando** para el cálculo del global (Vitest cuenta todos los archivos, a diferencia
de Jest), por lo que un paquete con 70 se suma igual al global — coherente, 70 > 50 nunca hunde el global.

## Evidencia

### 1. Run positivo — global 50 (estado final, tras restaurar)

`pnpm vitest run --coverage` → exit 1 (esperado: 2 paquetes críticos bajo 70; global SÍ pasa).

```
 Test Files  102 passed (102)
      Tests  1228 passed (1228)
 % Coverage report from v8
All files          |   62.74 |     50.8 |   60.91 |   63.12 |
...
=============================== Coverage summary ===============================
Statements   : 62.74% ( 4839/7712 )
Branches     : 50.8% ( 1899/3738 )
Functions    : 60.91% ( 896/1471 )
Lines        : 63.12% ( 4675/7406 )
================================================================================
ERROR: Coverage for lines (63.42%) does not meet "packages/kage-engine/src/**/*.ts" threshold (70%)
ERROR: Coverage for lines (36.74%) does not meet "packages/vault/src/**/*.ts" threshold (70%)
```

- **Global `lines: 50` → PASA** (63.12% ≥ 50): no aparece error global en el run restaurado.
- **Global `functions: 45` → PASA** (60.91%), **statements: 50 → PASA** (62.74%).
- La exclusión EXC-3 funciona: office-grid/src figura **100%** y `use-office-state.ts` ya no aparece
  en la tabla de coverage.

Estado por paquete crítico (líneas del reporte completo):

| Paquete crítico | % Lines | ≥70? |
| --------------- | ------- | ---- |
| contracts       | 94.23   | ✓    |
| kage-engine     | 63.42   | ✗    |
| agent-runtime   | 89.95   | ✓    |
| sentinel        | 96.24   | ✓    |
| model-gateway   | 75.25   | ✓    |
| vault           | 36.74   | ✗    |
| flow-matrix     | 96.12   | ✓    |
| workbench       | 90.00   | ✓    |

6/8 paquetes críticos por encima de 70. **kage-engine (63.42%) y vault (36.74%) quedan bajo 70** que —
dato clave — **no son de mi alcance**: ningún archivo de `packages/kage-engine/**` ni `packages/vault/**`
fue tocado. Se reporta el número exacto, sin bajar el umbral ni tocar excepciones (regla del prompt).
Se espera que T6.3+ (tests críticos) cierre los dos desvíos. Ningún otro paquete hunde el global.

### 2. Run negativo — global roto a propósito (`lines: 95`)

Cambio temporal `lines: 50` → `lines: 95`, ejecución idéntica → **falla el gate** (exit 1):

```
ERROR: Coverage for lines (63.12%) does not meet global threshold (95%)
ERROR: Coverage for lines (63.42%) does not meet "packages/kage-engine/src/**/*.ts" threshold (70%)
ERROR: Coverage for lines (36.74%) does not meet "packages/vault/src/**/*.ts" threshold (70%)
```

Confirmado: el mecanismo de thresholds **falla cuando el umbral no se cumple**. Luego se restauró
`lines: 95` → `lines: 50` y se re-ejecutó (evidencia en el punto 1).

### 3. Typecheck

`pnpm typecheck` → **exit 0**.

```
Tasks:    34 successful, 34 total
Cached:   34 cached, 34 total
```

### 4. Lint

El script root `lint` no cubre `vitest.config.ts`, así que se lanzó eslint directo como indica el prompt:
`npx eslint --config eslint.config.mjs vitest.config.ts` → **exit 0, 0 errores**.
Además `npx prettier --check vitest.config.ts` → **clean** (se formateó el archivo antes del check).
No se tocó ningún otro archivo.

## Nota de proceso

- El fix del alias `@ninja/installer` está **dentro del alcance** (mismo archivo `vitest.config.ts`) y era
  un requisito funcional para poder ejecutar el paso de verificación 1: sin él el reporte de coverage no
  se genera. Es un bug pre-existente del trabajo de ETAPA 5/6 (el alias nunca se registró), no una regresión
  de este WP.
- La suite completa quedó en **1228 tests pasando / 102 files** (baseline snapshot 1174 → +54 por T6.1
  common-utils y la suite del installer).
- Los dos paquetes bajo 70 (kage-engine, vault) quedan registrados como deuda de cobertura para las
  tareas de tests críticos; el gate de vitest ya las denuncia automáticamente en CI/local, que es
  precisamente la función de este WP.

## Estado del gate

| Gate      | Resultado                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| coverage  | Mecanismo activo y verificado (falla si se incumple). Global 50 OK; 2 paquetes críticos <70 reportados (kage-engine, vault). |
| typecheck | exit 0                                                                                                                       |
| lint      | 0 errores (eslint sobre vitest.config.ts)                                                                                    |
