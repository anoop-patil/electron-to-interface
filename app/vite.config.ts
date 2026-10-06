import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { version as pyodideVersion } from 'pyodide';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { checkedContent } from './src/explain/checkContent';
import { exampleAnalyses } from './src/examples/build';

const PYODIDE_FILES = ['pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];

/**
 * Pyodide is served from our own site, never a third-party CDN (ADR 0004).
 * This copies its runtime files from the pinned npm package into public/pyodide/<version>/. The version in the path
 * lets browsers cache the files for a year (public/_headers): a new Pyodide gets a new path.
 */
function selfHostedPyodide(): Plugin {
  const from = fileURLToPath(new URL('node_modules/pyodide/', import.meta.url));
  const root = fileURLToPath(new URL('public/pyodide/', import.meta.url));
  const to = `${root}${pyodideVersion}/`;
  return {
    name: 'self-hosted-pyodide',
    async buildStart() {
      // Clears any earlier version's files, so the site never ships two.
      await rm(root, { recursive: true, force: true });
      await mkdir(to, { recursive: true });
      for (const file of PYODIDE_FILES) await cp(from + file, to + file);
    },
  };
}

/**
 * Zoom level 6 quotes CPython's C source, whose PSF License must ship with it.
 * This copies the license from the repo's licenses/ folder into public/licenses/, so the site serves it.
 */
function cpythonLicense(): Plugin {
  const from = fileURLToPath(new URL('../licenses/CPython-LICENSE.txt', import.meta.url));
  const to = fileURLToPath(new URL('public/licenses/', import.meta.url));
  return {
    name: 'cpython-license',
    async buildStart() {
      await mkdir(to, { recursive: true });
      await cp(from, to + 'CPython-LICENSE.txt');
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), selfHostedPyodide(), cpythonLicense(), checkedContent(), exampleAnalyses()],
  optimizeDeps: { exclude: ['pyodide'] },
  worker: { format: 'es' },
  test: { include: ['src/**/*.test.ts'] },
});
