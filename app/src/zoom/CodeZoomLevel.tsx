import { explainProgram } from '../explain/explain';
import { ExplanationText } from '../explain/ExplanationText';
import type { Analysis } from '../generated/analysis';
import { charLabel, linesOf } from './characters';

const MARK_CLASSES = 'rounded-[3px] bg-accent-soft text-accent [box-shadow:0_0_0_2px_var(--accent)]';

/** Zoom level 1: the whole Program, every line, as the learner wrote it. */
export function CodeZoomLevel({ analysis, selectedChar }: { analysis: Analysis; selectedChar: number | null }) {
  const lines = linesOf(analysis.program);
  return (
    <>
      <p className="mb-3.5 text-[14px] text-ink2">
        <ExplanationText spans={explainProgram('level1.caption', analysis).text} />
      </p>
      <ol className="grid gap-0.5 overflow-x-auto p-0.5">
        {lines.map((line) => (
          <li key={line.number} className="flex min-h-[26px] items-baseline gap-3.5">
            <span className="w-6 flex-none text-right font-mono text-[13px] leading-[normal] text-ink3" aria-hidden="true">{line.number}</span>
            <code className="whitespace-pre text-[16px]">
              {line.chars.map(({ index, char }) => {
                // The newline is invisible, so it only appears when its byte is selected.
                if (index === selectedChar) return <mark key={index} className={MARK_CLASSES}>{char === '\n' ? charLabel(char) : char}</mark>;
                return char === '\n' ? null : char;
              })}
            </code>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[14px] text-ink2">
        <ExplanationText spans={explainProgram('level1.size', analysis).text} />
      </p>
    </>
  );
}
