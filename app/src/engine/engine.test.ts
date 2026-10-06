import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { analysisOf } from '../testAnalysis';
import { RunStopped, startEngine, TIME_LIMIT_MS, type FromWorker, type ToWorker } from './engine';

/** Stands in for the Python worker: it keeps what the page sends it, and replies when the test says. */
class FakeWorker {
  sent: ToWorker[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage(message: ToWorker) {
    this.sent.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  reply(message: FromWorker) {
    this.onmessage?.({ data: message } as MessageEvent<FromWorker>);
  }
}

let workers: FakeWorker[];
const engine = () =>
  startEngine(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker as unknown as Worker;
  });

beforeEach(() => {
  workers = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const HELLO = analysisOf('print("Hi")\n');

test('a Run gets the Analysis the worker sends back', async () => {
  const python = engine();
  const ran = python.analyze('print("Hi")', 'program.py');

  workers[0].reply({ type: 'analysis', id: workers[0].sent[0].id, analysis: HELLO });

  await expect(ran).resolves.toBe(HELLO);
});

test('code still running after 5 seconds is stopped: its worker is ended and a new one starts', async () => {
  const python = engine();
  const ran = python.analyze('while True: pass', 'program.py');
  const stopped = expect(ran).rejects.toEqual(new RunStopped('timeout'));
  const { id } = workers[0].sent[0];

  workers[0].reply({ type: 'running', id });
  vi.advanceTimersByTime(TIME_LIMIT_MS - 1);
  expect(workers[0].terminated).toBe(false);
  vi.advanceTimersByTime(1);

  await stopped;
  expect(workers[0].terminated).toBe(true);
  expect(workers).toHaveLength(2);
});

test('only time spent running code counts, and the Program and each command get 5 seconds of their own', async () => {
  const python = engine();
  const ran = python.analyze('print("Hi")', 'program.py');
  const { id } = workers[0].sent[0];

  workers[0].reply({ type: 'running', id });
  vi.advanceTimersByTime(TIME_LIMIT_MS - 1000);
  workers[0].reply({ type: 'paused', id });
  vi.advanceTimersByTime(TIME_LIMIT_MS * 2);
  workers[0].reply({ type: 'running', id });
  vi.advanceTimersByTime(TIME_LIMIT_MS - 1000);
  workers[0].reply({ type: 'paused', id });
  workers[0].reply({ type: 'analysis', id, analysis: HELLO });

  await expect(ran).resolves.toBe(HELLO);
  expect(workers[0].terminated).toBe(false);
});

test('a worker whose Python fails for good is replaced, and the Run says why', async () => {
  const python = engine();
  const ran = python.analyze(`print(${Array(3000).fill('1').join('+')})`, 'program.py');

  workers[0].reply({ type: 'crashed', id: workers[0].sent[0].id, reason: 'tooDeep' });

  await expect(ran).rejects.toEqual(new RunStopped('tooDeep'));
  expect(workers[0].terminated).toBe(true);
  expect(workers).toHaveLength(2);
});

test('after a stop, ready is the new Python’s, and the next Run goes to it', async () => {
  const python = engine();
  workers[0].reply({ type: 'ready' });
  await python.ready;
  const ran = python.analyze('while True: pass', 'program.py');
  workers[0].reply({ type: 'running', id: workers[0].sent[0].id });
  vi.advanceTimersByTime(TIME_LIMIT_MS);
  await expect(ran).rejects.toBeInstanceOf(RunStopped);

  let started = false;
  void python.ready.then(() => (started = true));
  await Promise.resolve();
  expect(started).toBe(false);
  workers[1].reply({ type: 'ready' });
  await python.ready;

  const next = python.analyze('print("Hi")', 'program.py');
  expect(workers[1].sent).toHaveLength(1);
  workers[1].reply({ type: 'analysis', id: workers[1].sent[0].id, analysis: HELLO });
  await expect(next).resolves.toBe(HELLO);
});

test('a Run waiting behind one that is stopped goes to the new worker', async () => {
  const python = engine();
  const first = python.analyze('while True: pass', 'program.py');
  const second = python.analyze('print("Hi")', 'program.py');
  const firstStopped = expect(first).rejects.toBeInstanceOf(RunStopped);

  workers[0].reply({ type: 'running', id: workers[0].sent[0].id });
  vi.advanceTimersByTime(TIME_LIMIT_MS);
  await firstStopped;

  expect(workers[1].sent).toEqual([workers[0].sent[1]]);
  workers[1].reply({ type: 'analysis', id: workers[1].sent[0].id, analysis: HELLO });
  await expect(second).resolves.toBe(HELLO);
});
