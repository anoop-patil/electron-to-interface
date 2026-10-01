import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { Plugin } from 'vite';
import schema from '../../schema/analysis.schema.json';
import type { Subject, Templates } from '../generated/analysis';

/** The schema definition that lists each subject's slots. */
const SLOT_DEFS: Record<Subject, keyof typeof schema.$defs> = { program: 'ProgramSlot', byte: 'ByteSlot' };

const slotsOf = (subject: Subject) => new Set((schema.$defs[SLOT_DEFS[subject]] as { oneOf: { const: string }[] }).oneOf.map((slot) => slot.const));

const validate = new Ajv2020({ strict: true }).addSchema(schema, 'analysis').compile<Templates>({ $ref: 'analysis#/$defs/Templates' });

/** What is wrong with a Template file: where it breaks the schema, and every slot that names a Fact its subject doesn't have. */
export function templateProblems(file: unknown): string[] {
  if (!validate(file)) return validate.errors!.map((error) => `${error.instancePath || 'the file'} ${error.message}`);
  return Object.entries(file.templates).flatMap(([id, template]) => {
    const slots = slotsOf(template.subject);
    const strings = [template.title, template.text, template.term].filter((string) => string !== undefined);
    // Any {…}, not just a well-formed one: a slot the check misses would reach the page as text.
    const unknownSlots = strings
      .flatMap((string) => [...string.matchAll(/\{([^}]*)\}/g)].map((match) => match[1]))
      .filter((slot) => !slots.has(slot))
      .map((slot) => `${id} refers to {${slot}}, which isn’t a Fact of a ${template.subject}`);
    const unclosedBold = strings.filter((string) => string.split('**').length % 2 === 0).map(() => `${id} has a ** with no closing **`);
    return [...unknownSlots, ...unclosedBold];
  });
}

/** Fails the build, and the dev server's start, when a Template file in `dir` has a problem. */
export function checkedTemplates(dir = fileURLToPath(new URL('../../templates/', import.meta.url))): Plugin {
  return {
    name: 'checked-templates',
    async buildStart() {
      for (const name of await readdir(dir)) {
        if (!name.endsWith('.json')) continue;
        const problems = templateProblems(JSON.parse(await readFile(join(dir, name), 'utf-8')));
        if (problems.length > 0) this.error(`Templates in ${name}:\n${problems.join('\n')}`);
      }
    },
  };
}
