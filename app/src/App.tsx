import { useEffect, useRef, useState } from 'react';
import type { Engine } from './engine/engine';
import type { Analysis } from './generated/analysis';
import { buttonClass } from './button';
import { ConceptsButton } from './concepts/ConceptsButton';
import { MachineMap } from './machine/MachineMap';
import { mapState } from './machine/mapState';
import { Terminal } from './terminal/Terminal';
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

// The zoom view's background shifts from warm (your code) to cool (the machine), one tint per zoom level.
const TINTS = ['bg-tint-1', 'bg-tint-2', 'bg-tint-3', 'bg-tint-4', 'bg-tint-5', 'bg-tint-6', 'bg-tint-7', 'bg-tint-8', 'bg-tint-9'];

const KBD_CLASSES = 'rounded-[5px] border border-b-2 border-rule2 bg-surface px-1.5 py-px font-mono text-[11px] leading-[normal] text-ink2';

export function App({ engine }: { engine: Engine }) {
  const [code, setCode] = useState('print("Hello World!")');
  const [codeHidden, setCodeHidden] = useState(false);
  const [status, setStatus] = useState<PythonStatus>('starting');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
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
    <div className="mx-auto max-w-[1500px] px-[clamp(16px,2vw,28px)] py-[clamp(12px,2vw,24px)] narrow:p-0">
      <div className="overflow-clip rounded-2xl border border-rule bg-surface narrow:rounded-none narrow:border-0">
        <header className="flex flex-wrap items-center gap-2.5 border-b border-rule py-2.5 pl-5 pr-3.5 narrow:py-2 narrow:pl-4 narrow:pr-3">
          <div className="mr-auto flex items-center gap-2.5 text-[16px] font-semibold">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeWidth="1.5" opacity=".5" />
              <circle cx="12" cy="12" r="2" fill="var(--accent)" />
            </svg>
            <span>ElectronToInterface</span>
          </div>
          {analysis && <span className="whitespace-nowrap rounded-[999px] border border-rule2 px-2.5 py-1 font-mono text-[12px] leading-[normal] text-ink2">Python {analysis.pythonVersion}</span>}
          <ConceptsButton />
          <ThemeToggle />
        </header>

        <div className="grid grid-cols-[310px_168px_minmax(0,1fr)] mid:grid-cols-[270px_150px_minmax(0,1fr)] narrow:grid-cols-[minmax(0,1fr)]">
          {/* The left column: the editor, the Terminal, then the Machine map. */}
          <div className="min-w-0 border-r border-rule narrow:border-r-0">
            <aside
              className={`flex min-w-0 flex-col gap-3 px-[18px] py-[22px] narrow:border-b narrow:border-rule narrow:px-4 narrow:pt-3 ${codeHidden ? 'narrow:pb-3' : 'narrow:pb-4'}`}
              aria-label="Editor"
            >
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="program" className={`text-[13px] font-semibold text-ink2${codeHidden ? ' narrow:hidden' : ''}`}>Your program</label>
                {codeHidden && <code className="hidden min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-pre text-[14px] text-ink2 narrow:block">{code.split('\n')[0]}</code>}
                <button
                  type="button"
                  className={`${buttonClass({ size: 'sm' })} not-narrow:hidden`}
                  aria-expanded={!codeHidden}
                  aria-controls="program-editor"
                  onClick={() => setCodeHidden(!codeHidden)}
                >
                  {codeHidden ? 'Show code' : 'Hide code'}
                </button>
              </div>
              <div className={`grid gap-3${codeHidden ? ' narrow:hidden' : ''}`} id="program-editor">
                <p className="text-[14px] text-ink2">Write a short Python program, click Run, and zoom in to see what your computer really does with it.</p>
                <textarea
                  id="program"
                  className="min-h-[150px] w-full resize-y [tab-size:4] rounded-[10px] border border-rule2 bg-sunk px-3 py-2.5 font-mono text-[14px] leading-[1.6] text-ink focus:border-accent"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                  autoCorrect="off"
                  wrap="off"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className={buttonClass({ primary: true, size: 'wide' })} disabled={status !== 'ready'} onClick={run}>
                    Run
                  </button>
                  <p className="text-[14px] text-ink2 empty:hidden" role="status">{STATUS_NOTES[status]}</p>
                </div>
                {error && <p className="whitespace-pre-wrap font-mono text-[13px] text-warn" role="alert">{error}</p>}
                <p className="flex flex-wrap gap-x-3 gap-y-1.5 text-[12px] text-ink3 narrow:hidden">
                  <span><kbd className={KBD_CLASSES}>↓</kbd> zoom in</span>
                  <span><kbd className={KBD_CLASSES}>↑</kbd> zoom out</span>
                </p>
              </div>
            </aside>
            <Terminal analysis={analysis} />
            <MachineMap state={mapState({ level, analysis, selection: selectedFactId })} />
          </div>

          <DepthGauge level={level} onGo={go} />

          {/* `stage` is a hook for the tests, not a style. */}
          <main className={`stage min-w-0 px-[clamp(16px,4vw,48px)] pb-10 pt-6 narrow:px-4 narrow:pb-8 narrow:pt-5 ${TINTS[level - 1]}`} data-level={level}>
            <ZoomView
              level={level}
              analysis={analysis}
              selection={selectedFactId}
              onSelect={setSelectedFactId}
              onGo={go}
              viewRef={view}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
