import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/budget.ts', 'src/fallback.ts'],
  format: ['cjs', 'esm'],
  dts: {
    resolve: true,
  },
  clean: true,
  minify: false,
  sourcemap: true,
  target: 'es2022',
  tsconfig: './tsconfig.json',
});
