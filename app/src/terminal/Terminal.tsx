import { panelLabel } from '../concepts/concepts';
import { HonestyChip } from '../concepts/HonestyChip';
import { counted, explainProgram } from '../explain/explain';
import { ExplanationText } from '../explain/ExplanationText';
import type { Analysis } from '../generated/analysis';

const NOTE_CLASSES = 'text-[13px] leading-[1.5] text-ink3';

/** How many lines the text takes in a terminal: each newline ends one, and text after the last starts another. */
const linesIn = (text: string) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

/**
 * The Terminal: what the Program printed when it ran, as a terminal shows it, beside every zoom level.
 * What it wrote to stderr, such as the traceback of an error, follows what it wrote to stdout.
 */
export function Terminal({ analysis }: { analysis: Analysis | null }) {
  const output = analysis ? analysis.stdout + analysis.stderr : '';

  let body;
  if (!analysis) body = <p className={NOTE_CLASSES}>Nothing yet. Click Run to run your program.</p>;
  else if (!output) body = <p className={NOTE_CLASSES}><ExplanationText spans={explainProgram('terminal.nothingPrinted', analysis).text} /></p>;
  else
    body = (
      <pre className="m-0 max-h-60 overflow-auto whitespace-pre-wrap rounded-[10px] border border-rule2 bg-term-bg px-3 py-2.5 font-mono text-[12.5px] leading-[1.55] text-term-fg [overflow-wrap:anywhere]">
        {analysis.stdout}
        {analysis.stderr && <span className="text-term-err">{analysis.stderr}</span>}
      </pre>
    );

  return (
    <section className="grid min-w-0 gap-2 px-[18px] pb-[22px] narrow:border-b narrow:border-rule narrow:px-4 narrow:py-3" aria-labelledby="terminal-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="terminal-title" className="text-[13px] font-semibold text-ink2">Terminal</h2>
        {analysis && (
          <div className="flex items-center gap-2">
            {output && <span className="text-[12px] text-ink3">{counted(linesIn(output), 'line', 'lines')}</span>}
            {/* Python in the browser recorded this from the learner's own Program. */}
            <HonestyChip label={panelLabel('terminal')} size="panel" />
          </div>
        )}
      </div>
      {body}
      {analysis && (analysis.runsCutShort || analysis.eventsCutShort) && (
        <p className={NOTE_CLASSES}><ExplanationText spans={explainProgram('terminal.cutShort', analysis).text} /></p>
      )}
    </section>
  );
}
