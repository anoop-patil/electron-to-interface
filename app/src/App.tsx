import { useEffect, useRef, useState } from 'react';
import type { Engine } from './engine/engine';
import type { CantRun } from './engine/support';
import { ExamplePicker } from './examples/ExamplePicker';
import { EXAMPLES, loadExample } from './examples/examples';
import helloSource from '../examples/hello.py?raw';
import { FILE_NAME } from './explain/commands';
import { errorSpan } from './explain/syntaxError';
import type { Analysis } from './generated/analysis';
import { buttonClass } from './button';
import { ConceptsButton } from './concepts/ConceptsButton';
import { MachineMap } from './machine/MachineMap';
import { mapState } from './machine/mapState';
import { useScreen } from './screen';
import { Terminal } from './terminal/Terminal';
import { ThemeToggle } from './ThemeToggle';
import { fileNameFor, importNote, lineLimitNote } from './editor/limits';
import { ProgramEditor, type Highlight } from './editor/ProgramEditor';
import { DepthGauge } from './zoom/DepthGauge';
import { useZoomNavigation } from './zoom/useZoomNavigation';
import { charsOf, selectionAt } from './zoom/selection';
import { ZoomView } from './zoom/ZoomView';

type PythonStatus = 'starting' | 'ready' | 'failed' | CantRun;

const EXAMPLES_STILL_WORK = 'The Examples still work: Python ran each one when this site was built.';

const STATUS_NOTES: Record<PythonStatus, string> = {
  starting: 'Python is loading in your browser. You can type, or try the Examples, while you wait; Run works once it’s ready.',
  ready: '',
  failed: `Python couldn’t start in this browser, so Run is off. ${EXAMPLES_STILL_WORK}`,
  noWebAssembly: `This browser can’t run WebAssembly, which Python needs here, so Run is off. ${EXAMPLES_STILL_WORK}`,
  lowMemory: `This device reports less than 1 GB of memory, too little to run Python here, so Run is off. ${EXAMPLES_STILL_WORK}`,
};

/** What the zoom view shows: an Analysis, and the code as it was in the editor when it was made. */
interface ShownAnalysis {
  analysis: Analysis;
  code: string;
}

/** The code the editor shows for an Example: its Analysis's Program ends with a newline the editor doesn't need. */
const codeOf = (analysis: Analysis) => analysis.program.replace(/\n$/, '');

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

// The zoom view's background shifts from warm (your code) to cool (the machine), one tint per zoom level.
const TINTS = ['bg-tint-1', 'bg-tint-2', 'bg-tint-3', 'bg-tint-4', 'bg-tint-5', 'bg-tint-6', 'bg-tint-7', 'bg-tint-8', 'bg-tint-9'];

const KBD_CLASSES = 'rounded-[5px] border border-b-2 border-rule2 bg-surface px-1.5 py-px font-mono text-[11px] leading-[normal] text-ink2';

/**
 * The page. `engine` is Python, starting in a Web Worker, or null where `cantRun` says why the browser can't run it.
 * Hello world shows at once, from its Analysis made when the site was built, while Python loads.
 */
