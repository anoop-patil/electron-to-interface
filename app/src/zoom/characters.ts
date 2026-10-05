/** Characters you can't see, with how each is drawn and read out. */
const INVISIBLE: Record<string, { label: string; description: string }> = {
  '\n': { label: '↵', description: 'a newline' },
  ' ': { label: '␠', description: 'a space' },
  '\t': { label: '⇥', description: 'a tab' },
};

/** How a character is drawn where an invisible one would otherwise be lost. */
export const charLabel = (char: string) => INVISIBLE[char]?.label ?? char;

/** How a character is read out, for screen readers. */
export const describeChar = (char: string) => INVISIBLE[char]?.description ?? `the character ${char}`;

export interface Line {
  number: number;
  /** The line's characters, with their positions in the Program, ending with its newline. */
  chars: { index: number; char: string }[];
}

/** Splits a Program into lines. Positions count code points, as the Analysis's charIndex does. */
export function linesOf(program: string): Line[] {
  const lines: Line[] = [];
  let line: Line = { number: 1, chars: [] };
  Array.from(program).forEach((char, index) => {
    line.chars.push({ index, char });
    if (char === '\n') {
      lines.push(line);
      line = { number: line.number + 1, chars: [] };
    }
  });
  if (line.chars.length > 0) lines.push(line);
  return lines;
}

/** A run of the Program's characters, as positions in characters: from start up to, but not including, end. */
export interface CharSpan {
  start: number;
  end: number;
}

/** A line's characters either side of a marked run, and those in it. With nothing marked, all of them come before. */
export function splitLine(line: Line, marked: CharSpan | null) {
  const { start, end } = marked ?? { start: Infinity, end: Infinity };
  return {
    before: line.chars.filter(({ index }) => index < start),
    marked: line.chars.filter(({ index }) => index >= start && index < end),
    after: line.chars.filter(({ index }) => index >= end),
  };
}
