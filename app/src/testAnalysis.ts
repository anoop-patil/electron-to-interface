import type { Analysis, CommandRun } from './generated/analysis';

/**
 * For tests: an Analysis as the analyzer makes one. The Program ends with a newline, every byte knows its character
 * and line, and `commands` says what each Try it yourself command printed.
 */
export function analysisOf(program: string, commands: CommandRun[] = []): Analysis {
  const bytes: Analysis['bytes'] = [];
  let line = 1;
  Array.from(program).forEach((char, charIndex) => {
    for (const value of new TextEncoder().encode(char)) bytes.push({ id: `byte-${bytes.length}`, value, charIndex, line });
    if (char === '\n') line++;
  });
  return { pythonVersion: '3.14.2', program, fileName: 'program.py', bytes, commands };
}
