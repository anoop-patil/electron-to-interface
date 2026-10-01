import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { FIRST_LEVEL, LAST_LEVEL, levelFromPath, pathOf } from './levels';

/**
 * The zoom is the only animation (Requirements: Layout and motion): the old level grows and fades
 * out, then the new one settles in, about 250 ms in all. With reduced motion on, it's a plain crossfade.
 */
const LEAVE_MS = 100;
const ARRIVE_MS = 150;

type Direction = 'in' | 'out';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function leaving(direction: Direction): Keyframe[] {
  if (reducedMotion()) return [{ opacity: 1 }, { opacity: 0 }];
  return [
    { opacity: 1, transform: 'scale(1)' },
    { opacity: 0, transform: direction === 'in' ? 'scale(1.35)' : 'scale(0.9)' },
  ];
}

function arriving(direction: Direction): Keyframe[] {
  if (reducedMotion()) return [{ opacity: 0 }, { opacity: 1 }];
  return [
    { opacity: 0, transform: direction === 'in' ? 'scale(0.95)' : 'scale(1.05)' },
    { opacity: 1, transform: 'scale(1)' },
  ];
}

const levelInAddressBar = () => levelFromPath(location.pathname);

/** The address of a zoom level, keeping the query and fragment (where a Share link carries its program). */
const addressOf = (level: number) => pathOf(level) + location.search + location.hash;

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * The zoom level on screen, kept in step with the address bar (`/zoom/1` to `/zoom/9`), so back,
 * forward and deep links work. `go` moves to a level; the down and up arrows zoom in and out.
 * `view` is the element that animates.
 */
export function useZoomNavigation(view: RefObject<HTMLElement | null>) {
  const [level, setLevel] = useState(() => levelInAddressBar() ?? FIRST_LEVEL);
  const shown = useRef(level);
  const target = useRef(level);
  const leavingAnimation = useRef<Animation | null>(null);
  const direction = useRef<Direction | null>(null);

  /** Animates to a level, without touching the address bar. */
  const zoomTo = useCallback(
    (to: number) => {
      target.current = to;
      // A zoom is already on its way out; when it finishes it shows the latest target.
      if (leavingAnimation.current || to === shown.current) return;

      const commit = () => {
        leavingAnimation.current = null;
        if (target.current === shown.current) return;
        direction.current = target.current > shown.current ? 'in' : 'out';
        shown.current = target.current;
        // Render the new level before the next frame, so the old one never flashes back.
        flushSync(() => setLevel(target.current));
      };

      const element = view.current;
      if (!element?.animate) return commit();
      const zoomingIn = to > shown.current;
      // Grow from the selected element, if there is one, as if diving into it.
      const selected = zoomingIn ? element.querySelector('[aria-pressed="true"]') : null;
      if (selected) {
        const from = selected.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        element.style.transformOrigin = `${from.left + from.width / 2 - box.left}px ${from.top + from.height / 2 - box.top}px`;
      }
      const animation = element.animate(leaving(zoomingIn ? 'in' : 'out'), { duration: LEAVE_MS, easing: 'ease-in' });
      leavingAnimation.current = animation;
      animation.onfinish = commit;
      animation.oncancel = commit;
    },
    [view],
  );

  const go = useCallback(
    (to: number) => {
      if (to < FIRST_LEVEL || to > LAST_LEVEL) return;
      if (levelInAddressBar() !== to) {
        // A second zoom before the first has finished replaces its history entry, so Back never
        // lands on a level the learner didn't see.
        if (leavingAnimation.current) history.replaceState(null, '', addressOf(to));
        else history.pushState(null, '', addressOf(to));
      }
      zoomTo(to);
    },
    [zoomTo],
  );

  // The new level settles in; if the control that moved here disappeared with the old level,
  // focus goes to the new level's heading instead of being lost.
  useLayoutEffect(() => {
    const element = view.current;
    const zoomed = direction.current;
    direction.current = null;
    if (!element || !zoomed) return;
    element.style.transformOrigin = '';
    element.animate?.(arriving(zoomed), { duration: ARRIVE_MS, easing: 'ease-out' });
    if (element.getBoundingClientRect().top < 0) element.scrollIntoView({ block: 'start' });
    if (!document.activeElement || document.activeElement === document.body) {
      element.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    }
  }, [level, view]);

  useEffect(() => {
    // Any other address opens level 1, and says so.
    if (levelInAddressBar() === null) history.replaceState(null, '', addressOf(shown.current));
    const onPopState = () => zoomTo(levelInAddressBar() ?? FIRST_LEVEL);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isTyping(event.target)) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        // The control that had focus, such as a clicked gauge tick, belongs to the level being left, and the
        // key press would give it a focus ring. The heading takes focus instead, and keeps it through the zoom.
        view.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
        go(target.current + (event.key === 'ArrowDown' ? 1 : -1));
      }
    };
    addEventListener('popstate', onPopState);
    addEventListener('keydown', onKeyDown);
    return () => {
      removeEventListener('popstate', onPopState);
      removeEventListener('keydown', onKeyDown);
    };
  }, [go, zoomTo, view]);

  return { level, go };
}
