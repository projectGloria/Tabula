import { useEffect } from 'react';
import { isEditableTarget } from '../../core/keymap/keymap';
import { useApp } from '../app-context';

const TEXT = 'text/plain';

/**
 * System clipboard via the DOM copy/cut/paste events (no permission prompt).
 * Mod+Shift+V pastes in place. Ignored while typing in a field.
 */
export function useClipboard(): void {
  const app = useApp();
  useEffect(() => {
    const typing = (e: Event): boolean =>
      isEditableTarget(e.target instanceof HTMLElement ? e.target : null);
    let pasteInPlace = false;

    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = app.isMac ? e.metaKey : e.ctrlKey;
      if (e.code === 'KeyV' && mod) pasteInPlace = e.shiftKey;
    };
    const onCopy = (e: ClipboardEvent): void => {
      if (typing(e)) return;
      const text = app.copySelection();
      if (text === null || !e.clipboardData) return;
      e.clipboardData.setData(TEXT, text);
      e.preventDefault();
    };
    const onCut = (e: ClipboardEvent): void => {
      if (typing(e)) return;
      if (!e.clipboardData || app.copySelection() === null) return;
      const text = app.cutSelection();
      if (text === null) return;
      e.clipboardData.setData(TEXT, text);
      e.preventDefault();
    };
    const onPaste = (e: ClipboardEvent): void => {
      const inPlace = pasteInPlace;
      pasteInPlace = false;
      if (typing(e)) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (app.insertImageFiles(files)) {
        e.preventDefault();
        return;
      }
      const text = e.clipboardData?.getData(TEXT) ?? '';
      if (app.pasteText(text, inPlace)) e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  }, [app]);
}
