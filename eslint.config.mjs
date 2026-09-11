// @ts-check
// ============================================================================
// Ninja AI Framework — ESLint 9 flat config (F1.4 / T3.2)
// ============================================================================
// Capas del Manual §4.2 — imports solo apuntan hacia abajo:
//   L0 contracts · L1 foundation · L2 domain · L3 integration · L4 apps (+ Visual side-layer)
//   L(n) no importa L(n+1)+. Enforced aquí con no-restricted-imports por globs.
// Deuda F3: los `as any` / `!` / `throw new Error(` legacy quedan cubiertos por overrides
// por archivo con comentario DEBT(F3.x) — contados y listados en tools/verifications/f1.md.
// ============================================================================

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/** L3 integration + L4 apps — prohibidos para las capas fundacionales (L0/L1). */
const L3_L4 = [
  '@ninja/integrations-llm',
  '@ninja/integrations-engram',
  '@ninja/integrations-lightrag',
  '@ninja/integrations-shell',
  '@ninja/integrations-git',
  '@ninja/integrations-fs',
  '@ninja/integrations-http',
  '@ninja/client-adapters',
  '@ninja/delegation-router',
  '@ninja/installer',
  '@ninja/kage-runtime',
  '@ninja/forge-console',
  '@ninja/dojo-cli',
  '@ninja/companion-extension',
];

/** L2 domain — prohibido para L3 y para la capa visual. */
const L2_DOMAIN = [
  '@ninja/kage-engine',
  '@ninja/agent-runtime',
  '@ninja/flow-matrix',
  '@ninja/arsenal-registry',
  '@ninja/workbench',
  '@ninja/trace-ledger',
  '@ninja/sentinel',
  '@ninja/model-gateway',
  '@ninja/pulse-center',
  '@ninja/learning-loop',
  '@ninja/forge-lab',
  '@ninja/roster',
];

/** Visual side-layer — solo consumible por forge-console (Manual §4.2). */
const VISUAL = ['@ninja/ui-kit', '@ninja/office-grid', '@ninja/app-shell'];

/** Solo el root puede importar apps (L4) — regla general para packages. */
const APP_PACKAGES = ['@ninja/kage-runtime', '@ninja/forge-console', '@ninja/dojo-cli', '@ninja/companion-extension'];

/**
 * Archivos migrados a NinjaError (Manual §4.3): `throw new Error(` queda PROHIBIDO aquí.
 * Extender esta lista con cada migración — es el "guard" del eslintrc original, preservado.
 */
const NINJA_ERROR_MIGRATED = [
  'packages/integrations-llm/src/client.ts',
  'packages/sentinel/src/approval.ts',
  'packages/kage-engine/src/intake.ts',
  'packages/kage-engine/src/coordinator.ts',
  'packages/roster/src/roster.ts',
  'packages/integrations-http/src/client.ts',
  'packages/workbench/src/context.ts',
  'packages/vault/src/scoring/budget-manager.ts',
  'packages/vault/src/coordinator.ts',
  'packages/pulse-center/src/finding.ts',
  'packages/pulse-center/src/dashboard.ts',
];

/**
 * DEBT(F3.4) — archivos con `as any` / `any` / `!` legacy (117 + N de la auditoría 2026-08-24).
 * Cada override lleva contador; se ELIMINA cuando el archivo migre a tipos estrictos.
 * Regla de oro: este bloque solo puede ENCORTARSE — un archivo nuevo jamás entra aquí.
 */
