import { useState, type Ref } from 'react';
import { buttonClass } from '../button';
import { levelLabel, panelLabel } from '../concepts/concepts';
import { HonestyChip } from '../concepts/HonestyChip';
import { explainByte, explainProgram, explainToken, levelIntro, type TemplateId } from '../explain/explain';
import { DocsLink, ExplanationText } from '../explain/ExplanationText';
import { explainLevel6, level6, level6AfterRun } from '../explain/interpreter';
import { explainLevel7, level7, level7AfterRun, level7IsReference } from '../explain/machine';
import { explainLevel8, level8 } from '../explain/operatingSystem';
import { explainLevel9, level9 } from '../explain/pixels';
import { explainAfterRun, explainStep, stepSelectionAt } from '../explain/steps';
import { explainNode } from '../explain/syntaxTree';
import { stoppedAt, syntaxErrorOf } from '../explain/stopped';
import { explainTryIt } from '../explain/tryIt';
import type { Analysis } from '../generated/analysis';
import { BitsPanel, BytesZoomLevel } from './BytesZoomLevel';
import { BytecodeZoomLevel } from './BytecodeZoomLevel';
import { CodeZoomLevel } from './CodeZoomLevel';
import { CpuZoomLevel } from './CpuZoomLevel';
import { InterpreterZoomLevel } from './InterpreterZoomLevel';
import { LAST_LEVEL, levelInfo } from './levels';
import { OperatingSystemZoomLevel } from './OperatingSystemZoomLevel';
import { PixelsZoomLevel } from './PixelsZoomLevel';
import { charsOf } from './selection';
import { SyntaxErrorPanel } from './SyntaxErrorPanel';
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

/** What levels 5 to 7 say when the Program has no steps, because it has a syntax error. */
const NO_STEPS: Record<number, TemplateId> = { 5: 'level5.noBytecode', 6: 'level6.noSteps', 7: 'level7.noSteps' };

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
  /** The Fact ID of what this zoom level shows selected, such as byte-3, tok-0, ast-2 or run-12 (`selectionAt`). */
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
  const selectedStep = analysis && level === 5 ? stepSelectionAt(analysis, selection, 5) : null;
  const interpreter = analysis && level === 6 ? level6(analysis, selection) : null;
  const cpu = analysis && level === 7 ? level7(analysis, selection) : null;
  const os = analysis && level === 8 ? level8(analysis, selection) : null;
  const pixels = analysis && level === 9 ? level9(analysis, selection) : null;

  let visual;
  if (!analysis) visual = <p className="text-ink2">Write a program and click Run to see it here.</p>;
  else if (level === 1) visual = <CodeZoomLevel analysis={analysis} selectedChars={selection ? charsOf(analysis, selection) : null} />;
  else if (level === 2) visual = <BytesZoomLevel analysis={analysis} selectedByte={selectedByte} onSelect={(byte) => onSelect(byte.id)} />;
  else if (level === 3) visual = <TokensZoomLevel analysis={analysis} selectedToken={selectedToken} onSelect={(token) => onSelect(token.id)} />;
  else if (level === 4) visual = <SyntaxTreeZoomLevel analysis={analysis} selectedNode={selectedNode} onSelect={(node) => onSelect(node.id)} />;
  else if (level === 8) {
    visual = os ? (
      <OperatingSystemZoomLevel analysis={analysis} view={os} onSelect={onSelect} />
    ) : (
      <p className="text-[14px] text-ink2"><ExplanationText spans={explainProgram(analysis.writesCutShort ? 'level8.nothingFollowed' : 'level8.nothingPrinted', analysis).text} /></p>
    );
  }
  else if (level === 9) {
    visual = pixels ? (
      <PixelsZoomLevel analysis={analysis} view={pixels} onSelect={onSelect} />
    ) : (
      <p className="text-[14px] text-ink2"><ExplanationText spans={explainProgram(analysis.writesCutShort ? 'level9.nothingFollowed' : 'level9.nothingPrinted', analysis).text} /></p>
    );
  }
  else if (selectedStep) visual = <BytecodeZoomLevel analysis={analysis} selected={selectedStep} onSelect={onSelect} onGo={onGo} />;
  else if (interpreter) visual = <InterpreterZoomLevel analysis={analysis} view={interpreter} onSelect={onSelect} onGo={onGo} />;
  else if (cpu) visual = <CpuZoomLevel analysis={analysis} view={cpu} onSelect={onSelect} onGo={onGo} />;
  // Levels 5 to 7 have no steps to show when the Program has a syntax error. Level 5 explains it if Python stopped there.
  else if (level === 5 && stoppedAt(analysis) === 5) visual = <SyntaxErrorPanel analysis={analysis} showLine />;
  else visual = <p className="text-[14px] text-ink2"><ExplanationText spans={explainProgram(NO_STEPS[level], analysis).text} /></p>;

  const intro = analysis && levelIntro(level, analysis);
  let explanation = null;
  if (analysis && level === 2 && selectedByte) explanation = explainByte(analysis, selectedByte);
  if (analysis && level === 3 && selectedToken) explanation = explainToken(analysis, selectedToken);
  if (analysis && level === 4 && selectedNode) explanation = explainNode(analysis, selectedNode);
  if (analysis && selectedStep) explanation = explainStep(analysis, selectedStep.step, selectedStep.run);
  if (analysis && interpreter) explanation = explainLevel6(analysis, interpreter);
  if (analysis && cpu) explanation = explainLevel7(analysis, cpu);
  if (analysis && os) explanation = explainLevel8(analysis, os);
  if (analysis && pixels) explanation = explainLevel9(pixels);
  let afterRun = null;
  if (analysis && selectedStep) afterRun = explainAfterRun(analysis, selectedStep.step);
  if (analysis && interpreter) afterRun = level6AfterRun(analysis, interpreter);
  if (analysis && cpu) afterRun = level7AfterRun(analysis, cpu);
  // A zoom level carries its Honesty label once it shows something. Levels 6 and 7 with nothing from the Reference
  // Library to show explain how it usually works; for a Program with a syntax error, they say why they show nothing.
  const typical = interpreter?.handlers.length === 0 || (cpu && !level7IsReference(cpu));
  const stopped = analysis && (level === 6 || level === 7) && syntaxErrorOf(analysis);
  let label = analysis && levelLabel(level);
  if (typical) label = panelLabel('noReference');
  if (stopped) label = panelLabel('syntaxError');
  const tryIt = analysis && explainTryIt(level, analysis, selection);

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
              {explanation.docs && <DocsLink docs={explanation.docs} />}
              {afterRun && (
                <p className="max-w-[65ch] text-[14px] leading-[1.6] text-ink2">
                  <ExplanationText spans={afterRun} /> <HonestyChip label={panelLabel('afterRun')} size="panel" />
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
