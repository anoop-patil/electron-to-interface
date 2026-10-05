import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { panelLabel } from '../concepts/concepts';
import { HonestyChip } from '../concepts/HonestyChip';
import { ExplanationText } from '../explain/ExplanationText';
import type { TryItExplanation } from '../explain/tryIt';

export type TryItTab = 'does' | 'see' | 'read';

const TABS: { id: TryItTab; name: string }[] = [
  { id: 'does', name: 'What it does' },
  { id: 'see', name: 'What you’ll see' },
  { id: 'read', name: 'How to read it' },
];

const TEXT_CLASSES = 'max-w-[70ch] text-[14px] leading-[1.6] text-ink2';
const CODE_CHIP_CLASSES = 'rounded-[5px] border border-rule bg-sunk px-1.5 py-px font-mono text-[12.5px] text-ink [overflow-wrap:anywhere]';
const TAB_CLASSES =
  '-mb-px min-h-11 cursor-pointer whitespace-nowrap border-b-2 border-transparent px-3.5 py-2.5 text-[14px] font-medium text-ink3 hover:text-ink aria-selected:border-accent aria-selected:font-semibold aria-selected:text-ink';

/** The command, with a button that copies it. Where the clipboard is blocked, it selects the command instead. */
function CommandBox({ command }: { command: string }) {
  const [label, setLabel] = useState<'Copy' | 'Copied' | 'Selected'>('Copy');
  const code = useRef<HTMLElement>(null);
  const timer = useRef<number>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const show = (done: 'Copied' | 'Selected') => {
    setLabel(done);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLabel('Copy'), 1400);
  };
  const select = () => {
    getSelection()?.selectAllChildren(code.current!);
    show('Selected');
  };
  const copy = () => {
    if (!navigator.clipboard) return select();
    navigator.clipboard.writeText(command).then(() => show('Copied'), select);
  };

  return (
    <div className="flex items-stretch overflow-hidden rounded-[10px] border border-rule bg-surface">
      <code ref={code} className="min-w-0 flex-1 whitespace-pre-wrap px-3.5 py-2.5 text-[13.5px] [overflow-wrap:anywhere]">{command}</code>
      <button type="button" className="min-h-11 cursor-pointer border-l border-rule bg-sunk px-3.5 text-[13px] hover:text-accent" onClick={copy}>
        {label}
      </button>
    </div>
  );
}

