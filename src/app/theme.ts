import { setTheme } from '../core/actions/view-actions';
import type { Theme } from '../core/store/app-state';
import type { Editor } from '../core/store/editor';

const KEY = 'tabula.theme';

function saved(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function store(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Storage unavailable: the choice lasts for this tab only.
  }
}

/**
 * Keeps the UI theme in sync: starts from the saved choice or the system
 * preference, follows the system until the user picks one, and mirrors the
 * state onto `<html data-theme>` for the stylesheet.
 */
export function installTheme(editor: Editor): void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const system = (): Theme => (media.matches ? 'dark' : 'light');
  let followSystem = saved() === null;
  let fromSystem = true;
  editor.update((s) => setTheme(s, saved() ?? system()), { history: 'skip' });

  let applied: Theme | null = null;
  const apply = (): void => {
    const theme = editor.getState().theme;
    if (theme === applied) return;
    applied = theme;
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', theme === 'dark' ? '#1b1c1f' : '#f6f5f2');
    // Any change not made by the system listener is the user's choice.
    if (!fromSystem) {
      followSystem = false;
      store(theme);
    }
  };
  apply();
  fromSystem = false;
  editor.subscribe(apply);
  media.addEventListener('change', () => {
    if (!followSystem) return;
    fromSystem = true;
    editor.update((s) => setTheme(s, system()), { history: 'skip' });
    fromSystem = false;
  });
}
