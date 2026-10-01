import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { buttonClass } from '../button';
import { panelLabel } from '../concepts/concepts';
import { HonestyChip } from '../concepts/HonestyChip';
import { codeName, framesAfter, objectsIn, objectsSeen, runsOfStep, stepOfRun, stepsOf, type FrameAfter, type ShownLabel, type StepInCode } from '../explain/bytecode';
import { explainProgram, type Span } from '../explain/explain';
import { ExplanationText } from '../explain/ExplanationText';
import { explainForStep, stepFacts, stepTitle, type StepSelection } from '../explain/steps';
import type { Analysis, HonestyLabels } from '../generated/analysis';

/** How long Play shows each step run, in milliseconds: longer for anyone who asks their computer for less motion. */
const PLAY_DELAY = { normal: 950, reduced: 1300 };

/** At most this many runs of a step get a button each; a step that ran more is stepped through one run at a time. */
const MOST_RUN_BUTTONS = 20;

const plain = (spans: Span[]) => spans.map((span) => span.text).join('');
/** Your program, or a lambda, starts a heading with a capital; a function's name stays as the Program writes it. */
const capitalized = (text: string) => (/^(your|a) /.test(text) ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/** A heading from a Template, which may start with a code object's name. */
const capitalizedTitle = (spans: Span[]) => spans.map((span, at) => (at === 0 ? { ...span, text: capitalized(span.text) } : span));

/** What level 5 needs: the Analysis, the selected step and run, and what to do when the learner picks another. */
interface LevelProps {
  analysis: Analysis;
  selected: StepSelection;
  /** Selects a step run, run-N, or a step that never ran, bc-N. */
  onSelect(factId: string): void;
  onGo(level: number): void;
}

/** A panel of the right-hand column: a heading, its Honesty label, a sentence on what it shows, then its contents. */
function Panel({ title, label, text, children }: { title: Span[]; label: keyof HonestyLabels['panels']; text?: Span[]; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-2 rounded-xl border border-rule bg-sunk px-3.5 py-3" aria-label={plain(title)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink2">
          <ExplanationText spans={title} />
        </h3>
        <HonestyChip label={panelLabel(label)} size="panel" />
      </div>
      {text && (
        <p className="text-[13px] leading-[1.55] text-ink2">
          <ExplanationText spans={text} />
        </p>
      )}
      {children}
    </section>
  );
}

/** The selection's id: the step run, or the step itself if it never ran. */
const selectionOf = (analysis: Analysis, step: StepInCode) => {
  const [first] = runsOfStep(analysis, step.step);
  return first === undefined ? step.step.id : analysis.runs[first].id;
};

/** Each code object's steps, under its name: the step's number, its plain name, its opname and how often it ran. */
function StepLists({ analysis, selected, onSelect }: LevelProps) {
  const running = selected.run === null ? null : stepOfRun(analysis, analysis.runs[selected.run]).step.id;
  return (
    <div className="grid min-w-0 content-start gap-4">
      {analysis.bytecode.map((code, at) => (
        <section key={at} className="grid gap-1" aria-label={`${capitalized(codeName(code))}’s steps`}>
          <h3 className="flex justify-between gap-2 text-[12px] font-semibold text-ink3">
            <span>{capitalized(codeName(code))}</span>
            <span className="font-normal">{code.size} bytes of bytecode</span>
          </h3>
          <ol className="grid gap-1">
            {stepsOf(analysis, at).map((step) => {
                const runs = runsOfStep(analysis, step.step).length;
                const isSelected = step.step.id === selected.step.step.id;
                return (
                  <li key={step.step.id}>
                    <button
                      type="button"
                      className={`grid min-h-10 w-full cursor-pointer grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg border-[1.5px] px-2.5 py-1 text-left ${isSelected ? 'border-accent bg-accent-soft' : `border-transparent hover:bg-sunk ${running === step.step.id ? 'bg-sunk' : ''}`}`}
                      data-fact-id={step.step.id}
                      aria-pressed={isSelected}
                      onClick={() => onSelect(selectionOf(analysis, step))}
                    >
                      <span className={`font-mono text-[12px] ${isSelected ? 'text-ink2' : 'text-ink3'}`}>{step.number}</span>
                      <span className={`text-[15px] ${runs === 0 ? 'text-ink3 line-through decoration-rule2' : isSelected ? 'font-semibold text-ink' : 'text-ink'}`}>
                        <ExplanationText spans={stepTitle(analysis, step)} />
                      </span>
                      <span className="flex flex-col items-end gap-px">
                        <span className={`whitespace-nowrap font-mono text-[11px] ${isSelected ? 'text-ink2' : 'text-ink3'}`}>
                          {step.step.opname}
                          {step.step.arg !== null && ` ${step.step.arg}`}
                        </span>
                        <span className={`whitespace-nowrap text-[11px] ${isSelected ? 'text-ink2' : 'text-ink3'}`}>{stepFacts(analysis, step, null).runs}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** Which run of the selected step is shown, with a button for each run, and its place among all the step runs. */
function RunBar({ analysis, selected, onSelect }: LevelProps) {
  const runs = runsOfStep(analysis, selected.step.step);
  if (selected.run === null) {
    return (
      <p className="rounded-[10px] border border-rule bg-surface px-3 py-2.5 text-[13px] text-ink2">
        <ExplanationText spans={explainForStep('level5.neverRan', analysis, selected.step, null).text} />
      </p>
    );
  }
  const at = runs.indexOf(selected.run);
  const many = runs.length > 1;
  const pick = (run: number) => onSelect(analysis.runs[run].id);
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-[10px] border border-rule bg-surface px-3 py-2.5 text-[13px] text-ink2">
      <span>
        <ExplanationText spans={explainForStep(many ? 'level5.ranMore' : 'level5.ranOnce', analysis, selected.step, selected.run).text} />
      </span>
      {many && runs.length <= MOST_RUN_BUTTONS && (
        <span className="flex flex-wrap gap-1" role="group" aria-label="Which run of this step">
          {runs.map((run, index) => (
            <button
              key={run}
              type="button"
              className={`min-h-8 min-w-9 cursor-pointer rounded-full border-[1.5px] px-2.5 text-[12px] font-medium ${run === selected.run ? 'border-accent bg-accent text-on-accent' : 'border-rule2 bg-surface text-ink2 hover:bg-sunk'}`}
              aria-pressed={run === selected.run}
              onClick={() => pick(run)}
            >
              {index + 1}
            </button>
          ))}
        </span>
      )}
      {many && runs.length > MOST_RUN_BUTTONS && (
        <span className="flex items-center gap-1.5" role="group" aria-label="Which run of this step">
          <button type="button" className={buttonClass({ size: 'sm' })} disabled={at === 0} onClick={() => pick(runs[at - 1])}>
            Earlier run
          </button>
          <span className="font-mono text-[12px]">
            {at + 1} of {runs.length}
          </span>
          <button type="button" className={buttonClass({ size: 'sm' })} disabled={at === runs.length - 1} onClick={() => pick(runs[at + 1])}>
            Later run
          </button>
        </span>
      )}
      <span>
        <ExplanationText spans={explainForStep('level5.overall', analysis, selected.step, selected.run).text} />
      </span>
    </div>
  );
}

/**
 * Every step run, in order, as a strip of small buttons: squares for the file's own steps, circles for the steps of
 * the code inside it. Only the selected run's button is in the tab order; the arrow keys move along the strip.
 */
function Strip({ analysis, selected, onSelect }: LevelProps) {
  const current = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current) current.current?.focus();
    moved.current = false;
  }, [selected.run]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (selected.run === null || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    const to = selected.run + (event.key === 'ArrowRight' ? 1 : -1);
    if (to < 0 || to >= analysis.runs.length) return;
    event.preventDefault();
    moved.current = true;
    onSelect(analysis.runs[to].id);
  };
  return (
    <div className="flex flex-wrap gap-[3px]" role="group" aria-label="Every step that ran, in order" onKeyDown={onKeyDown}>
      {analysis.runs.map((run, at) => {
        const step = stepOfRun(analysis, run);
        const isCurrent = at === selected.run;
        const done = selected.run !== null && at < selected.run;
        return (
          <button
            key={run.id}
            ref={isCurrent ? current : undefined}
            type="button"
            className={`h-3.5 w-3.5 cursor-pointer border p-0 ${run.code === 0 ? 'rounded-[4px]' : 'rounded-full'} ${isCurrent ? 'border-accent bg-accent' : done ? 'border-ink3 bg-ink3' : 'border-rule2 bg-surface'}`}
            data-fact-id={run.id}
            tabIndex={isCurrent || (selected.run === null && at === 0) ? 0 : -1}
            aria-current={isCurrent ? 'step' : undefined}
            aria-label={`Step run ${at + 1}: ${plain(stepTitle(analysis, step))}`}
            title={`${at + 1}: ${plain(stepTitle(analysis, step))}`}
            onClick={() => onSelect(run.id)}
          />
        );
      })}
    </div>
  );
}

/** A plate or a variable's label: the object it points to, as Python's repr shows it, or what made it. */
function LabelText({ analysis, label }: { analysis: Analysis; label: ShownLabel }) {
  if (label.empty) return <span className="text-ink3">empty</span>;
  if (label.object) return <span className="font-mono">{label.object.repr}</span>;
  const made = stepOfRun(analysis, analysis.runs[label.madeBy]);
  return (
    <span className="text-ink2" title={plain(stepTitle(analysis, made))}>
      <ExplanationText spans={explainForStep('level5.answer', analysis, made, label.madeBy).text} />
    </span>
  );
}

/** One frame's plates, the top one first, and its variables. */
function FrameBox({ analysis, frame, above, unsure }: { analysis: Analysis; frame: FrameAfter; above: FrameAfter | undefined; unsure: boolean }) {
  const status = above ? explainForStep('level5.frameWaiting', analysis, stepsOf(analysis, above.code)[0], null) : null;
  const running = explainForStep('level5.frameRunning', analysis, stepsOf(analysis, frame.code)[0], null);
  const heading = { ...running, title: capitalizedTitle(running.title!) };
  return (
    <section className={`grid gap-2 rounded-xl border-[1.5px] bg-surface p-2.5 ${above ? 'border-rule2' : 'border-accent'}`} aria-label={plain(heading.title!)}>
      <h4 className="flex justify-between gap-2 text-[12px] font-semibold text-ink2">
        <span>
          <ExplanationText spans={heading.title!} />
        </span>
        <span className="font-normal text-ink3">
          <ExplanationText spans={(status ?? heading).text} />
        </span>
      </h4>
      {unsure ? (
        <p className="text-[13px] text-ink3">
          <ExplanationText spans={explainProgram('level5.platesUnsure', analysis).text} />
        </p>
      ) : (
        <ol className="flex flex-col-reverse gap-[5px]" aria-label="Plates, the top one last">
          {frame.plates.length === 0 && <li className="text-[13px] text-ink3">No plates</li>}
          {frame.plates.map((plate, at) => (
            <li
              key={at}
              className={`relative flex min-h-[38px] items-center justify-center rounded-full border-[1.5px] px-10 text-center text-[13px] [overflow-wrap:anywhere] ${plate.empty ? 'border-dashed border-rule2' : 'border-ink3'}`}
            >
              <LabelText analysis={analysis} label={plate} />
              {at === frame.plates.length - 1 && <span className="absolute right-3 text-[11px] text-ink3">top</span>}
            </li>
          ))}
        </ol>
      )}
      {frame.variables.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Variables">
          {frame.variables.map(({ name, value }) => (
            <li key={name} className="rounded-lg border border-rule px-2 py-1 text-[13px] [overflow-wrap:anywhere]">
              <span className="font-mono text-ink">{name}</span> → <LabelText analysis={analysis} label={value} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The plates of every frame after the selected step run: the running frame on top, each caller waiting under the frame it called. */
function Plates({ analysis, selected }: LevelProps) {
  if (selected.run === null) return null;
  const frames = framesAfter(analysis, selected.run);
  const unsure = new Set(analysis.runs.slice(0, selected.run + 2).filter((run) => run.platesUnsure).map((run) => run.frame));
  const panel = explainProgram('level5.plates', analysis);
  return (
    <Panel title={panel.title!} label="plates" text={panel.text}>
      {frames.length === 0 ? (
        <p className="text-[13px] text-ink3">
          <ExplanationText spans={explainProgram('level5.noFrames', analysis).text} />
        </p>
      ) : (
        <div className="grid gap-2">
          {[...frames].reverse().map((frame, at, shown) => (
            <FrameBox key={frame.frame} analysis={analysis} frame={frame} above={shown[at - 1]} unsure={unsure.has(frame.frame)} />
          ))}
        </div>
      )}
    </Panel>
  );
}

/** One list on the recipe card: each entry with its number, the one the selected step uses marked. */
function RecipeList({ title, entries, used }: { title: string; entries: string[]; used: (entry: string, at: number) => boolean }) {
  return (
    <div className="grid content-start gap-1">
      <h4 className="text-[12px] font-semibold text-ink3">{title}</h4>
      {entries.length === 0 && <span className="text-[13px] text-ink3">none</span>}
      <ol className="grid gap-1" aria-label={title}>
        {entries.map((entry, at) => (
          <li
            key={at}
            className={`flex gap-2 rounded-lg border-[1.5px] px-2 py-1 font-mono text-[13px] [overflow-wrap:anywhere] ${used(entry, at) ? 'border-accent bg-accent-soft' : 'border-rule bg-surface'}`}
          >
            <i className="not-italic text-ink3">{at}</i>
            {entry}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The steps that look up or store one of a code object's names, and those whose argument holds its place doubled. */
const NAME_STEPS = /^(LOAD_NAME|STORE_NAME|DELETE_NAME|LOAD_GLOBAL|STORE_GLOBAL|DELETE_GLOBAL|LOAD_ATTR|STORE_ATTR|DELETE_ATTR|IMPORT_NAME|IMPORT_FROM)$/;
const DOUBLED = new Set(['LOAD_GLOBAL', 'LOAD_ATTR']);
/** The steps that handle two of a code object's own variables, whose argument holds both places, 4 bits each. */
const PAIRS = new Set(['LOAD_FAST_LOAD_FAST', 'LOAD_FAST_BORROW_LOAD_FAST_BORROW', 'STORE_FAST_STORE_FAST', 'STORE_FAST_LOAD_FAST']);

/** Which entries of its code object's recipe card a step uses, by their places in each list, as its argument says. */
function usedBy({ step }: StepInCode) {
  const arg = step.arg ?? 0;
  return {
    names: NAME_STEPS.test(step.opname) ? [DOUBLED.has(step.opname) ? arg >> 1 : arg] : [],
    varnames: step.opname.includes('_FAST') ? (PAIRS.has(step.opname) ? [arg >> 4, arg & 15] : [arg]) : [],
    consts: step.opname === 'LOAD_CONST' ? [arg] : [],
    shared: step.opname.endsWith('_DEREF') ? step.argrepr : '',
  };
}

/** The selected step's code object, as the compiler wrote it down: its names, fixed values and variables. */
function RecipeCard({ analysis, selected }: LevelProps) {
  const code = analysis.bytecode[selected.step.code];
  const used = usedBy(selected.step);
  const panel = explainForStep('level5.recipe', analysis, selected.step, null);
  const consts = code.consts.map((value) => ('code' in value ? `${analysis.bytecode[value.code].qualname}’s steps` : value.value));
  const shared = [...code.cellvars, ...code.freevars];
  return (
    <Panel title={capitalizedTitle(panel.title!)} label="recipeCard" text={panel.text}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 narrow:grid-cols-[minmax(0,1fr)]">
        <div className="grid content-start gap-2">
          <RecipeList title="Names" entries={code.names} used={(_, at) => used.names.includes(at)} />
          {code.varnames.length > 0 && <RecipeList title="Its own variables" entries={code.varnames} used={(_, at) => used.varnames.includes(at)} />}
          {shared.length > 0 && <RecipeList title="Variables shared with the code around or inside it" entries={shared} used={(entry) => entry === used.shared} />}
        </div>
        <RecipeList title="Fixed values" entries={consts} used={(_, at) => used.consts.includes(at)} />
      </div>
    </Panel>
  );
}

/** Every object the plates and variables have pointed to so far, each with its type and size, marking those still in use after the selected step run. */
function Objects({ analysis, selected }: LevelProps) {
  if (selected.run === null) return null;
  const inUse = objectsIn(framesAfter(analysis, selected.run));
  const seen = objectsSeen(analysis, selected.run);
  const panel = explainProgram('level5.objects', analysis);
  return (
    <Panel title={panel.title!} label="objects" text={panel.text}>
      {seen.length === 0 && <p className="text-[13px] text-ink3">None</p>}
      <ul className="grid gap-1.5">
        {seen.map((object) => (
          <li
            key={object.id}
            className={`flex flex-wrap items-baseline justify-between gap-x-2 rounded-[10px] border-[1.5px] bg-surface px-2.5 py-1.5 text-[14px] ${inUse.has(object.id) ? 'border-accent' : 'border-rule'}`}
          >
            <span className="min-w-0 font-mono [overflow-wrap:anywhere]">{object.repr}</span>
            <span className="font-mono text-[12px] text-ink3 [overflow-wrap:anywhere]">
              {object.type}
              {object.size !== undefined && ` · ${object.size} bytes`}
              {!inUse.has(object.id) && ' · not in use'}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Next, Back and Play, which follow the order the steps ran in. After the last step run, Next zooms in. */
function Controls({ analysis, selected, onSelect, onGo }: LevelProps) {
  const [playing, setPlaying] = useState(false);
  const last = analysis.runs.length - 1;
  const at = selected.run;
  const go = (run: number) => onSelect(analysis.runs[run].id);

  useEffect(() => {
    if (!playing) return;
    if (at === null || at >= last) {
      setPlaying(false);
      return;
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => go(at + 1), reduced ? PLAY_DELAY.reduced : PLAY_DELAY.normal);
    return () => clearTimeout(timer);
  });

  if (last < 0) return null;
  const play = () => {
    if (playing) return setPlaying(false);
    if (at === null || at >= last) go(0);
    setPlaying(true);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={buttonClass({ size: 'sm' })} disabled={at === null || at === 0} onClick={() => at !== null && go(at - 1)}>
        Back a step
      </button>
      {at === last ? (
        <button type="button" className={buttonClass({ primary: true, size: 'sm' })} onClick={() => onGo(6)}>
          All {analysis.runs.length} done. Next: the interpreter
        </button>
      ) : (
        <button type="button" className={buttonClass({ primary: true, size: 'sm' })} onClick={() => go(at === null ? 0 : at + 1)}>
          Next step
        </button>
      )}
      <button type="button" className={buttonClass({ size: 'sm' })} aria-pressed={playing} onClick={play}>
        {playing ? 'Stop' : at === last ? 'Play again' : `Play all ${analysis.runs.length}`}
      </button>
    </div>
  );
}

/**
 * Zoom level 5: each code object's steps and how often they ran, the strip of every step run in order, and, after the
 * selected run, the plates of every frame, the recipe card and the objects. Next, Back and Play follow the run.
 */
export function BytecodeZoomLevel(props: LevelProps) {
  const { analysis } = props;
  const strip = explainProgram('level5.strip', analysis);
  return (
    <div className="grid gap-4">
      <p className="text-[14px] text-ink2">
        <ExplanationText spans={explainProgram('level5.caption', analysis).text} />
      </p>
      <div className="grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-5 narrow:grid-cols-[minmax(0,1fr)]">
        <StepLists {...props} />
        <div className="grid min-w-0 content-start gap-3">
          <RunBar {...props} />
          <Controls {...props} />
          <Panel title={strip.title!} label="stepRuns" text={strip.text}>
            <Strip {...props} />
            {analysis.runsCutShort && (
              <p className="text-[13px] text-ink2">
                <ExplanationText spans={explainProgram('level5.cutShort', analysis).text} />
              </p>
            )}
          </Panel>
          <Plates {...props} />
          <RecipeCard {...props} />
          <Objects {...props} />
        </div>
      </div>
      <p className="max-w-[80ch] text-[13px] leading-[1.6] text-ink3">
        <ExplanationText spans={explainProgram('level5.note', analysis).text} />
      </p>
    </div>
  );
}
