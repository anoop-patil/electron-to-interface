import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { Plugin } from 'vite';
import schema from '../../schema/analysis.schema.json';
import type { ConceptCards, HonestyLabels, Subject, Templates } from '../generated/analysis';

/** The schema definition that lists each subject's slots. */
const SLOT_DEFS: Record<Subject, keyof typeof schema.$defs> = { program: 'ProgramSlot', byte: 'ByteSlot' };

const slotsOf = (subject: Subject) => new Set((schema.$defs[SLOT_DEFS[subject]] as { oneOf: { const: string }[] }).oneOf.map((slot) => slot.const));

const ajv = new Ajv2020({ strict: true }).addSchema(schema, 'analysis');
const validator = <T>(def: keyof typeof schema.$defs) => ajv.compile<T>({ $ref: `analysis#/$defs/${def}` });
const validTemplates = validator<Templates>('Templates');
const validCards = validator<ConceptCards>('ConceptCards');
const validLabels = validator<HonestyLabels>('HonestyLabels');

/** Where a file breaks the schema, if it does. */
function schemaProblems(validate: ReturnType<typeof validator>, file: unknown) {
  return validate(file) ? [] : validate.errors!.map((error) => `${error.instancePath || 'the file'} ${error.message}`);
}

/** Any `[[…]]`, not just a well-formed one: one the check misses would reach the page as text. */
function conceptProblems(id: string, strings: string[], cardIds: Set<string>) {
  return strings
    .flatMap((string) => [...string.matchAll(/\[\[([^\]]*)\]\]/g)])
    .map(([markup, inside]) => {
      const card = /^([a-z0-9]+)\|.+$/.exec(inside)?.[1];
      if (card === undefined) return `${id} has ${markup}, which isn’t [[card|words]]`;
      if (!cardIds.has(card)) return `${id} opens the Concept card ${card}, which doesn’t exist`;
      return null;
    })
    .filter((problem) => problem !== null);
}

const slotsIn = (strings: string[]) => strings.flatMap((string) => [...string.matchAll(/\{([^}]*)\}/g)].map((match) => match[1]));

const unclosedBold = (id: string, strings: string[]) =>
  strings.filter((string) => string.split('**').length % 2 === 0).map(() => `${id} has a ** with no closing **`);

/** What is wrong with a Template file: where it breaks the schema, every slot its subject doesn't have, and every card that doesn't exist. */
function templateProblems(file: unknown, cardIds: Set<string>): string[] {
  if (!validTemplates(file)) return schemaProblems(validTemplates, file);
  return Object.entries(file.templates).flatMap(([id, template]) => {
    const slots = slotsOf(template.subject);
    const strings = [template.title, template.text, template.term].filter((string) => string !== undefined);
    // Any {…}, not just a well-formed one: a slot the check misses would reach the page as text.
    const unknownSlots = slotsIn(strings)
      .filter((slot) => !slots.has(slot))
      .map((slot) => `${id} refers to {${slot}}, which isn’t a Fact of a ${template.subject}`);
    return [...unknownSlots, ...unclosedBold(id, strings), ...conceptProblems(id, strings, cardIds)];
  });
}

/** What is wrong with the Concept cards: their links, their related cards, the index, and the How we know card. */
function cardProblems(file: ConceptCards): string[] {
  const ids = new Set(Object.keys(file.cards));
  const inCards = Object.entries(file.cards).flatMap(([id, card]) => {
    const strings = [card.like, card.text, ...(card.visual?.kind === 'bits' && card.visual.note ? [card.visual.note] : [])];
    return [
      ...conceptProblems(id, strings, ids),
      ...slotsIn(strings).map((slot) => `${id} has {${slot}}, but a Concept card has no Facts`),
      ...unclosedBold(id, strings),
      ...card.related.filter((other) => !ids.has(other)).map((other) => `${id} is related to ${other}, which doesn’t exist`),
    ];
  });
  const listed = file.index.flatMap((group) => group.cards);
  const inIndex = [
    ...[...new Set(listed.filter((id, at) => listed.indexOf(id) !== at))].map((id) => `the Concepts index lists ${id} more than once`),
    ...listed.filter((id) => !ids.has(id)).map((id) => `the Concepts index lists ${id}, which doesn’t exist`),
    ...[...ids].filter((id) => !listed.includes(id)).map((id) => `${id} isn’t in the Concepts index`),
  ];
  const honestyCards = Object.values(file.cards).filter((card) => card.visual?.kind === 'honestyLabels').length;
  const honesty = honestyCards === 1 ? [] : [honestyCards === 0 ? 'No Concept card shows the Honesty labels' : 'More than one Concept card shows the Honesty labels'];
  return [...inCards, ...inIndex, ...honesty];
}

/** What is wrong with the Honesty labels: a second warning color, and every zoom level or panel that carries a label not in the set. */
function labelProblems(file: HonestyLabels): string[] {
  const unknown = (label: string) => !(label in file.labels);
  const warnings = Object.values(file.labels).filter((label) => label.warning).length;
  return [
    // Only Illustrative gets a warning color (ADR 0005).
    ...(warnings > 1 ? ['More than one Honesty label has the warning color'] : []),
    ...Object.entries(file.levels).filter(([, label]) => unknown(label)).map(([level, label]) => `zoom level ${level} carries ${label}, which isn’t an Honesty label`),
    ...Object.entries(file.panels).filter(([, label]) => unknown(label)).map(([panel, label]) => `panel ${panel} carries ${label}, which isn’t an Honesty label`),
  ];
}

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf-8'));

/**
 * Fails the build, and the dev server's start, when the content in `root` has a problem: a Template file in
 * `templates/`, the Concept cards in `concepts/cards.json` or the Honesty labels in `concepts/honesty-labels.json`.
 */
export function checkedContent(root = fileURLToPath(new URL('../../', import.meta.url))): Plugin {
  return {
    name: 'checked-content',
    async buildStart() {
      const fail = (file: string, problems: string[]) => {
        if (problems.length > 0) this.error(`${file}:\n${problems.join('\n')}`);
      };

      const cards = await readJson(join(root, 'concepts/cards.json'));
      if (!validCards(cards)) return fail('concepts/cards.json', schemaProblems(validCards, cards));
      fail('concepts/cards.json', cardProblems(cards));

      const labels = await readJson(join(root, 'concepts/honesty-labels.json'));
      if (!validLabels(labels)) return fail('concepts/honesty-labels.json', schemaProblems(validLabels, labels));
      fail('concepts/honesty-labels.json', labelProblems(labels));

      const cardIds = new Set(Object.keys(cards.cards));
      for (const name of await readdir(join(root, 'templates'))) {
        if (name.endsWith('.json')) fail(`templates/${name}`, templateProblems(await readJson(join(root, 'templates', name)), cardIds));
      }
    },
  };
}
