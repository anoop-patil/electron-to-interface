import type { Ref } from 'react';
import type { Analysis, ByteFact } from '../generated/analysis';
import { BytesZoomLevel } from './BytesZoomLevel';
import { CodeZoomLevel } from './CodeZoomLevel';
import { LAST_LEVEL, levelInfo } from './levels';

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

/** One zoom level at a time: its heading, its visual, and the Zoom in and Back buttons. */
export function ZoomView({
  level,
  analysis,
  selectedByte,
  onSelectByte,
  onGo,
  viewRef,
}: {
  level: number;
  analysis: Analysis | null;
  selectedByte: ByteFact | null;
  onSelectByte(byte: ByteFact): void;
  onGo(level: number): void;
  viewRef: Ref<HTMLDivElement>;
}) {
  const { title } = levelInfo(level);

  let visual;
  if (level > 2) visual = <p className="visual-note">This zoom level isn’t built yet.</p>;
  else if (!analysis) visual = <p className="visual-note">Write a program and click Run to see it here.</p>;
  else if (level === 1) visual = <CodeZoomLevel program={analysis.program} selectedChar={selectedByte?.charIndex ?? null} />;
  else visual = <BytesZoomLevel analysis={analysis} selectedByte={selectedByte} onSelect={onSelectByte} />;

  return (
    <div className="view" ref={viewRef}>
      <section className="zoom-level" aria-label={`Zoom level ${level}: ${title}`}>
        <p className="lvl-num">Zoom level {level} of {LAST_LEVEL}</p>
        <h1 tabIndex={-1}>{title}</h1>
        <div className="visual">{visual}</div>
        <div className="actions">
          {level < LAST_LEVEL && (
            <button type="button" className="btn btn-primary" data-zoom="in" onClick={() => onGo(level + 1)}>
              Zoom in: {levelInfo(level + 1).title}
              <ArrowDown />
            </button>
          )}
          {level > 1 && (
            <button type="button" className="btn" data-zoom="out" onClick={() => onGo(level - 1)}>
              <ArrowUp />
              Back: {levelInfo(level - 1).title}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
