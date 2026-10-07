import { readFileSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { version as pyodideVersion } from 'pyodide';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { checkedContent } from './src/explain/checkContent';
import { exampleAnalyses } from './src/examples/build';
import { readPagesHeaders } from './src/pagesHeaders';

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

/**
 * Serves `vite preview` with the headers in the build's _headers, as Cloudflare Pages serves the site, so the
 * Playwright tests run under the Content Security Policy learners get. The dev server goes without: Vite's hot reload
 * needs an inline script.
 */
function pagesHeaders(): Plugin {
  return {
    name: 'pages-headers',
    configurePreviewServer(server) {
      const headersFor = readPagesHeaders(readFileSync(join(server.config.root, server.config.build.outDir, '_headers'), 'utf-8'));
      server.middlewares.use((request, response, next) => {
        for (const [name, value] of headersFor(new URL(request.url ?? '/', 'http://localhost').pathname)) response.setHeader(name, value);
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), selfHostedPyodide(), cpythonLicense(), checkedContent(), exampleAnalyses(), pagesHeaders()],
  optimizeDeps: { exclude: ['pyodide'] },
  // The worker's files go in their own folder, which public/_headers gives a stricter Content Security Policy.
  worker: {
    format: 'es',
    rolldownOptions: { output: { entryFileNames: 'assets/worker/[name]-[hash].js', chunkFileNames: 'assets/worker/[name]-[hash].js' } },
  },
  test: { include: ['src/**/*.test.ts'] },
});
