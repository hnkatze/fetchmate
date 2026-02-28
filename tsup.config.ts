import { defineConfig } from 'tsup';

export default defineConfig([
  // Core (ESM + CJS)
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2022',
    outDir: 'dist',
    splitting: false,
    treeshake: true,
  },
  // Angular (ESM only)
  {
    entry: { angular: 'src/angular.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: false,
    target: 'es2022',
    outDir: 'dist',
    splitting: false,
    treeshake: true,
    external: [
      '@angular/core',
      '@angular/common',
      '@angular/common/http',
      'rxjs',
      'rxjs/operators',
    ],
  },
]);
