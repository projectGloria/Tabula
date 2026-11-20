import { useSyncExternalStore } from 'react';
import type { AppState } from '../../core/store/app-state';
import { useApp } from '../app-context';

/** Subscribes to a slice of editor state. The selector must return a stable value. */
export function useEditorState<T>(selector: (state: AppState) => T): T {
  const { editor } = useApp();
  return useSyncExternalStore(editor.subscribe, () => selector(editor.getState()));
}
