import { charLabel } from '../zoom/characters';

const VALUES = [128, 64, 32, 16, 8, 4, 2, 1];

/** A byte as 8 switches, worth 128 down to 1, and the sum of the ones that are on: the way binary is read. */
export function bitsOf(value: number) {
  const pattern = value.toString(2).padStart(8, '0');
  const bits = VALUES.map((bitValue, at) => ({ value: bitValue, on: pattern[at] === '1' }));
  const on = bits.filter((bit) => bit.on).map((bit) => bit.value);
  return { pattern, bits, sum: `${on.length > 0 ? on.join(' + ') : '0'} = ${value}` };
}

const NAMES: Record<string, string> = { ' ': 'space', '\n': 'newline' };

/** The rows of the UTF-8 card's table: each character, and the bytes UTF-8 stores it as. */
export const utf8Rows = (chars: string[]) =>
  chars.map((char) => {
    const bytes = [...new TextEncoder().encode(char)];
    return { char: NAMES[char] ?? charLabel(char), bytes: bytes.join(' '), count: bytes.length };
  });
