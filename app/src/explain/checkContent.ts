import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { Plugin } from 'vite';
import schema from '../../schema/analysis.schema.json';
import type { ConceptCards, HonestyLabels, MachineInstruction, ReferenceLibrary, Subject, Templates } from '../generated/analysis';
import { MAP_NOTE, PARTS } from '../machine/parts';

/** The schema definition that lists each subject's slots. */
const SLOT_DEFS: Record<Subject, (keyof typeof schema.$defs)[]> = {
  program: ['ProgramSlot'],
  byte: ['ByteSlot'],
  line: ['LineSlot'],
  token: ['TokenSlot'],
  node: ['NodeSlot'],
  step: ['StepSlot'],
  // A handler's Templates can also name any Fact of the step run it ran for.
  handler: ['HandlerSlot', 'StepSlot'],
  output: ['OutputSlot'],
  character: ['CharacterSlot'],
  pixels: ['PixelsSlot'],
  syntaxError: ['SyntaxErrorSlot'],
};

const slotsOf = (subject: Subject) =>
  new Set(SLOT_DEFS[subject].flatMap((def) => (schema.$defs[def] as { oneOf: { const: string }[] }).oneOf.map((slot) => slot.const)));

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
      // The words are read as they are, so a slot in them would reach the page as text.
      if (/\{[^}]*\}/.test(inside)) return `${id} has ${markup}, whose slot wouldn’t be filled in`;
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
    const strings = [template.title, template.text, template.term, template.docs?.text].filter((string) => string !== undefined);
    // Any {…}, not just a well-formed one: a slot the check misses would reach the page as text.
    const unknownSlots = slotsIn([...strings, template.docs?.href ?? ''])
      .filter((slot) => !slots.has(slot))
      .map((slot) => `${id} refers to {${slot}}, which isn’t a Fact of a ${template.subject}`);
    // A Machine map note sits inside a part, a button that opens the part's own card.
    const mapNoteCards = id.startsWith(MAP_NOTE)
      ? strings.flatMap((string) => [...string.matchAll(/\[\[([a-z0-9]+)\|/g)]).map(([, card]) => `${id} is a Machine map note, so it can’t open the Concept card ${card}`)
      : [];
    // A link's words sit inside the link, so they can't also open a card.
    const linkCards = template.docs?.text.includes('[[') ? [`${id} has a link to Python’s documentation whose words open a Concept card`] : [];
    return [...unknownSlots, ...unclosedBold(id, strings), ...conceptProblems(id, strings, cardIds), ...mapNoteCards, ...linkCards];
  });
  return [...inTemplates, ...tryItProblems(file.tryIt ?? {}, cardIds)];
}

/**
 * What is wrong with each zoom level's Try it yourself. Its strings are filled in with the Program's Facts, but its
 * command can only use {file}: the page works out the commands to run before the Program has any other Facts.
 */
