// Checks that every line of C quoted at level 6 appears at exactly the line numbers the page shows,
// in CPython's Python/bytecodes.c at the tag we link to.
//
// Each quote in the page's CPAIRS data is [english, code, firstLine, lastLine]. A statement that spans
// several source lines is quoted on one line; whitespace is ignored when comparing. A quote ending in
// "…" only has to match the start of those lines.
//
// Usage: node prototype/tools/check-c-refs.mjs prototype/hello-zoom-v7.html [path/to/bytecodes.c]
// Without a local file it downloads bytecodes.c for the tag from GitHub.

import { readFileSync } from 'node:fs';

const TAG = 'v3.14.2';
const [, , htmlPath, localSource] = process.argv;
if (!htmlPath) { console.error('usage: check-c-refs.mjs <page.html> [bytecodes.c]'); process.exit(2); }

const html = readFileSync(htmlPath, 'utf8');
const start = html.indexOf('var CPAIRS = [');
const end = html.indexOf('\n];', start);
if (start < 0 || end < 0) { console.error('CPAIRS not found in ' + htmlPath); process.exit(2); }
const CPAIRS = new Function('return ' + html.slice(start + 'var CPAIRS = '.length, end + 2))();

const source = localSource
  ? readFileSync(localSource, 'utf8')
  : await (await fetch(`https://raw.githubusercontent.com/python/cpython/${TAG}/Python/bytecodes.c`)).text();
const lines = source.split('\n');
const norm = s => s.replace(/\s+/g, '');

let failures = 0;
CPAIRS.forEach((entry, i) => {
  entry.pairs.forEach(([, code, first, last]) => {
    const actual = norm(lines.slice(first - 1, last).join('\n'));
    const partial = /…\s*$/.test(code);
    const want = norm(code.replace(/\s*…\s*$/, ''));
    const ok = partial ? actual.startsWith(want) : actual === want;
    if (!ok) failures++;
    const where = first === last ? `line ${first}` : `lines ${first}-${last}`;
    console.log(`${ok ? 'ok  ' : 'FAIL'} step ${i + 1}, ${where}: ${code}`);
    if (!ok) console.log(`       source says: ${lines.slice(first - 1, last).map(l => l.trim()).join(' ')}`);
  });
});
console.log(failures ? `\n${failures} quoted line(s) don't match the line numbers shown` : '\nAll quoted C lines match the exact line numbers shown');
process.exitCode = failures ? 1 : 0;
