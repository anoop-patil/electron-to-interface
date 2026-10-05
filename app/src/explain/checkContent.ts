import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { Plugin } from 'vite';
import schema from '../../schema/analysis.schema.json';
import type { ConceptCards, HonestyLabels, ReferenceLibrary, Subject, Templates } from '../generated/analysis';
import { MAP_NOTE, PARTS } from '../machine/parts';

/** The schema definition that lists each subject's slots. */
const SLOT_DEFS: Record<Subject, keyof typeof schema.$defs> = { program: 'ProgramSlot', byte: 'ByteSlot', line: 'LineSlot', token: 'TokenSlot', node: 'NodeSlot', step: 'StepSlot' };

const slotsOf = (subject: Subject) => new Set((schema.$defs[SLOT_DEFS[subject]] as { oneOf: { const: string }[] }).oneOf.map((slot) => slot.const));

const ajv = new Ajv2020({ strict: true }).addSchema(schema, 'analysis');
const validator = <T>(def: keyof typeof schema.$defs) => ajv.compile<T>({ $ref: `analysis#/$defs/${def}` });
const validTemplates = validator<Templates>('Templates');
const validCards = validator<ConceptCards>('ConceptCards');
const validLabels = validator<HonestyLabels>('HonestyLabels');
const validReference = validator<ReferenceLibrary>('ReferenceLibrary');

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

/** What is wrong with a Template file: where it breaks the schema, every slot its subject doesn't have, every card that doesn't exist, and every card a Machine map note opens. */
function templateProblems(file: unknown, cardIds: Set<string>): string[] {
  if (!validTemplates(file)) return schemaProblems(validTemplates, file);
  const inTemplates = Object.entries(file.templates).flatMap(([id, template]) => {
    const slots = slotsOf(template.subject);
    const strings = [template.title, template.text, template.term].filter((string) => string !== undefined);
    // Any {…}, not just a well-formed one: a slot the check misses would reach the page as text.
    const unknownSlots = slotsIn(strings)
      .filter((slot) => !slots.has(slot))
      .map((slot) => `${id} refers to {${slot}}, which isn’t a Fact of a ${template.subject}`);
    // A Machine map note sits inside a part, a button that opens the part's own card.
    const mapNoteCards = id.startsWith(MAP_NOTE)
      ? strings.flatMap((string) => [...string.matchAll(/\[\[([a-z0-9]+)\|/g)]).map(([, card]) => `${id} is a Machine map note, so it can’t open the Concept card ${card}`)
      : [];
    return [...unknownSlots, ...unclosedBold(id, strings), ...conceptProblems(id, strings, cardIds), ...mapNoteCards];
  });
  return [...inTemplates, ...tryItProblems(file.tryIt ?? {}, cardIds)];
}

/**
 * What is wrong with each zoom level's Try it yourself. Its strings are filled in with the Program's Facts, but its
 * command can only use {file}: the page works out the commands to run before the Program has any other Facts.
 */
function tryItProblems(tryIt: NonNullable<Templates['tryIt']>, cardIds: Set<string>): string[] {
  const slots = slotsOf('program');
  return Object.entries(tryIt).flatMap(([level, { command, intro, parts, read }]) => {
    const id = `tryIt ${level}`;
    const text = [intro, ...parts.map((part) => part.text), ...read];
    const unknownSlots = slotsIn([command, ...parts.map((part) => part.code), ...text])
      .filter((slot) => !slots.has(slot))
      .map((slot) => `${id} refers to {${slot}}, which isn’t a Fact of a program`);
    const commandSlots = slotsIn([command])
      .filter((slot) => slots.has(slot) && slot !== 'file')
      .map((slot) => `${id}’s command uses {${slot}}, but a command can only use {file}`);
    return [...unknownSlots, ...commandSlots, ...unclosedBold(id, text), ...conceptProblems(id, text, cardIds)];
  });
}

/** What is wrong with the Concept cards: their links, their related cards, the index, the How we know card, and the Machine map's cards. */
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
  const parts = Object.keys(PARTS).filter((part) => !ids.has(part)).map((part) => `The Machine map’s part ${part} has no Concept card`);
  return [...inCards, ...inIndex, ...honesty, ...parts];
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

const withoutSpaces = (code: string) => code.replace(/\s+/g, '');

/**
 * Every quoted line of C that isn't at the line numbers its entry gives in the source. Spaces don't count, since a
 * statement on several lines is quoted on one, and a quote ending in … only has to match the start of its lines.
 */
function quoteProblems(file: ReferenceLibrary, source: string[]): string[] {
  const name = basename(file.source.file);
  return Object.entries(file.entries).flatMap(([key, entry]) =>
    entry.lines.flatMap(({ code, first, last }) => {
      const actual = source.slice(first - 1, last);
      const quoted = withoutSpaces(code.replace(/\s*…\s*$/, ''));
      const matches = code.trimEnd().endsWith('…') ? withoutSpaces(actual.join('')).startsWith(quoted) : withoutSpaces(actual.join('')) === quoted;
      if (matches) return [];
      const where = first === last ? `line ${first}` : `lines ${first}–${last}`;
      return [`${key} quotes ${where} as ${code} but ${name} has: ${actual.map((line) => line.trim()).join(' ')}`];
    }),
  );
}

/**
 * What is wrong with a Reference Library: a copy of the C source that isn't the file at the tag, a quoted line that
 * isn't where it says, a sentence with a slot a step doesn't have or a card that doesn't exist, and an Example's step
 * run that names an entry that doesn't exist.
 */
function referenceProblems(file: ReferenceLibrary, copy: Buffer, cardIds: Set<string>): string[] {
  const { source } = file;
  const sha256 = createHash('sha256').update(copy).digest('hex');
  if (sha256 !== source.sha256) return [`${source.copy} isn’t ${source.file} at ${source.tag}: its SHA-256 is ${sha256}`];
  const slots = slotsOf('step');
  const inEntries = Object.entries(file.entries).flatMap(([key, entry]) => {
    const strings = [entry.note, ...entry.lines.map((line) => line.say)];
    const unknownSlots = slotsIn(strings)
      .filter((slot) => !slots.has(slot))
      .map((slot) => `${key} refers to {${slot}}, which isn’t a Fact of a step`);
    return [...unknownSlots, ...unclosedBold(key, strings), ...conceptProblems(key, strings, cardIds)];
  });
  const inExamples = file.examples.flatMap(({ name, runs }) =>
    runs.flatMap((run, at) =>
      run.handlers.filter(({ entry }) => !(entry in file.entries)).map(({ entry }) => `${name}’s step run ${at + 1} ran ${entry}, which has no entry`),
    ),
  );
  return [...quoteProblems(file, copy.toString('utf-8').split(/\r?\n/)), ...inEntries, ...inExamples];
}

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf-8'));

/**
 * Fails the build, and the dev server's start, when the content in `root` has a problem: a Template file in
 * `templates/`, the Concept cards in `concepts/cards.json`, the Honesty labels in `concepts/honesty-labels.json`, or a
 * Reference Library in `reference/`, whose every quoted line of C is checked against its copy of the source.
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

      for (const name of await readdir(join(root, 'reference'))) {
        if (!name.endsWith('.json')) continue;
        const library = await readJson(join(root, 'reference', name));
        if (!validReference(library)) return fail(`reference/${name}`, schemaProblems(validReference, library));
        fail(`reference/${name}`, referenceProblems(library, await readFile(join(root, 'reference', library.source.copy)), cardIds));
      }
    },
  };
}
