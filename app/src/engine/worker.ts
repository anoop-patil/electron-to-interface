import type { CrashReason, FromWorker, ToWorker } from './engine';
import { startPython } from './python';

const workerScope = self as unknown as {
  location: Location;
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};

const python = startPython({
  indexURL: new URL(`${import.meta.env.BASE_URL}pyodide/`, workerScope.location.href).href,
});

python.then(
  () => workerScope.postMessage({ type: 'ready' }),
  (error) => workerScope.postMessage({ type: 'failed', message: String(error) }),
);

/**
 * Pyodide marks an error it can't recover from, after which its Python can't be used again. Running out of the
 * browser's stack, as one line nested thousands deep does in compile, is a RangeError in Chrome and an InternalError,
 * "too much recursion", in Firefox.
 */
function crashOf(error: unknown): CrashReason | null {
  if (!(error instanceof Error) || !(error as { pyodide_fatal_error?: boolean }).pyodide_fatal_error) return null;
  return error instanceof RangeError || /too much recursion/.test(error.message) ? 'tooDeep' : 'crashed';
}

workerScope.onmessage = async ({ data: { id, code, fileName } }) => {
  try {
    // The page times the code only while it runs, and ends this worker if it runs for too long.
    const clock = (running: boolean) => workerScope.postMessage({ type: running ? 'running' : 'paused', id });
    workerScope.postMessage({ type: 'analysis', id, analysis: (await python).analyze(code, fileName, clock) });
  } catch (error) {
    const crash = crashOf(error);
    workerScope.postMessage(crash ? { type: 'crashed', id, reason: crash } : { type: 'error', id, message: String(error) });
  }
};
