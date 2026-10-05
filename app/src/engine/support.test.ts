import { expect, test } from 'vitest';
import { whyPythonCantRun } from './support';

test('Python can run where the browser has WebAssembly and doesn’t report less than 1 GB of memory', () => {
  expect(whyPythonCantRun({ webAssembly: true, deviceMemory: 8 })).toBeNull();
  expect(whyPythonCantRun({ webAssembly: true, deviceMemory: 1 })).toBeNull();
  // Only Chrome-based browsers report their memory.
  expect(whyPythonCantRun({ webAssembly: true, deviceMemory: undefined })).toBeNull();
});

test('a browser with no WebAssembly, or under 1 GB of memory, doesn’t start Python', () => {
  expect(whyPythonCantRun({ webAssembly: false, deviceMemory: 8 })).toBe('noWebAssembly');
  expect(whyPythonCantRun({ webAssembly: true, deviceMemory: 0.5 })).toBe('lowMemory');
});