/** The output tab: what the command printed, run on the Program by the browser's Python, so labeled Observed. */
function Output({ tryIt }: { tryIt: TryItExplanation }) {
  return (
    <div className="grid gap-2">
      {tryIt.output ? (
        <pre className="m-0 whitespace-pre-wrap rounded-[10px] border border-rule2 bg-term-bg px-3.5 py-3 font-mono text-[12.5px] leading-[1.55] text-term-fg [overflow-wrap:anywhere]">
          {tryIt.output}
        </pre>
      ) : (
        <p className={TEXT_CLASSES}>
          <ExplanationText spans={tryIt.nothingPrinted} />
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <HonestyChip label={panelLabel('tryItOutput')} size="panel" />
        <p className="text-[13px] text-ink3">
          <ExplanationText spans={tryIt.observed} />
        </p>
      </div>
      {tryIt.sample && <Sample sample={tryIt.sample} />}
    </div>
  );
}

/** A command the browser can't run, such as native timing: its output, captured for an Example on the test machine. */
function Sample({ sample }: { sample: NonNullable<TryItExplanation['sample']> }) {
  return (
    <section className="mt-2 grid gap-2" aria-label="A sample from our test machine">
      <code className="justify-self-start rounded-md border border-rule bg-sunk px-2 py-0.5 text-[12.5px] text-ink2 [overflow-wrap:anywhere]">{sample.command}</code>
      <pre className="m-0 whitespace-pre-wrap rounded-[10px] border border-rule2 bg-term-bg px-3.5 py-3 font-mono text-[12.5px] leading-[1.55] text-term-fg [overflow-wrap:anywhere]">
        {sample.output}
      </pre>
      <div className="flex flex-wrap items-center gap-2">
        <HonestyChip label={panelLabel('tryItSample')} size="panel" />
        <p className="text-[13px] text-ink3">
          <ExplanationText spans={sample.caption} />
        </p>
      </div>
    </section>
  );
}

/** The reading tab: the rows of levels 2 and 3, then the notes. */
function HowToRead({ tryIt }: { tryIt: TryItExplanation }) {
  return (
    <div className="grid gap-2.5">
      {tryIt.rows.length > 0 && (
        <table className="w-full border-collapse text-[14px]">
          <tbody>
            {tryIt.rows.map((row, index) => (
              <tr key={index} className="border-b border-rule last:border-b-0">
                <td className="w-[38%] px-2.5 py-2 align-top font-mono text-[12.5px] leading-[1.5] text-ink whitespace-pre-wrap [overflow-wrap:anywhere]">{row.printed}</td>
                <td className="px-2.5 py-2 align-top leading-[1.5] text-ink2">
                  <ExplanationText spans={row.text} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ul className="grid max-w-[72ch] list-disc gap-1.5 pl-[18px] text-[14px] leading-[1.6] text-ink2">
        {tryIt.read.map((note, index) => (
          <li key={index}>
            <ExplanationText spans={note} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Try it yourself: a real command the learner can run on their own computer, collapsed by default to one row that shows it.
 * Whether it is open, and which tab shows, belongs to the caller, so both stay the same from one zoom level to the next.
 */
export function TryItYourself({
  tryIt,
  open,
  onToggle,
  tab,
  onTab,
}: {
  tryIt: TryItExplanation;
  open: boolean;
  onToggle(open: boolean): void;
  tab: TryItTab;
  onTab(tab: TryItTab): void;
}) {
  const tabs = useRef<HTMLDivElement>(null);

  // Left and right move between the tabs, wrapping round; Home and End go to the first and last.
  const onKeyDown = (event: KeyboardEvent) => {
    const at = TABS.findIndex(({ id }) => id === tab);
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1 + TABS.length, Home: 0, End: TABS.length - 1 }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const next = TABS[to % TABS.length].id;
    onTab(next);
    tabs.current?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus();
  };

  return (
    <details className="group max-w-[860px] rounded-xl border border-rule bg-surface" open={open} onToggle={(event) => onToggle(event.currentTarget.open)}>
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-2.5 px-4 py-2 text-[14px] font-semibold before:w-2.5 before:flex-none before:text-ink3 before:content-['▸'] group-open:before:rotate-90 [&::-webkit-details-marker]:hidden">
        Try it yourself
        <code className="min-w-0 rounded-md border border-rule bg-sunk px-2 py-0.5 text-[13px] font-normal text-ink2 [overflow-wrap:anywhere]">{tryIt.command}</code>
      </summary>
      <div className="grid gap-3 px-4 pb-4">
        <p className={TEXT_CLASSES}>
          <ExplanationText spans={tryIt.intro} />
        </p>
        <CommandBox command={tryIt.command} />
        {tryIt.links.length > 0 && (
          <div className={TEXT_CLASSES}>
            <p>
              <ExplanationText spans={tryIt.linksIntro} />
            </p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {tryIt.links.map((link) => (
                <li key={link.href + link.text}>
                  <a className="text-accent underline underline-offset-2" href={link.href} target="_blank" rel="noopener noreferrer">
                    {link.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-1 overflow-x-auto border-b border-rule" role="tablist" aria-label="About this command" ref={tabs} onKeyDown={onKeyDown}>
          {TABS.map(({ id, name }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`try-tab-${id}`}
              data-tab={id}
              aria-controls="try-panel"
              aria-selected={tab === id}
              tabIndex={tab === id ? 0 : -1}
              className={TAB_CLASSES}
              onClick={() => onTab(id)}
            >
              {name}
            </button>
          ))}
        </div>
        <div id="try-panel" role="tabpanel" aria-labelledby={`try-tab-${tab}`} className="pt-1">
          {tab === 'does' && (
            <dl className="grid gap-2">
              {tryIt.parts.map((part) => (
                <div key={part.code} className="grid gap-0.5">
                  <dt>
                    <code className={CODE_CHIP_CLASSES}>{part.code}</code>
                  </dt>
                  <dd className="text-[13.5px] text-ink2">
                    <ExplanationText spans={part.text} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {tab === 'see' && <Output tryIt={tryIt} />}
          {tab === 'read' && <HowToRead tryIt={tryIt} />}
        </div>
      </div>
    </details>
  );
}
