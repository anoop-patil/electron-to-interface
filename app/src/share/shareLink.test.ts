import { describe, expect, it } from 'vitest';
import { programInLink, shareLinkFor } from './shareLink';

const fragmentOf = (link: string) => new URL(link).hash;

// Twenty lines that use what can go wrong on the way into a URL and back: accents, emoji, tabs, a backslash, spaces at
// the end of a line, blank lines and characters URLs treat specially.
const TWENTY_LINES = [
  '# Grüße, 世界 🐍',
  'import math',
  '',
  'def area(r):',
  '\treturn math.pi * r ** 2   ',
  '',
  'names = ["Zoë", "José", "Ὀδυσσεύς"]',
  'for n in names:',
  '    print(f"{n:>10}|")',
  '',
  'path = "C:\\\\temp\\\\new"',
  'query = "a=1&b=2#top?x=%20"',
  'print(path, query)',
  'total = 0',
  'while total < 3:',
  '    total += 1',
  'else:',
  '    print("done", total)',
  'print(area(2))',
  '',
].join('\n');

describe('a Share link', () => {
  it('carries a 20-line Program, which comes back exactly', async () => {
    const link = await shareLinkFor(TWENTY_LINES, 'https://example.org/zoom/4?x=1#old');
    expect(await programInLink(fragmentOf(link))).toEqual({ kind: 'program', code: TWENTY_LINES });
  });

  it('opens zoom level 1 of the same site, with the Program only in the fragment, in characters a URL keeps as they are', async () => {
    const link = await shareLinkFor('print("Hello World!")', 'https://example.org/zoom/4?x=1#old');
    expect(link).toMatch(/^https:\/\/example\.org\/zoom\/1#code=[A-Za-z0-9_-]+$/);
  });

  it('is not what any other fragment is', async () => {
    expect(await programInLink('')).toBeNull();
    expect(await programInLink('#top')).toBeNull();
  });

  it('cut short, or mistyped, says it is broken', async () => {
    const fragment = fragmentOf(await shareLinkFor(TWENTY_LINES, 'https://example.org/'));
    expect(await programInLink(fragment.slice(0, -12))).toEqual({ kind: 'broken' });
    expect(await programInLink('#code=not*base64')).toEqual({ kind: 'broken' });
    expect(await programInLink('#code=')).toEqual({ kind: 'broken' });
  });

  it('gives Windows line endings as plain newlines, as the editor holds them', async () => {
    const link = await shareLinkFor('print(1)\r\nprint(2)\rprint(3)', 'https://example.org/');
    expect(await programInLink(fragmentOf(link))).toEqual({ kind: 'program', code: 'print(1)\nprint(2)\nprint(3)' });
  });

  it('carrying more than a megabyte of code is refused, since deflate can shrink repeated text about 1,000 times', async () => {
    const most = 'x'.repeat(1_000_000);
    expect(await programInLink(fragmentOf(await shareLinkFor(most, 'https://example.org/')))).toEqual({ kind: 'program', code: most });
    expect(await programInLink(fragmentOf(await shareLinkFor(`${most}x`, 'https://example.org/')))).toEqual({ kind: 'tooLarge' });
  });
});
