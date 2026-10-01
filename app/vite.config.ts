import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { checkedTemplates } from './src/explain/checkTemplates';

const PYODIDE_FILES = ['pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];

/**
 * Pyodide is served from our own site, never a third-party CDN (ADR 0004).
 * This copies its runtime files from the pinned npm package into public/pyodide/.
 */
function selfHostedPyodide(): Plugin {
  const from = fileURLToPath(new URL('node_modules/pyodide/', import.meta.url));
  const to = fileURLToPath(new URL('public/pyodide/', import.meta.url));
  return {
    name: 'self-hosted-pyodide',
    async buildStart() {
      await mkdir(to, { recursive: true });
      for (const file of PYODIDE_FILES) await cp(from + file, to + file);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), selfHostedPyodide(), checkedTemplates()],
  optimizeDeps: { exclude: ['pyodide'] },
  worker: { format: 'es' },
  test: { include: ['src/**/*.test.ts'] },
});
