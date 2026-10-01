import greetCapture from '../../prototype/data/example-greet-cpython-3.14.2.json';
import type { Analysis, AstFact, AstField, CommandRun, TokenFact } from './generated/analysis';

/** What the recorded run of a Program left in its Analysis, and the tokens and syntax tree Python found. */
type RecordedRun = Pick<Analysis, 'encoding' | 'tokens' | 'ast' | 'stdout' | 'stderr' | 'error' | 'events' | 'runs' | 'eventsCutShort' | 'runsCutShort'>;

/**
 * For tests: an Analysis as the analyzer makes one. The Program ends with a newline, every byte knows its character
 * and line, and `commands` says what each Try it yourself command printed. The Program has no tokens and no syntax
 * tree, and the recorded run printed nothing, unless `run` says otherwise.
 */
export function analysisOf(program: string, commands: CommandRun[] = [], run: Partial<RecordedRun> = {}): Analysis {
  const bytes: Analysis['bytes'] = [];
  let line = 1;
  Array.from(program).forEach((char, charIndex) => {
    for (const value of new TextEncoder().encode(char)) bytes.push({ id: `byte-${bytes.length}`, value, charIndex, line });
    if (char === '\n') line++;
  });
  return {
    pythonVersion: '3.14.2',
    program,
    fileName: 'program.py',
    bytes,
    encoding: 'utf-8',
    tokens: [],
    ast: [],
    stdout: '',
    stderr: '',
    error: null,
    events: [],
    runs: [],
    eventsCutShort: false,
    runsCutShort: false,
    ...run,
    commands,
  };
}

/** A token as tokenize reports it: type, text, start and end as [line, column], and for an OP its exact kind. */
export type TokenRow = [type: string, text: string, start: [number, number], end: [number, number], exactType?: string];

/** For tests: the TokenFacts of the rows, with their byte spans worked out from the Program, as the analyzer does. */
export function tokensOf(program: string, rows: TokenRow[], keywords: string[] = []): TokenFact[] {
  const lines = program.split(/(?<=\n)/);
  const byteAt = (line: number, column: number) => {
    const before = lines.slice(0, line - 1).join('') + Array.from(lines[line - 1] ?? '').slice(0, column).join('');
    return new TextEncoder().encode(before).length;
  };
  return rows.map(([type, text, [line, column], [endLine, endColumn], exactType], index) => ({
    id: `tok-${index}`,
    type,
    exactType: exactType ?? type,
    text,
    ...(type === 'NAME' && keywords.includes(text) && { keyword: true as const }),
    start: { line, column },
    end: { line: endLine, column: endColumn },
    span: { start: byteAt(line, column), end: byteAt(endLine, endColumn) },
  }));
}

/**
 * A node as prototype v8's capture records it: its parent and the field holding it, its children as [field, index],
 * its span in bytes, and its name, value and ctx, if it has them.
 */
export interface CapturedNode {
  type: string;
  parent: number | null;
  field: string | null;
  kids: (string | number)[][];
  span?: number[];
  id?: string;
  name?: string;
  arg?: string;
  value?: string;
  ctx?: string;
}

/** The fields that hold a list of nodes, in the kinds of node the captures have. */
const isList = (type: string, field: string) => ['body', 'elts'].includes(field) || (field === 'args' && type !== 'FunctionDef');

/**
 * For tests: AstFacts from nodes as v8's capture records them. Python lists a node's fields in an order of its own;
 * for the kinds of node the captures have, it is the node's name or value, then its children, then its ctx.
 */
export function astOf(nodes: CapturedNode[]): AstFact[] {
  return nodes.map((node, index) => {
    const fields: AstField[] = [];
    for (const name of ['id', 'name', 'arg'] as const) if (node[name] !== undefined) fields.push({ name, value: `'${node[name]}'` });
    if (node.value !== undefined) fields.push({ name: 'value', value: node.value });
    for (const [field, kid] of node.kids) {
      const last = fields.at(-1);
      if (last && 'nodes' in last && last.name === field) last.nodes.push(`ast-${kid}`);
      else fields.push({ name: String(field), nodes: [`ast-${kid}`], list: isList(node.type, String(field)) });
    }
    if (node.ctx !== undefined) fields.push({ name: 'ctx', value: `${node.ctx}()` });
    return {
      id: `ast-${index}`,
      type: node.type,
      parent: node.parent === null ? null : `ast-${node.parent}`,
      field: node.field,
      // v8 gave the nodes with no place in the code the whole file; the analyzer gives them none.
      span: node.span && !['Module', 'arguments'].includes(node.type) ? { start: node.span[0], end: node.span[1] } : null,
      fields,
    };
  });
}

/** For tests: hello world, with its tokens and its syntax tree. */
export const helloWorld = (commands: CommandRun[] = []) => {
  const program = 'print("Hello World!")\n';
  return analysisOf(program, commands, {
    tokens: tokensOf(program, [
      ['NAME', 'print', [1, 0], [1, 5]],
      ['OP', '(', [1, 5], [1, 6], 'LPAR'],
      ['STRING', '"Hello World!"', [1, 6], [1, 20]],
      ['OP', ')', [1, 20], [1, 21], 'RPAR'],
      ['NEWLINE', '\n', [1, 21], [1, 22]],
      ['ENDMARKER', '', [2, 0], [2, 0]],
    ]),
    ast: astOf([
      { type: 'Module', parent: null, field: null, kids: [['body', 1]] },
      { type: 'Expr', parent: 0, field: 'body', kids: [['value', 2]], span: [0, 21] },
      { type: 'Call', parent: 1, field: 'value', kids: [['func', 3], ['args', 4]], span: [0, 21] },
      { type: 'Name', parent: 2, field: 'func', kids: [], span: [0, 5], id: 'print', ctx: 'Load' },
      { type: 'Constant', parent: 2, field: 'args', kids: [], span: [6, 20], value: "'Hello World!'" },
    ]),
  });
};

/** For tests: greet.py, prototype v8's Example, with the tokens (after tokenize's ENCODING) and syntax tree captured for v8, which the analyzer's own tests match. */
export const greetAnalysis = (commands: CommandRun[] = []) =>
  analysisOf(greetCapture.source, commands, {
    tokens: tokensOf(
      greetCapture.source,
      greetCapture.tokens.slice(1).map((token): TokenRow => [token.type, token.text, token.start as [number, number], token.end as [number, number], token.exact]),
      ['def', 'for', 'in'],
    ),
    ast: astOf(greetCapture.ast),
  });

/** What greet.py printed for each Try it yourself command, captured with CPython 3.14.2 on Linux for prototype v8. */
export const GREET_OUTPUT = greetCapture.commands;
