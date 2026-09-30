export interface ZoomLevelInfo {
  number: number;
  title: string;
  /** The label on the depth gauge, short enough for the phone strip. */
  short: string;
  /** Levels 1 to 5 show the learner's code; 6 to 9 show the machine running it (the Interpreter handoff). */
  beforeHandoff: boolean;
}

export const LEVELS: readonly ZoomLevelInfo[] = [
  { number: 1, title: 'Your code', short: 'Code', beforeHandoff: true },
  { number: 2, title: 'Bytes', short: 'Bytes', beforeHandoff: true },
  { number: 3, title: 'Tokens', short: 'Tokens', beforeHandoff: true },
  { number: 4, title: 'Structure', short: 'Structure', beforeHandoff: true },
  { number: 5, title: 'Bytecode', short: 'Bytecode', beforeHandoff: true },
  { number: 6, title: 'The interpreter', short: 'Interpreter', beforeHandoff: false },
  { number: 7, title: 'CPU instructions', short: 'CPU', beforeHandoff: false },
  { number: 8, title: 'Operating system', short: 'OS', beforeHandoff: false },
  { number: 9, title: 'Pixels', short: 'Pixels', beforeHandoff: false },
];

export const FIRST_LEVEL = 1;
export const LAST_LEVEL = LEVELS.length;

export const levelInfo = (level: number) => LEVELS[level - 1];

/** Each zoom level has its own URL path, so back, forward and deep links work, and analytics can count zoom depth. */
export const pathOf = (level: number) => `/zoom/${level}`;

/** The zoom level a URL path shows, or null if the path isn't one of `/zoom/1` to `/zoom/9`. */
export function levelFromPath(path: string): number | null {
  const match = /^\/zoom\/([1-9])\/?$/.exec(path);
  return match ? Number(match[1]) : null;
}
