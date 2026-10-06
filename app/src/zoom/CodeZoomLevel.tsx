import { explainProgram } from '../explain/explain';
import { ExplanationText } from '../explain/ExplanationText';
import { errorSpan } from '../explain/syntaxError';
import type { Analysis } from '../generated/analysis';
import { linesOf, type CharSpan } from './characters';
import { CodeLine } from './CodeLine';
import { SyntaxErrorPanel } from './SyntaxErrorPanel';

/** Zoom level 1: the whole Program, every line, as the learner wrote it, with the code the Selection comes from marked, and any syntax error explained. */
export function CodeZoomLevel({ analysis, selectedChars }: { analysis: Analysis; selectedChars: CharSpan | null }) {
  const error = errorSpan(analysis);
  return (
    <>
      <p className="mb-3.5 text-[14px] text-ink2">
        <ExplanationText spans={explainProgram('level1.caption', analysis).text} />
      </p>
      <ol className="grid gap-0.5 overflow-x-auto p-0.5">
        {linesOf(analysis.program).map((line) => (
          <CodeLine key={line.number} line={line} selected={selectedChars} error={error} />
        ))}
      </ol>
      <p className="mt-4 text-[14px] text-ink2">
        <ExplanationText spans={explainProgram('level1.size', analysis).text} />
      </p>
      <SyntaxErrorPanel analysis={analysis} />
    </>
  );
}