const DEBT_F34_ANY = [
  // 37×any (37 en server.ts — auditoría A.4)
  'apps/kage-runtime/src/server.ts',
  // 3×any
  'apps/kage-runtime/src/mcp-runtime-server.ts',
  // 2×any
  'apps/kage-runtime/src/lifecycle.ts',
  // 12×any (executor.ts — auditoría A.4)
  'packages/agent-runtime/src/executor.ts',
  // 2×any
  'packages/sentinel/src/guardian.ts',
  // 2×any
  'packages/sentinel/src/auditor.ts',
  // 1×any (kage-engine intake — auditoría A.4)
  'packages/kage-engine/src/intake.ts',
  // 3×any
  'packages/forge-lab/src/repo-analyzer.ts',
  // 1×any
  'packages/delegation-router/src/router.ts',
  // 5×any
  'packages/client-adapters/src/adapters/generic-agents-adapter.ts',
  // 1×any
  'packages/installer/src/self-updater.ts',
  // 2×any
  'packages/installer/src/content/system-prompt.ts',
  // 1×any
  'packages/installer/src/content/sdd-agents.ts',
  // 2×any
  'packages/installer/src/content/default-persona.ts',
  // 1×any
  'packages/app-shell/src/topbar.tsx',
  // 3×any (descubierto por flat config — no visto por grep del inventario)
  'packages/arsenal-registry/src/registry.ts',
  // 2×any (catch (err: any))
  'apps/companion-extension/src/extension.ts',
  // 1×any
  'apps/forge-console/components/IntentBar.tsx',
  // 1×any
  'apps/forge-console/components/ContextPanel.tsx',
  // 3×any
  'apps/dojo-cli/src/workspace-manager.ts',
  // 3×any
  'apps/dojo-cli/src/runtime-client.ts',
  // 1×any (ws-client)
  'apps/forge-console/lib/ws-client.ts',
  // 1×any (roster page)
  'apps/forge-console/app/roster/page.tsx',
  // 1×any (roster types)
  'apps/forge-console/app/roster/types.ts',
  // 2×non-null assertion (settings page)
  'apps/forge-console/app/settings/page.tsx',
  // 2×non-null assertion (SettingsOverlay)
  'apps/forge-console/components/SettingsOverlay.tsx',
  // 3×non-null assertion (lib/api)
  'apps/forge-console/lib/api.ts',
];

/** DEBT(F3.4) — archivos de TEST con any legacy (los tests se endurecen en F3, no hoy). */
const DEBT_F34_ANY_TESTS = [
  'packages/vault/src/coordinator.test.ts',
  'packages/pulse-center/src/__tests__/monitor.test.ts',
  'packages/model-gateway/src/selector.test.ts',
  'packages/model-gateway/src/budget.test.ts',
  'packages/integrations-llm/src/registry.test.ts',
  'packages/installer/src/tests/auto-installer.test.ts',
  'packages/installer/src/tests/arsenal-bridge.test.ts',
  'packages/client-adapters/src/__tests__/parity.test.ts',
  'packages/arsenal-registry/src/__tests__/mcp-adapter.test.ts',
  'packages/agent-runtime/src/executor.test.ts',
  // 2×non-null assertion (executor-rf16.test)
  'packages/agent-runtime/src/executor-rf16.test.ts',
  // 1×no-empty (ClientLayout: catch {} + .catch(() => {}) — §4.3 catch vacíos prohibidos, a migrar F3.1)
  'apps/forge-console/app/ClientLayout.tsx',
];

/**
 * DEBT(F3.1) — archivos legacy con `throw new Error(` (45 según auditoría A.4) que AÚN no
 * migraron a NinjaError. Se ELIMINA cada override en la migración (Manual §4.3: extender
 * el guard con cada migración). Archivos nuevos JAMÁS entran en esta lista.
 */
const DEBT_F31_THROW = [
  // tests (permiten throw para asserts — migrar a expect().toThrow en F3)
  'tests/helpers/test-utils.ts',
  'tests/e2e/helpers/e2e-utils.ts',
  'packages/kage-engine/src/coordinator.test.ts',
  'packages/installer/src/tests/install-pipeline.test.ts',
  'packages/events/src/bus.test.ts',
  'packages/delegation-router/src/__tests__/router.test.ts',
  'packages/client-adapters/src/__tests__/parity.test.ts',
  'packages/arsenal-registry/src/__tests__/mcp-server.test.ts',
  'packages/arsenal-registry/src/__tests__/mcp-adapter.test.ts',
  // src legacy (migrar a NinjaError en F3.1)
  'packages/kage-engine/src/approvals.ts',
  // visual side-layer: no value-import de @ninja/contracts en bundles client (Turbopack)
  'packages/office-grid/src/hooks/use-office-state.ts',
  'packages/integrations-llm/src/registry.ts',
  'packages/integrations-lightrag/src/lightrag-client.ts',
  'packages/integrations-git/src/operations.ts',
  'packages/integrations-fs/src/analyzer.ts',
  'packages/installer/src/backup.ts',
  'packages/flow-matrix/src/executor.ts',
  'packages/delegation-router/src/router.ts',
  'packages/client-adapters/src/index.ts',
  'packages/client-adapters/src/base-adapter.ts',
  'packages/arsenal-registry/src/registry.ts',
  'packages/arsenal-registry/src/permission-guard.ts',
  'apps/kage-runtime/src/mcp-runtime-server.ts',
  'apps/kage-runtime/src/lifecycle.ts',
  'apps/kage-runtime/src/env-schema.ts',
  'apps/forge-console/lib/api-mock.ts',
  'apps/dojo-cli/src/runtime-client.ts',
  'apps/dojo-cli/src/pipeline/command-pipeline.ts',
  'apps/dojo-cli/src/commands/commands-extended.ts',
  'apps/dojo-cli/src/commands/commands-core.ts',
];

