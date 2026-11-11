import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// base relativo: o mesmo build funciona no GitHub Pages (/Simula-es/), em
// qualquer subpasta e aberto por um servidor estático local.
export default defineConfig({
  base: './',
  plugins: [preact()],
  build: {
    target: 'es2022',
    sourcemap: true,
    // lista de arquivos do build que o service worker guarda para uso offline
    manifest: 'manifesto-build.json',
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
