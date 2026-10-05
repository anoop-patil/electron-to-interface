import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { Plugin } from 'vite';
import schema from '../../schema/analysis.schema.json';
import { startAnalyzer, type Python } from '../engine/analyzer';
import type { Analysis } from '../generated/analysis';
import { analysisPath, EXAMPLES } from './examples';

const APP = fileURLToPath(new URL('../../', import.meta.url));

const validAnalysis = new Ajv2020({ strict: true }).compile<Analysis>(schema);

/**
 * Each Example's Analysis, made by `python` as the page makes one when the learner clicks Run, and marked with the
 * Example's ID. Throws, naming the Example, if one breaks the schema.
 */
export async function analyzeExamples(python: Python, root = APP): Promise<Analysis[]> {
  const analyses: Analysis[] = [];
  for (const { id, source } of EXAMPLES) {
    const analysis = { ...python.analyze(await readFile(join(root, source), 'utf-8')), example: id };
    if (!validAnalysis(analysis)) {
      const problems = validAnalysis.errors!.map((error) => `${error.instancePath || 'the Analysis'} ${error.message}`);
      throw new Error(`The Example ${id}’s Analysis breaks the schema:\n${problems.join('\n')}`);
    }
    analyses.push(analysis);
  }
  return analyses;
}

/**
 * Makes each Example's Analysis when the site is built, and when the dev server starts, with the same Python the page
 * runs (Pyodide, under Node.js), and writes it to public/examples/ for the site to serve. The build fails if one
 * breaks the schema. Vitest skips it: build.test.ts makes them itself.
 */
export function exampleAnalyses(root = APP): Plugin {
  return {
    name: 'example-analyses',
    apply: () => !process.env.VITEST,
    async buildStart() {
      let analyses;
      try {
        analyses = await analyzeExamples(await startAnalyzer(await readFile(join(root, 'analyzer/analyze.py'), 'utf-8')), root);
      } catch (error) {
        this.error(error instanceof Error ? error.message : String(error));
      }
      const to = join(root, 'public');
      await rm(join(to, 'examples'), { recursive: true, force: true });
      await mkdir(join(to, 'examples'), { recursive: true });
      for (const analysis of analyses) await writeFile(join(to, analysisPath(analysis.example!)), JSON.stringify(analysis));
    },
  };
}