export function App({ engine, cantRun = null }: { engine: Engine | null; cantRun?: CantRun | null }) {
  const [code, setCode] = useState(helloSource.replace(/\n$/, ''));
  // The name the Try it yourself commands use: the uploaded file's, made safe to type, or program.py.
  const [fileName, setFileName] = useState(FILE_NAME);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const [codeHidden, setCodeHidden] = useState(false);
  const [status, setStatus] = useState<PythonStatus>(cantRun ?? 'starting');
  const [shown, setShown] = useState<ShownAnalysis | null>(null);
  const analysis = shown?.analysis ?? null;
  const screen = useScreen();
  const [error, setError] = useState<string | null>(null);
  // The Run Python is working on, if any: Run is off meanwhile, and the zoom view says it is busy.
  const [runningRequest, setRunningRequest] = useState<number | null>(null);
  const running = runningRequest !== null;
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
  const view = useRef<HTMLDivElement>(null);
  const { level, go } = useZoomNavigation(view);
  // Counts the learner's Runs and Example picks, so only the latest one's Analysis is shown.
  const requests = useRef(0);

  useEffect(() => {
    if (!engine) return;
    let current = true;
    engine.ready.then(
      () => current && setStatus('ready'),
      () => current && setStatus('failed'),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  // Hello world, unless the learner has already clicked Run or picked an Example.
  useEffect(() => {
    let current = true;
    loadExample(EXAMPLES[0].id).then(
      (hello) => current && requests.current === 0 && setShown((before) => before ?? { analysis: hello, code: codeOf(hello) }),
      (e) => current && requests.current === 0 && setError(messageOf(e)),
    );
    return () => {
      current = false;
    };
  }, []);

  // What the zoom level on screen shows selected: the learner's Selection, or the closest match to it at this level.
  const levelSelection = analysis && selectionAt(analysis, selectedFactId, level);
  // The editor marks the code the Selection comes from, and the code a syntax error points at, while the code is still what was run.
  const unedited = analysis && code === shown?.code ? analysis : null;
  const selected = unedited && levelSelection ? charsOf(unedited, levelSelection) : null;
  const errorChars = unedited && errorSpan(unedited);
  const highlight: Highlight | null = unedited && (selected || errorChars) ? { program: unedited.program, selected, error: errorChars } : null;
  // The Example on show, while its code is unedited.
  const shownExample = analysis?.example !== undefined && code === shown?.code ? analysis.example : null;
  // The code has changed since the Analysis on show was made, so the zoom view is out of date until the next Run.
  const outOfDate = shown !== null && code !== shown.code;
  const tooLong = lineLimitNote(code);
  const notStandardLibrary = analysis && importNote(analysis);

  /**
   * Shows what `make` makes, unless the learner has clicked Run or picked an Example since. An Example's code goes
   * into the editor; a Run leaves the editor alone, in case the learner typed while Python worked.
   */
  async function show(request: number, make: () => Promise<ShownAnalysis>, { intoEditor }: { intoEditor: boolean }) {
    try {
      const made = await make();
      if (request !== requests.current) return;
      if (intoEditor) setCode(made.code);
      setShown(made);
      setSelectedFactId(null);
      setError(null);
    } catch (e) {
      if (request === requests.current) setError(messageOf(e));
    }
  }

  const run = async () => {
    if (!engine) return;
    const ran = code;
    const request = ++requests.current;
    setRunningRequest(request);
    setUploadNote(null);
    await show(request, async () => ({ analysis: await engine.analyze(ran, fileName), code: ran }), { intoEditor: false });
    setRunningRequest((current) => (current === request ? null : current));
  };
  // An Example runs as soon as it is picked: its Analysis was made when the site was built. A Run still going is
  // left to finish unseen.
  const pickExample = (id: string) => {
    const request = ++requests.current;
    setFileName(FILE_NAME);
    setUploadNote(null);
    setRunningRequest(null);
    show(request, async () => {
      const example = await loadExample(id);
      return { analysis: example, code: codeOf(example) };
    }, { intoEditor: true });
  };

  // An uploaded file goes into the editor, and waits for Run. Its name is used in the Try it yourself commands.
  const uploadFile = async (file: File) => {
    const text = (await file.text()).replace(/\r\n?/g, '\n').replace(/\n$/, '');
    const name = fileNameFor(file.name);
    setCode(text);
    setFileName(name);
    setUploadNote(
      name === file.name
        ? `Loaded ${name}. Click Run when you’re ready.`
        : `Loaded “${file.name}”. The Try it yourself commands call it ${name}, since a name you type in a terminal is simplest with only letters, digits, _, . and -. Click Run when you’re ready.`,
    );
  };

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
                <span id="program-label" className={`text-[13px] font-semibold text-ink2${codeHidden ? ' narrow:hidden' : ''}`}>Your program</span>
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
                <ExamplePicker shown={shownExample} onPick={pickExample} />
                <ProgramEditor code={code} onChange={setCode} highlight={highlight} labelledBy="program-label" />
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className={buttonClass({ primary: true, size: 'wide' })} disabled={status !== 'ready' || running || tooLong !== null} onClick={run}>
                    Run
                  </button>
                  <button type="button" className={buttonClass()} onClick={() => upload.current?.click()}>
                    Upload a .py file
                  </button>
                  <input
                    ref={upload}
                    type="file"
                    accept=".py,text/x-python"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      // Cleared, so choosing the same file again loads it again.
                      e.target.value = '';
                      if (file) uploadFile(file);
                    }}
                  />
                  <p className="min-w-full text-[14px] text-ink2 empty:hidden" role="status">{STATUS_NOTES[status]}</p>
                </div>
                {tooLong && <p className="text-[14px] text-warn" role="status">{tooLong}</p>}
                {uploadNote && <p className="text-[14px] text-ink2" role="status">{uploadNote}</p>}
                {notStandardLibrary && <p className="text-[14px] text-warn" role="status">{notStandardLibrary}</p>}
                {error && <p className="whitespace-pre-wrap font-mono text-[13px] text-warn" role="alert">{error}</p>}
                <p className="flex flex-wrap gap-x-3 gap-y-1.5 text-[12px] text-ink3 narrow:hidden">
                  <span><kbd className={KBD_CLASSES}>↓</kbd> zoom in</span>
                  <span><kbd className={KBD_CLASSES}>↑</kbd> zoom out</span>
                </p>
              </div>
            </aside>
            <Terminal analysis={analysis} />
            <MachineMap state={mapState({ level, analysis, selection: levelSelection, screen: screen.pixels })} />
          </div>

          <DepthGauge level={level} onGo={go} />

          {/* `stage` is a hook for the tests, not a style. */}
          <main className={`stage min-w-0 px-[clamp(16px,4vw,48px)] pb-10 pt-6 narrow:px-4 narrow:pb-8 narrow:pt-5 ${TINTS[level - 1]}`} data-level={level} aria-busy={running}>
            {outOfDate && (
              <p className="mb-5 rounded-[10px] border border-rule2 bg-surface px-3.5 py-2.5 text-[14px] text-ink2" role="status">
                You’ve changed your program since it ran, so the zoom view shows it as it was. Click Run to zoom into the new version.
              </p>
            )}
            <ZoomView
              level={level}
              analysis={analysis}
              selection={levelSelection}
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
