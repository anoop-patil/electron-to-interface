import { useSyncExternalStore } from 'react';
import { screenPixels, type ScreenPixels } from './explain/pixels';

/**
 * The learner's screen, from what their browser reports: its size in its own pixels (`screenPixels`), and how many of
 * them make one CSS pixel. They change when the window moves to another screen, or the page is zoomed.
 */
export interface Screen {
  pixels: ScreenPixels;
  ratio: number;
}

let last: Screen | null = null;

function current(): Screen {
  const ratio = window.devicePixelRatio || 1;
  const pixels = screenPixels(window.screen, ratio);
  // useSyncExternalStore needs the same object back while nothing has changed.
  if (!last || last.ratio !== ratio || last.pixels.width !== pixels.width || last.pixels.height !== pixels.height) last = { pixels, ratio };
  return last;
}

function subscribe(onChange: () => void) {
  // A change of pixel ratio fires no resize on every browser, so listen for it too, at the ratio of the moment.
  let query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  const onRatio = () => {
    query.removeEventListener('change', onRatio);
    query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    query.addEventListener('change', onRatio);
    onChange();
  };
  query.addEventListener('change', onRatio);
  window.addEventListener('resize', onChange);
  return () => {
    query.removeEventListener('change', onRatio);
    window.removeEventListener('resize', onChange);
  };
}

export const useScreen = () => useSyncExternalStore(subscribe, current);
