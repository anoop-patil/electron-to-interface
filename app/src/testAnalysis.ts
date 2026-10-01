import greetCapture from '../../prototype/data/example-greet-cpython-3.14.2.json';
import type { Analysis, CommandRun, TokenFact } from './generated/analysis';

/** What the recorded run of a Program left in its Analysis, and the tokens tokenize found. */
type RecordedRun = Pick<Analysis, 'encoding' | 'tokens' | 'stdout' | 'stderr' | 'error' | 'events' | 'runs' | 'eventsCutShort' | 'runsCutShort'>;

/**
 * For tests: an Analysis as the analyzer makes one. The Program ends with a newline, every byte knows its character
 * and line, and `commands` says what each Try it yourself command printed. The Program has no tokens, and the
 * recorded run printed nothing, unless `run` says otherwise.
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

/** For tests: hello world, with its tokens. */
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
  });
};

/** For tests: greet.py, prototype v8's Example, with the tokens captured for v8 (after tokenize's ENCODING), which the analyzer's own tests match. */
export const greetAnalysis = (commands: CommandRun[] = []) =>
  analysisOf(greetCapture.source, commands, {
    tokens: tokensOf(
      greetCapture.source,
      greetCapture.tokens.slice(1).map((token): TokenRow => [token.type, token.text, token.start as [number, number], token.end as [number, number], token.exact]),
      ['def', 'for', 'in'],
    ),
  });

/** What greet.py printed for each Try it yourself command, captured with CPython 3.14.2 on Linux for prototype v8. */
export const GREET_OUTPUT = greetCapture.commands;
