import { ExplanationText } from '../explain/ExplanationText';
import { syntaxErrorOf } from '../explain/stopped';
import { errorSpan, explainSyntaxError } from '../explain/syntaxError';
import type { Analysis } from '../generated/analysis';
import { linesOf } from './characters';
import { CodeLine } from './CodeLine';

/**
 * What went wrong, for a Program with a syntax error, in plain English: at level 1, and at the zoom level where Python
 * stopped, which also shows the line Python points at, marked. Nothing for any other Program.
 */
export function SyntaxErrorPanel({ analysis, showLine = false }: { analysis: Analysis; showLine?: boolean }) {
  const explanation = explainSyntaxError(analysis);
  if (!explanation) return null;
  const start = syntaxErrorOf(analysis)!.start;
  const line = showLine && start ? linesOf(analysis.program)[start.line - 1] : null;
  return (
    <section className="mt-4 grid max-w-[780px] gap-2 rounded-xl border-[1.5px] border-warn bg-sunk px-4 py-3.5 first:mt-0" aria-labelledby="syntax-error-title">
      <h2 id="syntax-error-title" className="text-[18px] font-semibold leading-[1.3] [text-wrap:balance]">
        <ExplanationText spans={explanation.title!} />
      </h2>
      <p className="-mt-1 font-mono text-[13px] leading-[normal] text-ink3">
        <ExplanationText spans={explanation.term!} />
      </p>
      {line && (
        <ol className="overflow-x-auto rounded-lg bg-surface px-2 py-1.5" aria-label={`Line ${line.number}`}>
          <CodeLine line={line} selected={null} error={errorSpan(analysis)} />
        </ol>
      )}
      <p className="max-w-[65ch] text-[16px] leading-[1.65] text-ink2">
        <ExplanationText spans={explanation.text} />
      </p>
      <p className="max-w-[65ch] text-[14px] leading-[1.6] text-ink2">
        <ExplanationText spans={explanation.more!} />
      </p>
    </section>
  );
}
