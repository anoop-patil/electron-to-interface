/** Why the page doesn't start Python in this browser: it has no WebAssembly, or too little memory for Pyodide. */
export type CantRun = 'noWebAssembly' | 'lowMemory';

/** What the browser says about itself. Only Chrome-based browsers report their memory, in GB. */
export interface BrowserInfo {
  webAssembly: boolean;
  deviceMemory: number | undefined;
}

/**
 * Pyodide runs on WebAssembly, and a phone with too little memory can close the tab while it loads rather than fail
 * cleanly. Such a browser gets the Examples, made when the site was built, and a note.
 */
export function whyPythonCantRun({ webAssembly, deviceMemory }: BrowserInfo): CantRun | null {
  if (!webAssembly) return 'noWebAssembly';
  if (deviceMemory !== undefined && deviceMemory < 1) return 'lowMemory';
  return null;
}

/** This browser, as `whyPythonCantRun` reads it. */
export const thisBrowser = (): BrowserInfo => ({
  webAssembly: typeof WebAssembly === 'object',
  deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
});