/** Bloque de reglas reutilizable: capas L0-L4 (Manual §4.2). */
const layerRules = (pkgs, message) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: pkgs,
          message,
        },
      ],
    },
  ],
});

export default tseslint.config(
  // ── Ignorados globales ────────────────────────────────────────────────────
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'workspaces/**',
      'docs/**',
      'content/**',
      'scripts/**',
    ],
  },

  // ── Base: JS recommended + TS recommended (comportamiento del eslintrc) ──
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // ── Reglas endurecidas (F1.4): a ERROR ────────────────────────────────────
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-empty': 'error',
      'no-control-regex': 'error',
      // Reglas warn del eslintrc original se endurecen; las demás warn se quedan warn:
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
    },
  },

  // ── L0 contracts: no importa NADA interno (Manual §4.2) ──────────────────
  {
    files: ['packages/contracts/**/*.ts'],
    rules: layerRules(['@ninja/*'], 'L0 contracts no importa ningún @ninja/* (Manual §4.2). Tipos compartidos viven aquí.'),
  },

  // ── L1 foundation: prohibido L2+L3+L4+Visual ──────────────────────────────
  {
    files: [
      'packages/config/**/*.ts',
      'packages/logging/**/*.ts',
      'packages/storage/**/*.ts',
      'packages/events/**/*.ts',
      'packages/common-utils/**/*.ts',
      'packages/vault/**/*.ts',
    ],
    rules: layerRules([...L2_DOMAIN, ...L3_L4, ...VISUAL], 'L1 foundation no importa L2/L3/L4/Visual (Manual §4.2).'),
  },

  // ── L2 domain: prohibido L3+L4+Visual ─────────────────────────────────────
  {
    files: L2_DOMAIN.map(
      (pkg) => `packages/${pkg.replace('@ninja/', '')}/**/*.ts`
    ),
    rules: layerRules([...L3_L4, ...VISUAL], 'L2 domain no importa L3/L4/Visual (Manual §4.2).'),
  },

  // ── L3 integration: prohibido L2 domain + L4 apps + Visual ────────────────
  {
    files: [
      'packages/integrations-llm/**/*.ts',
      'packages/integrations-engram/**/*.ts',
      'packages/integrations-lightrag/**/*.ts',
      'packages/integrations-shell/**/*.ts',
      'packages/integrations-git/**/*.ts',
      'packages/integrations-fs/**/*.ts',
      'packages/integrations-http/**/*.ts',
      'packages/client-adapters/**/*.ts',
      'packages/delegation-router/**/*.ts',
      'packages/installer/**/*.ts',
    ],
    rules: layerRules([...L2_DOMAIN, ...APP_PACKAGES, ...VISUAL], 'L3 integration no importa L2 domain / apps / Visual (Manual §4.2).'),
  },

  // ── Visual side-layer: solo contracts/events/logging/config/common-utils ──
  {
    files: [
      'packages/ui-kit/**/*.ts',
      'packages/ui-kit/**/*.tsx',
      'packages/office-grid/**/*.ts',
      'packages/office-grid/**/*.tsx',
      'packages/app-shell/**/*.ts',
      'packages/app-shell/**/*.tsx',
    ],
    rules: layerRules([
          ...L2_DOMAIN,
          ...L3_L4,
          ...VISUAL,
          '!@ninja/ui-kit',
          '!@ninja/office-grid',
          '!@ninja/app-shell',
        ], 'Visual solo consume L0/L1 (contracts, events, logging, config, common-utils) (Manual §4.2).'),
  },

  // ── Guard anti `throw new Error(` — SOLO archivos migrados a NinjaError ──
  {
    files: NINJA_ERROR_MIGRATED,
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "ThrowStatement[argument.type='NewExpression'][argument.callee.name='Error']",
          message:
            "Use NinjaError or a subclass (ADR-0001). Plain 'throw new Error()' is forbidden in this file. See packages/contracts/src/errors.ts.",
        },
      ],
    },
  },

  // ── DEBT(F3.1) overrides — archivos legacy con throw new Error ────────────
  {
    files: DEBT_F31_THROW,
    rules: {
      // Override total: el guard general para estos archivos queda OFF hasta F3.1.
      'no-restricted-syntax': 'off',
    },
  },

  // ── DEBT(F3.4) overrides — archivos legacy con any / non-null ─────────────
  {
    files: DEBT_F34_ANY,
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: DEBT_F34_ANY_TESTS,
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // DEBT(F3.1): catch {} + .catch(() => {}) vacíos (violación Manual §4.3, preexistente).
    files: ['apps/forge-console/app/ClientLayout.tsx'],
    rules: {
      'no-empty': 'off',
    },
  },

  // ── DEBT(F3.4) overrides puntuales — un solo archivo por regla ────────────
  {
    // DEBT(F3.4): chunker usa \x00 en regex para limpiar NUL bytes (comportamiento
    // intencional); migrar a [\0] escapado o a una función en F3.
    files: ['packages/integrations-lightrag/src/chunker.ts'],
    rules: {
      'no-control-regex': 'off',
    },
  },

  // ── DEBT(F3.5) — violaciones de capa reales, a migrar en F3.5 ─────────────
  {
    // DEBT(F3.5): executor.ts y sus tests importan @ninja/integrations-llm (L2→L3).
    // El fallback chain (WP-B3) hace que agent-runtime dependa del cliente LLM;
    // reestructurar la inyección es trabajo de F3.5, no de este fix mínimo.
    files: [
      'packages/agent-runtime/src/executor.ts',
      'packages/agent-runtime/src/executor.test.ts',
      'packages/agent-runtime/src/executor-budget.test.ts',
      'packages/agent-runtime/src/executor-fallback.test.ts',
      'packages/agent-runtime/src/executor-rf16.test.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // ── DEBT(T6.4/2026-09-10) — violaciones de capa PREEXISTENTES en main ──────
  {
    // DEBT(T6.4): estos imports violaban no-restricted-imports YA en main
    // (verificado por orquestador el 2026-09-10: versions main linteadas, mismos
    // errores; el obrero T6.4 añadió CERO violaciones nuevas — mapa en dossier
    // wp-d4-routes-2.md). T6.4 debía tocar estos archivos (as-any=0 + throws=0)
    // y G1 bloquea cualquier commit que los stagee. Migrar los edges (mover tipos
    // a contracts, reinyectar dependencias) es rediseño de arquitectura: requiere
    // ADR de capas, fuera de alcance T6.4. Expiry: revisión ADR de capas.
    // Decisión registrada: docs/adr/0013-layer-debt-grandfather.md (accepted
    // 2026-09-11, reversible por el dueño). Ver también EXC-4 en Quality Manual §15.
    // NO añadir archivos nuevos a esta lista sin dossier que lo justifique.
    files: [
      'packages/client-adapters/src/adapters/generic-agents-adapter.ts',
      'packages/client-adapters/src/base-adapter.ts',
      'packages/client-adapters/src/index.ts',
      'packages/delegation-router/src/router.ts',
      'packages/forge-lab/src/repo-analyzer.ts',
      'packages/installer/src/backup.ts',
      'packages/installer/src/content/system-prompt.ts',
      'packages/installer/src/types.ts',
      'packages/installer/src/tests/arsenal-bridge.test.ts',
      'packages/installer/src/tests/auto-installer.test.ts',
      'packages/kage-engine/src/intake.ts',
      'packages/model-gateway/src/budget.ts',
      'packages/model-gateway/src/budget.test.ts',
      'packages/vault/src/coordinator.ts',
      'packages/vault/src/coordinator.test.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
);
