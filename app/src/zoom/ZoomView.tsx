import { useState, type Ref } from 'react';
import { buttonClass } from '../button';
import { levelLabel } from '../concepts/concepts';
import { HonestyChip } from '../concepts/HonestyChip';
import { explainByte, explainProgram, explainToken, type TemplateId } from '../explain/explain';
import { ExplanationText } from '../explain/ExplanationText';
import { explainNode } from '../explain/syntaxTree';
import { explainTryIt } from '../explain/tryIt';
import type { Analysis } from '../generated/analysis';
import { BitsPanel, BytesZoomLevel } from './BytesZoomLevel';
import { CodeZoomLevel } from './CodeZoomLevel';
import { LAST_LEVEL, levelInfo } from './levels';
import { SyntaxTreeZoomLevel } from './SyntaxTreeZoomLevel';
import { TokensZoomLevel } from './TokensZoomLevel';
import { TryItYourself, type TryItTab } from './TryItYourself';

const ArrowDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);

const ArrowUp = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);

/** The Template that introduces each zoom level that has one. */
const INTROS: Record<number, TemplateId> = { 1: 'level1.intro', 2: 'level2.intro', 3: 'level3.intro', 4: 'level4.intro' };

/** One zoom level at a time: its heading, its introduction, its visual, the Explanation of what is selected, the Zoom in and Back buttons, and Try it yourself. */
export function ZoomView({
  level,
  analysis,
  selection,
  onSelect,
  onGo,
  viewRef,
}: {
  level: number;
  analysis: Analysis | null;
  /** The Fact ID of the Selection, such as byte-3, tok-0 or ast-2. */
  selection: string | null;
  onSelect(factId: string): void;
  onGo(level: number): void;
  viewRef: Ref<HTMLDivElement>;
}) {
  const { title } = levelInfo(level);
  // Try it yourself stays open, on the same tab, as the learner moves between zoom levels.
  const [tryItOpen, setTryItOpen] = useState(false);
  const [tryItTab, setTryItTab] = useState<TryItTab>('does');
  const selectedByte = analysis?.bytes.find((byte) => byte.id === selection) ?? null;
  const selectedToken = analysis?.tokens.find((token) => token.id === selection) ?? null;
  const selectedNode = analysis?.ast.find((node) => node.id === selection) ?? null;

  let visual;
  if (level > 4) visual = <p className="text-ink2">This zoom level isn’t built yet.</p>;
  else if (!analysis) visual = <p className="text-ink2">Write a program and click Run to see it here.</p>;
  else if (level === 1) visual = <CodeZoomLevel analysis={analysis} selectedChar={selectedByte?.charIndex ?? null} />;
  else if (level === 2) visual = <BytesZoomLevel analysis={analysis} selectedByte={selectedByte} onSelect={(byte) => onSelect(byte.id)} />;
  else if (level === 3) visual = <TokensZoomLevel analysis={analysis} selectedToken={selectedToken} onSelect={(token) => onSelect(token.id)} />;
  else visual = <SyntaxTreeZoomLevel analysis={analysis} selectedNode={selectedNode} onSelect={(node) => onSelect(node.id)} />;

  const intro = analysis && INTROS[level] ? explainProgram(INTROS[level], analysis) : null;
  let explanation = null;
  if (analysis && level === 2 && selectedByte) explanation = explainByte(analysis, selectedByte);
  if (analysis && level === 3 && selectedToken) explanation = explainToken(analysis, selectedToken);
  if (analysis && level === 4 && selectedNode) explanation = explainNode(analysis, selectedNode);
  // A zoom level carries its Honesty label once it shows something.
  const label = analysis ? levelLabel(level) : null;
  const tryIt = analysis && explainTryIt(level, analysis);

  return (
    <div className="origin-top" ref={viewRef}>
      <section className="grid min-w-0 gap-4" aria-label={`Zoom level ${level}: ${title}`}>
        <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
          <div>
            <p className="font-mono text-[13px] leading-[normal] text-ink3">Zoom level {level} of {LAST_LEVEL}</p>
            {/* The heading takes focus only so screen readers announce a new level; it isn't a control, so it has no focus ring. */}
            <h1 className="mt-1 text-[clamp(26px,3.2vw,34px)] font-semibold leading-[1.15] tracking-[-0.015em] outline-none" tabIndex={-1}>{title}</h1>
          </div>
          {label && <HonestyChip label={label} />}
        </div>
        {intro && (
          <p className="max-w-[64ch] text-[18px] leading-[1.6] text-ink2 [text-wrap:pretty]">
            <ExplanationText spans={intro.text} />
          </p>
        )}
        <div className="min-w-0 rounded-[14px] border-[1.5px] border-rule2 bg-surface px-[22px] pb-[22px] pt-5 narrow:p-4">{visual}</div>
        <div className="grid max-w-[780px] gap-2.5 empty:hidden" aria-live="polite">
          {explanation && (
            <>
              {explanation.title && (
                <h2 className="text-[20px] font-semibold leading-[1.3] [text-wrap:balance]">
                  <ExplanationText spans={explanation.title} />
                </h2>
              )}
              {explanation.term && (
                <p className="-mt-1.5 font-mono text-[13px] leading-[normal] text-ink3">
                  <ExplanationText spans={explanation.term} />
                </p>
              )}
              <p className="max-w-[65ch] text-[16px] leading-[1.65] text-ink2">
                <ExplanationText spans={explanation.text} />
              </p>
              {explanation.more && (
                <p className="max-w-[65ch] text-[14px] leading-[1.6] text-ink2">
                  <ExplanationText spans={explanation.more} />
                </p>
              )}
            </>
          )}
        </div>
        {analysis && level === 2 && selectedByte && <BitsPanel analysis={analysis} byte={selectedByte} />}
        <div className="flex flex-wrap gap-2">
          {level < LAST_LEVEL && (
            <button type="button" className={buttonClass({ primary: true })} data-zoom="in" onClick={() => onGo(level + 1)}>
              Zoom in: {levelInfo(level + 1).title}
              <ArrowDown />
            </button>
          )}
          {level > 1 && (
            <button type="button" className={buttonClass()} data-zoom="out" onClick={() => onGo(level - 1)}>
              <ArrowUp />
              Back: {levelInfo(level - 1).title}
            </button>
          )}
        </div>
        {tryIt && <TryItYourself tryIt={tryIt} open={tryItOpen} onToggle={setTryItOpen} tab={tryItTab} onTab={setTryItTab} />}
      </section>
    </div>
  );
}
