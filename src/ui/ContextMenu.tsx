import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { COMMANDS, type CommandId } from '../core/actions/commands';
import type { Point } from '../core/geometry/vec';
import { selectedIds } from '../core/store/app-state';
import type { I18nKey } from '../i18n/en';
import { t } from '../i18n/t';
import { useApp } from './app-context';

type Entry =
  | { readonly kind: 'command'; readonly id: CommandId }
  | { readonly kind: 'clip'; readonly op: 'copy' | 'cut' | 'paste'; readonly labelKey: I18nKey }
  | { readonly kind: 'sep' };

const SELECTION_ENTRIES: readonly Entry[] = [
  { kind: 'clip', op: 'cut', labelKey: 'command.cut' },
  { kind: 'clip', op: 'copy', labelKey: 'command.copy' },
  { kind: 'clip', op: 'paste', labelKey: 'command.paste' },
  { kind: 'sep' },
  { kind: 'command', id: 'edit.duplicate' },
  { kind: 'command', id: 'edit.delete' },
  { kind: 'sep' },
  { kind: 'command', id: 'z.front' },
  { kind: 'command', id: 'z.forward' },
  { kind: 'command', id: 'z.backward' },
  { kind: 'command', id: 'z.back' },
  { kind: 'sep' },
  { kind: 'command', id: 'edit.group' },
  { kind: 'command', id: 'edit.ungroup' },
  { kind: 'command', id: 'edit.flipH' },
  { kind: 'command', id: 'edit.flipV' },
  { kind: 'command', id: 'edit.lock' },
];

const CANVAS_ENTRIES: readonly Entry[] = [
  { kind: 'clip', op: 'paste', labelKey: 'command.paste' },
  { kind: 'command', id: 'selection.all' },
  { kind: 'command', id: 'edit.unlockAll' },
];

const EDGE_PX = 8;

/** Right-click / long-press menu over the canvas. */
export function ContextMenu() {
  const app = useApp();
  const [at, setAt] = useState<Point | null>(null);
  const [pos, setPos] = useState<Point | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => app.ui.onContextMenu(setAt), [app]);

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!at || !el) {
      setPos(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(EDGE_PX, Math.min(at.x, window.innerWidth - r.width - EDGE_PX)),
      y: Math.max(EDGE_PX, Math.min(at.y, window.innerHeight - r.height - EDGE_PX)),
    });
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [at]);

  useEffect(() => {
    if (!at) return;
    const close = (e: Event): void => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      setAt(null);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setAt(null);
      }
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('wheel', close, true);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('wheel', close, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [at]);

  if (!at) return null;
  const state = app.editor.getState();
  const entries = selectedIds(state).length > 0 ? SELECTION_ENTRIES : CANVAS_ENTRIES;

  const runClip = (op: 'copy' | 'cut' | 'paste'): void => {
    const clip = navigator.clipboard as Clipboard | undefined;
    if (op === 'paste') {
      clip
        ?.readText()
        .then((text) => {
          app.pasteText(text, false);
        })
        .catch(() => {
          // Permission denied or empty clipboard; the keyboard path still works.
        });
      return;
    }
    const text = op === 'cut' ? app.cutSelection() : app.copySelection();
    if (text !== null) void clip?.writeText(text).catch(() => undefined);
  };

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = [
      ...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    ];
    const i = buttons.findIndex((b) => b === document.activeElement);
    const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
    buttons.at((next + buttons.length) % buttons.length)?.focus();
  };

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      aria-label={t('menu.label')}
      style={{ left: pos?.x ?? at.x, top: pos?.y ?? at.y, visibility: pos ? 'visible' : 'hidden' }}
      onKeyDown={onMenuKey}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
    >
      {entries.map((entry, i) => {
        if (entry.kind === 'sep')
          return <div key={`sep-${String(i)}`} className="menu-sep" role="separator" />;
        if (entry.kind === 'clip') {
          return (
            <button
              key={entry.op}
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setAt(null);
                runClip(entry.op);
              }}
            >
              <span>{t(entry.labelKey)}</span>
              <kbd>
                {app.keymap.format(
                  `Mod+${entry.op === 'copy' ? 'C' : entry.op === 'cut' ? 'X' : 'V'}`,
                )}
              </kbd>
            </button>
          );
        }
        const cmd = COMMANDS[entry.id];
        const enabled = cmd.enabled ? cmd.enabled(state) : true;
        const key = app.keymap.shortcutFor(entry.id);
        return (
          <button
            key={entry.id}
            type="button"
            role="menuitem"
            className="menu-item"
            disabled={!enabled}
            onClick={() => {
              setAt(null);
              app.runCommand(entry.id);
            }}
          >
            <span>{t(cmd.labelKey)}</span>
            {key !== undefined && <kbd>{key}</kbd>}
          </button>
        );
      })}
    </div>
  );
}
