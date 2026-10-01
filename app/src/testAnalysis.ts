import type { Analysis, CommandRun } from './generated/analysis';

/** What the recorded run of a Program left in its Analysis. */
type RecordedRun = Pick<Analysis, 'stdout' | 'stderr' | 'error' | 'events' | 'runs' | 'eventsCutShort' | 'runsCutShort'>;

/**
 * For tests: an Analysis as the analyzer makes one. The Program ends with a newline, every byte knows its character
 * and line, and `commands` says what each Try it yourself command printed. The recorded run printed nothing, unless
 * `run` says otherwise.
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
