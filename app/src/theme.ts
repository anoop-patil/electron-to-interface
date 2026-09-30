import { useState, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'eti-theme';
const systemDark = () => matchMedia('(prefers-color-scheme: dark)');

/** The theme the learner picked with the toggle, or null to follow the system setting. */
function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Applies a theme picked earlier, before the first render, so the page doesn't flash the system theme.
 * The stylesheet reads `data-theme` on <html>; without it, it follows the system setting.
 */
export function applyStoredTheme() {
  const theme = storedTheme();
  if (theme) document.documentElement.dataset.theme = theme;
}

function subscribeToSystem(onChange: () => void) {
  const query = systemDark();
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** The theme on screen, and a toggle that switches it and remembers the choice. */
export function useTheme() {
  const [picked, setPicked] = useState(storedTheme);
  const system: Theme = useSyncExternalStore(subscribeToSystem, () => (systemDark().matches ? 'dark' : 'light'));
  const theme = picked ?? system;

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing can refuse storage; the toggle still works until the page closes.
    }
    setPicked(next);
  }

  return { theme, toggle };
}
