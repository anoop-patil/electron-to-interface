import { useEffect, useRef } from 'react';
import { LEVELS, type ZoomLevelInfo } from './levels';

/**
 * A thin ruler with a tick for each zoom level; the current one is lit, and each tick moves there.
 * The break between levels 5 and 6 is the Interpreter handoff: above it is the learner's code, below
 * it the machine running it.
 */
export function DepthGauge({ level, onGo }: { level: number; onGo(level: number): void }) {
  const nav = useRef<HTMLElement>(null);

  // On phones the gauge is a strip that can be wider than the screen: keep the current tick in view.
  useEffect(() => {
    const strip = nav.current;
    const current = strip?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!strip || !current || strip.scrollWidth <= strip.clientWidth) return;
    const box = strip.getBoundingClientRect();
    const tick = current.getBoundingClientRect();
    if (tick.left < box.left || tick.right > box.right) {
      strip.scrollLeft += tick.left - box.left - (box.width - tick.width) / 2;
    }
  }, [level]);

  const tick = ({ number, short }: ZoomLevelInfo) => {
    const place = number < level ? 'past' : number === level ? 'current' : 'future';
    return (
      <li key={number}>
        <button
          type="button"
          className={`g-item ${place}`}
          aria-current={number === level ? 'step' : undefined}
          onClick={() => onGo(number)}
        >
          <span className="g-tick" aria-hidden="true" />
          <span className="g-n">{number}</span> <span className="g-label">{short}</span>
        </button>
      </li>
    );
  };

  return (
    <nav className="gauge" aria-label="Depth gauge" ref={nav}>
      <p className="g-group" id="gauge-before">Before it runs</p>
      <ol className="g-list" aria-labelledby="gauge-before">
        {LEVELS.filter((l) => l.beforeHandoff).map(tick)}
      </ol>
      <p className="g-handoff">
        <strong>
          <span className="long">Interpreter </span>handoff
        </strong>
        <span>Your code ends here</span>
      </p>
      <p className="g-group" id="gauge-after">While it runs</p>
      <ol className="g-list g-machine" start={6} aria-labelledby="gauge-after">
        {LEVELS.filter((l) => !l.beforeHandoff).map(tick)}
      </ol>
    </nav>
  );
}
