import { useEffect, useRef } from 'react';
import { LEVELS, type ZoomLevelInfo } from './levels';

type Place = 'past' | 'current' | 'future';

// Each tick's classes, by where it sits relative to the current zoom level.
const PLACE_STYLES: Record<Place, { tick: string; number: string; label: string }> = {
  past: { tick: 'h-0.5 w-2.5 bg-ink3', number: '', label: 'text-ink2' },
  current: { tick: 'h-[3px] w-[18px] bg-accent', number: 'font-semibold text-accent', label: 'font-semibold text-ink' },
  future: { tick: 'h-0.5 w-2.5 bg-rule2', number: '', label: '' },
};
const HEADING_CLASSES = 'mb-1.5 text-[12px] font-semibold text-ink3 narrow:hidden';
// A ruler down the left, or along the bottom when the gauge is a strip.
const LIST_CLASSES = 'border-l-2 border-rule2 narrow:flex narrow:border-b-2 narrow:border-l-0';

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
    const place: Place = number < level ? 'past' : number === level ? 'current' : 'future';
    const styles = PLACE_STYLES[place];
    return (
      <li key={number}>
        <button
          type="button"
          className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-r-lg pr-2 text-left text-ink3 hover:bg-sunk narrow:h-auto narrow:min-w-11 narrow:flex-col narrow:justify-end narrow:gap-0.5 narrow:rounded-tl-lg narrow:rounded-br-none narrow:px-1 narrow:pt-1.5"
          aria-current={number === level ? 'step' : undefined}
          onClick={() => onGo(number)}
        >
          <span className={`-ml-0.5 flex-none narrow:order-3 narrow:mx-0 narrow:-mb-0.5 narrow:mt-1 narrow:w-full ${styles.tick}`} aria-hidden="true" />
          <span className={`min-w-2.5 font-mono text-[12px] leading-[normal] narrow:text-center ${styles.number}`}>{number}</span>{' '}
          <span className={`text-[14px] narrow:whitespace-nowrap narrow:text-[12px] ${styles.label}`}>{short}</span>
        </button>
      </li>
    );
  };

  return (
    <nav
      className="flex min-w-0 flex-col border-r border-rule py-[22px] pl-[18px] pr-3 narrow:flex-row narrow:items-stretch narrow:gap-1.5 narrow:overflow-x-auto narrow:border-b narrow:border-r-0 narrow:px-3 narrow:pb-0 narrow:pt-2"
      aria-label="Depth gauge"
      ref={nav}
    >
      <p className={HEADING_CLASSES} id="gauge-before">Before it runs</p>
      <ol className={LIST_CLASSES} aria-labelledby="gauge-before">
        {LEVELS.filter((l) => l.beforeHandoff).map(tick)}
      </ol>
      <p className="my-3 flex flex-col border-y border-dashed border-rule2 py-2.5 text-[12px] leading-[1.4] text-ink3 narrow:m-0 narrow:justify-center narrow:whitespace-nowrap narrow:border-x narrow:border-y-0 narrow:px-2 narrow:py-0">
        <strong className="font-semibold text-ink2">
          <span className="narrow:hidden">Interpreter </span>handoff
        </strong>
        <span className="narrow:hidden">Your code ends here</span>
      </p>
      <p className={HEADING_CLASSES} id="gauge-after">While it runs</p>
      <ol className={`${LIST_CLASSES} border-dashed`} start={6} aria-labelledby="gauge-after">
        {LEVELS.filter((l) => !l.beforeHandoff).map(tick)}
      </ol>
    </nav>
  );
}
