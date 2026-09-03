import { defineConfig } from 'vitest/config';
import path from 'node:path';

const baseAliases = {
  '@ninja/contracts': path.resolve(__dirname, 'packages/contracts/src'),
  '@ninja/config': path.resolve(__dirname, 'packages/config/src'),
  '@ninja/logging': path.resolve(__dirname, 'packages/logging/src'),
  '@ninja/storage': path.resolve(__dirname, 'packages/storage/src'),
  '@ninja/events': path.resolve(__dirname, 'packages/events/src'),
  '@ninja/common-utils': path.resolve(__dirname, 'packages/common-utils/src'),
  '@ninja/vault': path.resolve(__dirname, 'packages/vault/src'),
  '@ninja/kage-engine': path.resolve(__dirname, 'packages/kage-engine/src'),
  '@ninja/flow-matrix': path.resolve(__dirname, 'packages/flow-matrix/src'),
  '@ninja/agent-runtime': path.resolve(__dirname, 'packages/agent-runtime/src'),
  '@ninja/arsenal-registry': path.resolve(__dirname, 'packages/arsenal-registry/src'),
  '@ninja/workbench': path.resolve(__dirname, 'packages/workbench/src'),
  '@ninja/trace-ledger': path.resolve(__dirname, 'packages/trace-ledger/src'),
  '@ninja/sentinel': path.resolve(__dirname, 'packages/sentinel/src'),
  '@ninja/model-gateway': path.resolve(__dirname, 'packages/model-gateway/src'),
  '@ninja/pulse-center': path.resolve(__dirname, 'packages/pulse-center/src'),
  '@ninja/learning-loop': path.resolve(__dirname, 'packages/learning-loop/src'),
  '@ninja/forge-lab': path.resolve(__dirname, 'packages/forge-lab/src'),
  '@ninja/integrations-engram': path.resolve(__dirname, 'packages/integrations-engram/src'),
  '@ninja/integrations-lightrag': path.resolve(__dirname, 'packages/integrations-lightrag/src'),
  '@ninja/integrations-llm': path.resolve(__dirname, 'packages/integrations-llm/src'),
  '@ninja/integrations-shell': path.resolve(__dirname, 'packages/integrations-shell/src'),
  '@ninja/integrations-git': path.resolve(__dirname, 'packages/integrations-git/src'),
  '@ninja/integrations-http': path.resolve(__dirname, 'packages/integrations-http/src'),
  '@ninja/integrations-fs': path.resolve(__dirname, 'packages/integrations-fs/src'),
  '@ninja/office-grid': path.resolve(__dirname, 'packages/office-grid/src'),
  '@ninja/ui-kit': path.resolve(__dirname, 'packages/ui-kit/src'),
  '@ninja/app-shell': path.resolve(__dirname, 'packages/app-shell/src'),
  '@ninja/roster': path.resolve(__dirname, 'packages/roster/src'),
  '@ninja/client-adapters': path.resolve(__dirname, 'packages/client-adapters/src'),
  '@ninja/delegation-router': path.resolve(__dirname, 'packages/delegation-router/src'),
};

export default defineConfig({
  resolve: {
    alias: baseAliases,
  },
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'tests/**/*.test.ts',
      'src/**/*.test.ts',
    ],
    exclude: [
      'node_modules',
      'dist',
      '.turbo',
      '**/node_modules/**',
      '**/dist/**',
      '**/.turbo/**',
      'tests/e2e/**',
    ],
    testTimeout: 10000,
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        'packages/*/src/**/*.test.ts',
        'packages/*/src/**/types.ts',
        'packages/*/src/index.ts',
      ],
    },
  },
});
