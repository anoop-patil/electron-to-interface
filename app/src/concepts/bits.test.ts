import { expect, test } from 'vitest';
import { bitsOf, utf8Rows } from './bits';

test('a byte is 8 switches worth 128 down to 1, and the ones that are on add up to it', () => {
  const p = bitsOf(112);

  expect(p.pattern).toBe('01110000');
  expect(p.bits.map((bit) => bit.value)).toEqual([128, 64, 32, 16, 8, 4, 2, 1]);
  expect(p.bits.filter((bit) => bit.on).map((bit) => bit.value)).toEqual([64, 32, 16]);
  expect(p.sum).toBe('64 + 32 + 16 = 112');
  expect(bitsOf(0).sum).toBe('0 = 0');
  expect(bitsOf(255).pattern).toBe('11111111');
});

test('the UTF-8 table works out each character’s bytes, and names the ones you can’t see', () => {
  expect(utf8Rows(['A', ' ', '\n', 'é', '😀'])).toEqual([
    { char: 'A', bytes: '65', count: 1 },
    { char: 'space', bytes: '32', count: 1 },
    { char: 'newline', bytes: '10', count: 1 },
    { char: 'é', bytes: '195 169', count: 2 },
    { char: '😀', bytes: '240 159 152 128', count: 4 },
  ]);
});