function tryItProblems(tryIt: NonNullable<Templates['tryIt']>, cardIds: Set<string>): string[] {
  const slots = slotsOf('program');
  return Object.entries(tryIt).flatMap(([level, { command = '', summary, intro, parts, read }]) => {
    const id = `tryIt ${level}`;
    const text = [intro, ...parts.map((part) => part.text), ...read];
    // Without a command there is nothing for parts or reading notes to explain.
    const shape = !command === !summary || (summary && (parts.length > 0 || read.length > 0)) ? [`${id} needs a command, or a summary and no parts or reading notes`] : [];
    const unknownSlots = slotsIn([command, summary ?? '', ...parts.map((part) => part.code), ...text])
      .filter((slot) => !slots.has(slot))
      .map((slot) => `${id} refers to {${slot}}, which isn’t a Fact of a program`);
    const commandSlots = slotsIn([command])
      .filter((slot) => slots.has(slot) && slot !== 'file')
      .map((slot) => `${id}’s command uses {${slot}}, but a command can only use {file}`);
    return [...shape, ...unknownSlots, ...commandSlots, ...unclosedBold(id, text), ...conceptProblems(id, text, cardIds)];
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

/** Numbers as a note writes them, leaving out its slots: 3, 1,000. */
const numbersIn = (text: string) => [...text.replace(/\{[A-Za-z]+\}/g, '').matchAll(/\d[\d,]*/g)].map(([found]) => Number(found.replace(/,/g, '')));

/** The sizes in bytes that an operand's size names: a word ptr reads 2 bytes. */
const SIZES: Record<string, number> = { byte: 1, word: 2, dword: 4, qword: 8, xmmword: 16 };

/** Every number an instruction holds: in its operands, written in decimal or hexadecimal, and the sizes they name. */
const numbersOf = ({ operands }: MachineInstruction) =>
  new Set([
    ...[...operands.matchAll(/\b(0x[0-9a-f]+|\d+)\b/g)].map(([found]) => Number(found)),
    ...[...operands.matchAll(/\b(byte|word|dword|qword|xmmword) ptr/g)].map(([, size]) => SIZES[size]),
  ]);

/**
 * What is wrong with the machine code and the notes on it: a step run whose path isn't the machine code of its handler,
 * and a note on an instruction that didn't run, that names a number gdb didn't record there, or that states a number
 * neither recorded nor in the instruction itself. Nothing a note says is guessed.
 */
function machineProblems(file: ReferenceLibrary): string[] {
  const { handlers } = file.machineCode;
  const inRuns = file.examples.flatMap(({ name, runs }) =>
    runs.flatMap((run, at) =>
      run.handlers.flatMap(({ entry, path, values, copied }) => {
        if (!path) return [];
        const handler = entry.split('/')[0];
        const code = handlers[handler];
        if (!code) return [`${name}’s step run ${at + 1} ran ${handler}, which has no machine code`];
        const addresses = new Set(code.instructions.map((instruction) => instruction.at));
        return [
          ...path.filter((address) => !addresses.has(address)).map((address) => `${name}’s step run ${at + 1} ran ${address}, which isn’t an instruction of ${handler}`),
          ...(values ?? []).filter((value) => value.at >= path.length).map((value) => `${name}’s step run ${at + 1} has a value at ${value.at}, past the end of its path`),
          ...(copied && copied.from >= path.length ? [`${name}’s step run ${at + 1} ran copied code from ${copied.from}, past the end of its path`] : []),
        ];
      }),
    ),
  );
  const handlerSlots = slotsOf('handler');
  const inNotes = file.lineNotes.flatMap(({ example, run, handler, note, lines, stages }) => {
    const id = `${example}’s notes on ${handler}`;
    const ran = file.examples.find(({ name }) => name === example)?.runs[run]?.handlers.find(({ entry }) => entry.split('/')[0] === handler);
    if (!ran?.path) return [`${id} are for step run ${run + 1}, which didn’t run ${handler}`];
    const path = ran.path;
    const instructions = new Map(handlers[handler].instructions.map((instruction) => [instruction.at, instruction]));
    const strings = [...(note ? [note] : []), ...Object.values(lines)];
    const onLines = Object.entries(lines).flatMap(([address, say]) => {
      const place = path.indexOf(address);
      if (place < 0) return [`${id} has a note on ${address}, which didn’t run`];
      const recorded = ran.values?.some((value) => value.at === place);
      const unrecorded = slotsIn([say])
        .filter((slot) => (slot === 'before' || slot === 'after') && !recorded)
        .map((slot) => `${id} names {${slot}} at ${address}, where gdb recorded no value`);
      const held = numbersOf(instructions.get(address)!);
      const guessed = numbersIn(say)
        .filter((found) => !held.has(found))
        .map((found) => `${id} states ${found} at ${address}, which gdb didn’t record and the instruction doesn’t hold`);
      return [...unrecorded, ...guessed];
    });
    return [
      ...onLines,
      ...Object.keys(stages ?? {}).filter((address) => !(address in lines)).map((address) => `${id} start a stage at ${address}, which has no note`),
      ...slotsIn(strings).filter((slot) => !handlerSlots.has(slot)).map((slot) => `${id} refer to {${slot}}, which isn’t a Fact of a handler`),
      ...(note ? numbersIn(note).map((found) => `${id} state ${found} in their note, which nothing recorded`) : []),
      ...unclosedBold(id, strings),
    ];
  });
  return [...inRuns, ...inNotes];
}

/**
 * What is wrong with a Reference Library: a copy of the C source that isn't the file at the tag, a quoted line that
 * isn't where it says, a sentence with a slot a step doesn't have or a card that doesn't exist, an Example's step
 * run that names an entry that doesn't exist, and anything wrong with the machine code or the notes on it.
 */
function referenceProblems(file: ReferenceLibrary, copy: Buffer, cardIds: Set<string>): string[] {
  const { source } = file;
  const sha256 = createHash('sha256').update(copy).digest('hex');
  if (sha256 !== source.sha256) return [`${source.copy} isn’t ${source.file} at ${source.tag}: its SHA-256 is ${sha256}`];
  const slots = slotsOf('step');
  const inEntries = Object.entries(file.entries).flatMap(([key, entry]) => {
    const strings = [entry.note, ...entry.lines.map((line) => line.say), ...(entry.pathNote ? [entry.pathNote] : [])];
    const unknownSlots = slotsIn(strings)
      .filter((slot) => !slots.has(slot))
      .map((slot) => `${key} refers to {${slot}}, which isn’t a Fact of a step`);
    // A path note is about any run of the handler, so the only numbers it can state are Facts.
    const guessed = numbersIn(entry.pathNote ?? '').map((found) => `${key}’s path note states ${found}, which nothing recorded`);
    return [...unknownSlots, ...guessed, ...unclosedBold(key, strings), ...conceptProblems(key, strings, cardIds)];
  });
  const inExamples = file.examples.flatMap(({ name, runs }) =>
    runs.flatMap((run, at) =>
      run.handlers.filter(({ entry }) => !(entry in file.entries)).map(({ entry }) => `${name}’s step run ${at + 1} ran ${entry}, which has no entry`),
    ),
  );
  return [...quoteProblems(file, copy.toString('utf-8').split(/\r?\n/)), ...inEntries, ...inExamples, ...machineProblems(file)];
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
