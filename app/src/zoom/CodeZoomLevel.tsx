import { explainProgram } from '../explain/explain';
import { ExplanationText } from '../explain/ExplanationText';
import type { Analysis } from '../generated/analysis';
import { charLabel, linesOf, splitLine, type CharSpan, type Line } from './characters';

const MARK_CLASSES = 'rounded-[3px] bg-accent-soft text-accent [box-shadow:0_0_0_2px_var(--accent)]';

/** Characters, as the page shows them. The newline is invisible, so it only appears where it is marked. */
const shown = (chars: Line['chars'], marked: boolean) => chars.map(({ char }) => (char !== '\n' ? char : marked ? charLabel(char) : '')).join('');

/** Zoom level 1: the whole Program, every line, as the learner wrote it, with the code the Selection comes from marked. */
export function CodeZoomLevel({ analysis, selectedChars }: { analysis: Analysis; selectedChars: CharSpan | null }) {
  return (
    <>
      <p className="mb-3.5 text-[14px] text-ink2">
        <ExplanationText spans={explainProgram('level1.caption', analysis).text} />
      </p>
      <ol className="grid gap-0.5 overflow-x-auto p-0.5">
        {linesOf(analysis.program).map((line) => {
          const { before, marked, after } = splitLine(line, selectedChars);
          return (
            <li key={line.number} className="flex min-h-[26px] items-baseline gap-3.5">
              <span className="w-6 flex-none text-right font-mono text-[13px] leading-[normal] text-ink3" aria-hidden="true">{line.number}</span>
              <code className="whitespace-pre text-[16px]">
                {shown(before, false)}
                {marked.length > 0 && <mark className={MARK_CLASSES}>{shown(marked, true)}</mark>}
                {shown(after, false)}
              </code>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-[14px] text-ink2">
        <ExplanationText spans={explainProgram('level1.size', analysis).text} />
      </p>
    </>
  );
}
