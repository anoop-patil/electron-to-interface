import { useEffect, useState } from 'react';
import type { Engine } from './engine/engine';
import type { Analysis } from './generated/analysis';
import { BytesZoomLevel } from './zoom/BytesZoomLevel';
import { CodeZoomLevel } from './zoom/CodeZoomLevel';

type PythonStatus = 'starting' | 'ready' | 'failed';

const STATUS_NOTES: Record<PythonStatus, string> = {
  starting: 'Python is starting in your browser. You can type while you wait; Run works once it’s ready.',
  ready: '',
  failed: 'Python couldn’t start in this browser, so Run is off.',
};

export function App({ engine }: { engine: Engine }) {
  const [code, setCode] = useState('print("Hello World!")');
  const [status, setStatus] = useState<PythonStatus>('starting');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
  const selectedByte = analysis?.bytes.find((byte) => byte.id === selectedFactId) ?? null;

  useEffect(() => {
    let current = true;
    engine.ready.then(
      () => current && setStatus('ready'),
      () => current && setStatus('failed'),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  async function run() {
    try {
      setAnalysis(await engine.analyze(code));
      setSelectedFactId(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main>
      <header>
        <h1>ElectronToInterface</h1>
        <p className="sub">Write a short Python program, click Run, and zoom in to see what your computer really does with it.</p>
      </header>

      <div className="program">
        <label htmlFor="program">Your program</label>
        <textarea
          id="program"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          wrap="off"
        />
        <div className="run-row">
          <button type="button" className="run" disabled={status !== 'ready'} onClick={run}>
            Run
          </button>
          <p className="note" role="status">{STATUS_NOTES[status]}</p>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      {analysis && (
        <div className="zoom">
          <p className="tag">Python {analysis.pythonVersion}</p>
          <CodeZoomLevel program={analysis.program} selectedChar={selectedByte?.charIndex ?? null} />
          <BytesZoomLevel analysis={analysis} selectedByte={selectedByte} onSelect={(byte) => setSelectedFactId(byte.id)} />
        </div>
      )}
    </main>
  );
}
