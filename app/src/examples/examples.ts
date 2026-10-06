import type { Analysis } from '../generated/analysis';

/** A curated Program shipped with the site, whose Analysis is made when the site is built. */
export interface Example {
  /** Names its Analysis: the site serves it at examples/{id}.json. */
  id: string;
  /** The button that picks it. */
  label: string;
  /** Its Program, from the app folder. */
  source: string;
}

/** The Examples, in the order the page offers them. greet.py is prototype v8's Example. */
export const EXAMPLES: Example[] = [
  { id: 'hello', label: 'hello world', source: 'examples/hello.py' },
  { id: 'loop', label: 'for loop', source: 'examples/loop.py' },
  { id: 'greet', label: 'function', source: '../prototype/examples/greet.py' },
  { id: 'comprehension', label: 'list comprehension', source: 'examples/comprehension.py' },
  { id: 'class', label: 'class', source: 'examples/class.py' },
  { id: 'syntax', label: 'syntax error', source: 'examples/syntax.py' },
];

/** Where the site serves an Example's Analysis, below its base URL. */
export const analysisPath = (id: string) => `examples/${id}.json`;

/** Fetches an Example's Analysis, made when the site was built, so it shows without waiting for Python. */
export async function loadExample(id: string): Promise<Analysis> {
  const response = await fetch(import.meta.env.BASE_URL + analysisPath(id));
  if (!response.ok) throw new Error(`The Example ${id} couldn’t load: ${response.status} ${response.statusText}`);
  return response.json();
}
