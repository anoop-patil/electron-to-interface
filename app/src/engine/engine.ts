import type { Analysis } from '../generated/analysis';

export type ToWorker = { id: number; code: string };

export type FromWorker =
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  | { type: 'analysis'; id: number; analysis: Analysis }
  | { type: 'error'; id: number; message: string };

export interface Engine {
  /** Resolves once Python has started in the worker; rejects if it can't start. */
  ready: Promise<void>;
  analyze(code: string): Promise<Analysis>;
}

/** Starts Python in a Web Worker, so loading and running it never freezes the page. */
export function startEngine(): Engine {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, { resolve(a: Analysis): void; reject(e: Error): void }>();
  let nextId = 0;
  let startup: { resolve(): void; reject(e: Error): void };
  const ready = new Promise<void>((resolve, reject) => (startup = { resolve, reject }));

  worker.onmessage = ({ data }: MessageEvent<FromWorker>) => {
    if (data.type === 'ready') return startup.resolve();
    if (data.type === 'failed') return startup.reject(new Error(data.message));
    const call = pending.get(data.id);
    pending.delete(data.id);
    if (data.type === 'analysis') call?.resolve(data.analysis);
    else call?.reject(new Error(data.message));
  };
  // The worker's own script failed, so Python will never start and no reply will come.
  worker.onerror = () => {
    const error = new Error('The Python worker failed to load.');
    startup.reject(error);
    for (const call of pending.values()) call.reject(error);
    pending.clear();
  };

  return {
    ready,
    analyze(code) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, code } satisfies ToWorker);
      });
    },
  };
}
