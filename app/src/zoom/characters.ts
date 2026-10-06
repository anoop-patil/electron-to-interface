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

/** What a stretch of code is marked as: the code the Selection comes from, or the code a syntax error points at. */
export type Mark = 'selected' | 'error';

/** A stretch of a line's characters, all marked the same way, or not marked (null). */
export interface Stretch {
  mark: Mark | null;
  chars: Line['chars'];
}

/** A line's characters, in stretches. A character both selected and pointed at by a syntax error shows as selected. */
export function stretchesOf(line: Line, marks: Record<Mark, CharSpan | null>): Stretch[] {
  const holds = (span: CharSpan | null, index: number) => span !== null && index >= span.start && index < span.end;
  const markOf = (index: number): Mark | null => (holds(marks.selected, index) ? 'selected' : holds(marks.error, index) ? 'error' : null);
  const stretches: Stretch[] = [];
  for (const char of line.chars) {
    const mark = markOf(char.index);
    const last = stretches.at(-1);
    if (last && last.mark === mark) last.chars.push(char);
    else stretches.push({ mark, chars: [char] });
  }
  return stretches;
}
