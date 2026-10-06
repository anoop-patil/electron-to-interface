import type { Analysis } from '../generated/analysis';

export type ToWorker = { id: number; code: string; fileName: string };

/**
 * Why a Run was stopped before it finished: its code ran for 5 seconds, the Python in the browser ran out of stack, or
 * that Python failed for another reason. Each time, the worker is ended and a new one starts.
 */
export type StopReason = 'timeout' | 'tooDeep' | 'crashed';

/** Why the worker's Python failed for good. */
export type CrashReason = Exclude<StopReason, 'timeout'>;

export type FromWorker =
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  | { type: 'running'; id: number }
  | { type: 'paused'; id: number }
  | { type: 'crashed'; id: number; reason: CrashReason }
  | { type: 'analysis'; id: number; analysis: Analysis }
  | { type: 'error'; id: number; message: string };

/** How long the Program, or a Try it yourself command, can run in one go before it is stopped. */
export const TIME_LIMIT_MS = 5000;

/** A Run stopped before it finished, and why. */
export class RunStopped extends Error {
  constructor(readonly reason: StopReason) {
    super(`The Run was stopped: ${reason}`);
  }
}

export interface Engine {
  /** Resolves once Python has started in the worker; rejects if it can't start. After a stop, it is the new worker's. */
  readonly ready: Promise<void>;
  /** Analyzes the Program, saved as `fileName` for the Try it yourself commands. Rejects with RunStopped if it is stopped. */
  analyze(code: string, fileName: string): Promise<Analysis>;
}

/** One worker, with Python starting or started in it. */
interface Python {
  worker: Worker;
  ready: Promise<void>;
}

interface Call {
  message: ToWorker;
  python: Python;
  resolve(analysis: Analysis): void;
  reject(error: Error): void;
}

const pythonWorker = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

/**
 * Starts Python in a Web Worker, so loading and running it never freezes the page. Code that runs for more than 5
 * seconds can't be interrupted inside the worker, so the worker is ended, and a new one started; so is one whose
 * Python failed for good.
 */
export function startEngine(makeWorker: () => Worker = pythonWorker): Engine {
  const calls = new Map<number, Call>();
  let nextId = 0;
  let python = start();

  function start(): Python {
    const worker = makeWorker();
    let startup!: { resolve(): void; reject(e: Error): void };
    const ready = new Promise<void>((resolve, reject) => (startup = { resolve, reject }));
    // A new worker can fail before anyone asks if it is ready; whoever asks later still hears it failed.
    ready.catch(() => {});
    const started: Python = { worker, ready };
    let timer: ReturnType<typeof setTimeout> | undefined;

    worker.onmessage = ({ data }: MessageEvent<FromWorker>) => {
      if (data.type === 'ready') return startup.resolve();
      if (data.type === 'failed') return startup.reject(new Error(data.message));
      clearTimeout(timer);
      if (data.type === 'running') {
        timer = setTimeout(() => restart(started, data.id, new RunStopped('timeout')), TIME_LIMIT_MS);
        return;
      }
      if (data.type === 'paused') return;
      if (data.type === 'crashed') return restart(started, data.id, new RunStopped(data.reason));
      const call = calls.get(data.id);
      calls.delete(data.id);
      if (data.type === 'analysis') call?.resolve(data.analysis);
      else call?.reject(new Error(data.message));
    };
    // The worker's own script failed, so Python will never start and no reply will come.
    worker.onerror = () => {
      const error = new Error('The Python worker failed to load.');
      startup.reject(error);
      for (const [id, call] of calls) {
        if (call.python !== started) continue;
        calls.delete(id);
        call.reject(error);
      }
    };
    return started;
  }

  /** Ends `stopped`'s worker and starts a new one. Run `id` fails with `error`; any Runs waiting behind it go to the new worker. */
  function restart(stopped: Python, id: number, error: RunStopped) {
    if (stopped !== python) return;
    stopped.worker.terminate();
    python = start();
    calls.get(id)?.reject(error);
    calls.delete(id);
    for (const call of calls.values()) if (call.python === stopped) send(call);
  }

  function send(call: Call) {
    call.python = python;
    python.worker.postMessage(call.message);
  }

  return {
    get ready() {
      return python.ready;
    },
    analyze(code, fileName) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const call: Call = { message: { id, code, fileName }, python, resolve, reject };
        calls.set(id, call);
        send(call);
      });
    },
  };
}
