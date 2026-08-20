import { defineConfig } from 'tsdown'

/** Bundle the `zhiwo` CLI from TypeScript output; Vite owns the browser artifact. */
export default defineConfig({
  entry: ['lib/types/bin.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
