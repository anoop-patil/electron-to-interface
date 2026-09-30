import { useEffect, useRef, useState } from 'react';
import type { Engine } from './engine/engine';
import type { Analysis } from './generated/analysis';
import { ThemeToggle } from './ThemeToggle';
import { DepthGauge } from './zoom/DepthGauge';
import { useZoomNavigation } from './zoom/useZoomNavigation';
import { ZoomView } from './zoom/ZoomView';

type PythonStatus = 'starting' | 'ready' | 'failed';

const STATUS_NOTES: Record<PythonStatus, string> = {
  starting: 'Python is starting in your browser. You can type while you wait; Run works once it’s ready.',
  ready: '',
  failed: 'Python couldn’t start in this browser, so Run is off.',
};

export function App({ engine }: { engine: Engine }) {
  const [code, setCode] = useState('print("Hello World!")');
  const [codeHidden, setCodeHidden] = useState(false);
  const [status, setStatus] = useState<PythonStatus>('starting');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
  const selectedByte = analysis?.bytes.find((byte) => byte.id === selectedFactId) ?? null;
  const view = useRef<HTMLDivElement>(null);
  const { level, go } = useZoomNavigation(view);

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
    <div className="app">
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeWidth="1.5" opacity=".5" />
              <circle cx="12" cy="12" r="2" fill="var(--accent)" />
            </svg>
            <span>ElectronToInterface</span>
          </div>
          {analysis && <span className="tag">Python {analysis.pythonVersion}</span>}
          <ThemeToggle />
        </header>

        <div className="body">
          <aside className={`side${codeHidden ? ' code-hidden' : ''}`} aria-label="Editor">
            <div className="pane-h">
              <label htmlFor="program">Your program</label>
              {codeHidden && <code className="code-summary">{code.split('\n')[0]}</code>}
              <button
                type="button"
                className="btn btn-sm collapse-toggle"
                aria-expanded={!codeHidden}
                aria-controls="program-editor"
                onClick={() => setCodeHidden(!codeHidden)}
              >
                {codeHidden ? 'Show code' : 'Hide code'}
              </button>
            </div>
            <div className="program" id="program-editor">
              <p className="sub">Write a short Python program, click Run, and zoom in to see what your computer really does with it.</p>
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
                <button type="button" className="btn btn-primary" disabled={status !== 'ready'} onClick={run}>
                  Run
                </button>
                <p className="note" role="status">{STATUS_NOTES[status]}</p>
              </div>
              {error && <p className="error" role="alert">{error}</p>}
              <p className="keys">
                <span><kbd>↓</kbd> zoom in</span>
                <span><kbd>↑</kbd> zoom out</span>
              </p>
            </div>
          </aside>

          <DepthGauge level={level} onGo={go} />

          <main className="stage" data-level={level}>
            <ZoomView
              level={level}
              analysis={analysis}
              selectedByte={selectedByte}
              onSelectByte={(byte) => setSelectedFactId(byte.id)}
              onGo={go}
              viewRef={view}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
