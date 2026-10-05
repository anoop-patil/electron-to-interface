import { buttonClass } from '../button';
import type { OutputLine } from '../explain/output';

/** Up to this many lines of output, each has its own button; beyond it, Earlier line and Later line step through them. */
const MOST_LINE_BUTTONS = 12;

export const SELECTED_CLASSES = 'border-accent bg-accent-soft [box-shadow:0_0_0_3px_var(--accent-soft)]';

/** A line as its button shows it: its text, or a word for an empty one, and its door, if it isn't door 1. */
function LineName({ line }: { line: OutputLine }) {
  return (
    <>
      {line.text ? <span className="overflow-hidden text-ellipsis whitespace-pre font-mono">{line.text}</span> : <i className="text-ink2">an empty line</i>}
      {line.door === 2 && <small className="whitespace-nowrap font-sans text-[11px] font-semibold text-ink2">door 2</small>}
    </>
  );
}

/** Which line of output to follow, at levels 8 and 9: a button for each, or Earlier and Later for a long run of them. */
export function LinePicker({ lines, line, onPick }: { lines: OutputLine[]; line: OutputLine; onPick(line: OutputLine): void }) {
  const at = lines.indexOf(line);
  if (lines.length > MOST_LINE_BUTTONS) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink2" role="group" aria-label="Which line of output">
        <button type="button" className={buttonClass({ size: 'sm' })} disabled={at === 0} onClick={() => onPick(lines[at - 1])}>
          Earlier line
        </button>
        <span className="font-mono text-[12px]">
          {at + 1} of {lines.length}
        </span>
        <button type="button" className={buttonClass({ size: 'sm' })} disabled={at === lines.length - 1} onClick={() => onPick(lines[at + 1])}>
          Later line
        </button>
        <span className="flex min-w-0 max-w-full items-baseline gap-2 rounded-full border-[1.5px] border-accent bg-accent-soft px-3.5 py-1.5 text-[14px] text-ink">
          <LineName line={line} />
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which line of output">
      {lines.map((other) => (
        <button
          key={other.id}
          type="button"
          className={`flex min-h-10 min-w-0 max-w-full cursor-pointer items-baseline gap-2 rounded-full border-[1.5px] px-3.5 py-2 text-[14px] ${other === line ? `${SELECTED_CLASSES} text-ink` : 'border-rule2 bg-surface text-ink2 hover:bg-sunk'}`}
          aria-pressed={other === line}
          onClick={() => onPick(other)}
        >
          <LineName line={other} />
        </button>
      ))}
    </div>
  );
}
