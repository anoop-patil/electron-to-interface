import { describe, expect, test } from 'vitest';
import { LEVELS, levelFromPath, pathOf } from './levels';

describe('zoom levels', () => {
  test('there are nine, from your code down to pixels', () => {
    expect(LEVELS.map((level) => level.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(LEVELS[0].title).toBe('Your code');
    expect(LEVELS[8].title).toBe('Pixels');
  });

  test('levels 1 to 5 are before the Interpreter handoff, 6 to 9 after it', () => {
    expect(LEVELS.filter((level) => level.beforeHandoff).map((level) => level.number)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('each zoom level has its own URL path', () => {
  test('/zoom/N is level N', () => {
    for (let n = 1; n <= 9; n++) {
      expect(pathOf(n)).toBe(`/zoom/${n}`);
      expect(levelFromPath(pathOf(n))).toBe(n);
    }
  });

  test('a trailing slash is the same path', () => {
    expect(levelFromPath('/zoom/4/')).toBe(4);
  });

  test('any other path is not a zoom level', () => {
    for (const path of ['/', '', '/zoom', '/zoom/0', '/zoom/10', '/zoom/1a', '/zoom/01', '/other/3']) {
      expect(levelFromPath(path)).toBeNull();
    }
  });
});
