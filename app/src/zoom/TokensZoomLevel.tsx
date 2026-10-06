import { explainProgram, indentOf } from '../explain/explain';
import { ExplanationText } from '../explain/ExplanationText';
import { stoppedAt } from '../explain/stopped';
import type { Analysis, TokenFact } from '../generated/analysis';
import { SyntaxErrorPanel } from './SyntaxErrorPanel';

const CHIP_CLASSES =
  'flex min-h-[52px] cursor-pointer flex-col items-start justify-center gap-px whitespace-pre rounded-lg border-[1.5px] px-2.5 py-1.5 text-left font-mono text-[17px] leading-[normal] text-ink';
// Each kind of token has its own color: names, punctuation, text, the tokens that mark line ends and indentation, and the rest.
const KIND_STYLES = {
  name: { chip: 'border-tok-name', type: 'text-tok-name' },
  op: { chip: 'border-tok-op', type: 'text-tok-op' },
  string: { chip: 'border-tok-str', type: 'text-tok-str' },
  mark: { chip: 'border-dashed border-tok-mark font-sans text-[13px] text-ink3', type: 'text-tok-mark' },
  other: { chip: 'border-rule2', type: 'text-ink3' },
};
// A plain box-shadow, as on the bytes at level 2.
const SELECTED_CLASSES = 'border-solid border-accent bg-accent-soft [box-shadow:0_0_0_3px_var(--accent-soft)]';

const MARKS = new Set(['NEWLINE', 'NL', 'INDENT', 'DEDENT', 'ENDMARKER']);

function kindOf(token: TokenFact): keyof typeof KIND_STYLES {
  if (MARKS.has(token.type)) return 'mark';
  if (token.type === 'NAME') return 'name';
  if (token.type === 'OP') return 'op';
  if (/^(STRING|[FT]STRING_(START|MIDDLE|END))$/.test(token.type)) return 'string';
  return 'other';
}

/** How a chip shows its token, and how it is read out. The tokens that mark line ends and indentation are drawn in words. */
function labelOf(token: TokenFact): { shown: string; spoken: string } {
  switch (token.type) {
    case 'NEWLINE':
    case 'NL':
      return { shown: '↵', spoken: 'a newline' };
    case 'INDENT':
      return { shown: indentOf(token.text), spoken: indentOf(token.text) };
    case 'DEDENT':
      return { shown: 'block ends', spoken: 'block ends' };
    case 'ENDMARKER':
      return { shown: 'end', spoken: 'end of the file' };
    default:
      return { shown: token.text, spoken: token.text };
  }
}

interface Row {
  first: number;
  last: number;
  tokens: TokenFact[];
}

/** The rows of chips: one for each line, except that a token over several lines, such as a triple-quoted string, takes its lines into one row. */
function rowsOf(tokens: TokenFact[]): Row[] {
  const rows: Row[] = [];
  for (const token of tokens) {
    const row = rows.at(-1);
    if (row && token.start.line <= row.last) {
      row.tokens.push(token);
      row.last = Math.max(row.last, token.end.line);
    } else rows.push({ first: token.start.line, last: Math.max(token.start.line, token.end.line), tokens: [token] });
  }
  return rows;
}

/** Zoom level 3: the Program's tokens, as chips, one row for each line, and the syntax error, if Python stopped at it here. */
export function TokensZoomLevel({
  analysis,
  selectedToken,
  onSelect,
}: {
  analysis: Analysis;
  selectedToken: TokenFact | null;
  onSelect(token: TokenFact): void;
}) {
  return (
    <>
      <p className="mb-3.5 text-[14px] text-ink2">
        <ExplanationText spans={explainProgram('level3.caption', analysis).text} />
      </p>
      <div className="grid gap-2.5 overflow-x-auto p-0.5">
        {rowsOf(analysis.tokens).map(({ first, last, tokens }) => (
          <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-1.5 narrow:grid-cols-[minmax(0,1fr)]" key={first}>
            <span className="font-mono text-[12px] leading-[normal] text-ink3" aria-hidden="true">{first === last ? `line ${first}` : `lines ${first}–${last}`}</span>
            <ol className="flex flex-wrap items-stretch gap-1.5" aria-label={first === last ? `Line ${first}` : `Lines ${first} to ${last}`}>
              {tokens.map((token) => {
                const styles = KIND_STYLES[kindOf(token)];
                const isSelected = token.id === selectedToken?.id;
                const { shown, spoken } = labelOf(token);
                return (
                  <li key={token.id} className="flex">
                    <button
                      type="button"
                      className={`${CHIP_CLASSES} ${styles.chip} ${isSelected ? SELECTED_CLASSES : 'bg-transparent hover:bg-sunk'}`}
                      data-fact-id={token.id}
                      aria-pressed={isSelected}
                      aria-label={`${token.type}: ${spoken}`}
                      onClick={() => onSelect(token)}
                    >
                      <small className={`font-mono text-[10px] font-semibold tracking-[0.02em] ${styles.type}`}>{token.type}</small>
                      {shown}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
      {analysis.encoding && (
        <p className="mt-4 text-[14px] text-ink2">
          <ExplanationText spans={explainProgram('level3.encoding', analysis).text} />
        </p>
      )}
      {stoppedAt(analysis) === 3 && <SyntaxErrorPanel analysis={analysis} showLine />}
    </>
  );
}
