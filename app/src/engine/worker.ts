import type { FromWorker, ToWorker } from './engine';
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

workerScope.onmessage = async ({ data: { id, code } }) => {
  try {
    workerScope.postMessage({ type: 'analysis', id, analysis: (await python).analyze(code) });
  } catch (error) {
    workerScope.postMessage({ type: 'error', id, message: String(error) });
  }
};
