import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { readPagesHeaders } from './pagesHeaders';

const site = readPagesHeaders(readFileSync('public/_headers', 'utf-8'));
const policiesOf = (path: string) => site(path).get('Content-Security-Policy')!.split(', ');

test('a path gets the headers of each rule that matches it, joined with a comma where they share a name', () => {
  const headersFor = readPagesHeaders('# a comment\n/*\n  X-One: a\n\n/assets/*\n  X-One: b\n  X-Two: c\n');

  expect(Object.fromEntries(headersFor('/zoom/7'))).toEqual({ 'X-One': 'a' });
  expect(Object.fromEntries(headersFor('/assets/index.js'))).toEqual({ 'X-One': 'a, b', 'X-Two': 'c' });
});

test('a rule this reader can’t match the way Pages does is refused, not ignored', () => {
  expect(() => readPagesHeaders('/:name/*\n  X-One: a\n')).toThrow();
  expect(() => readPagesHeaders('/*\n  ! X-One\n')).toThrow();
});

test('every page gets the Content Security Policy, and the worker a second, stricter one', () => {
  expect(policiesOf('/zoom/7')).toHaveLength(1);
  expect(policiesOf('/zoom/7')[0]).toContain("connect-src 'self' https://cloudflareinsights.com;");
  // The worker that runs the learner's code may connect only to our own site.
  expect(policiesOf('/assets/worker/worker-abc123.js')).toHaveLength(2);
  expect(policiesOf('/assets/worker/worker-abc123.js')[1]).toContain("connect-src 'self'");
  expect(policiesOf('/assets/worker/worker-abc123.js')[1]).not.toContain('cloudflareinsights');
});
