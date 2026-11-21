import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { COMMANDS, commandAllowed, type Command } from '../core/actions/commands';
import { t } from '../i18n/t';
import { useApp } from './app-context';
import { Dialog } from './Dialog';
import { useEditorState } from './hooks/useEditorState';

/** Commands worth listing: not nudges (keys only) and not dev-only ones in production. */
function listable(dev: boolean): readonly Command[] {
  return Object.values(COMMANDS).filter(
    (c) => !c.id.startsWith('nudge.') && c.id !== 'help.palette' && (dev || c.devOnly !== true),
  );
}

/** Case-insensitive match of every typed word against the label or id. */
function matches(cmd: Command, label: string, query: string): boolean {
  const hay = `${label} ${cmd.id}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function CommandPalette() {
  const app = useApp();
  const state = useEditorState((s) => s);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const all = useMemo(() => listable(import.meta.env.DEV), []);
  const items = all
    .map((cmd) => ({ cmd, label: t(cmd.labelKey) }))
    .filter((it) => commandAllowed(state, it.cmd) && matches(it.cmd, it.label, query));
  const index = Math.min(active, Math.max(items.length - 1, 0));

  const close = (): void => {
    app.ui.dialog.set(null);
  };
  const run = (i: number): void => {
    const it = items[i];
    if (!it) return;
    close();
    app.runCommand(it.cmd.id);
  };

  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = items.length;
      if (n === 0) return;
      setActive((index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(index);
    }
  };

  const listId = 'palette-list';
  return (
    <Dialog title={t('palette.title')} onClose={close} className="palette-dialog">
      <input
        className="palette-input"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={items[index] ? `palette-${items[index].cmd.id}` : undefined}
        aria-label={t('palette.placeholder')}
        placeholder={t('palette.placeholder')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKey}
      />
      <ul className="palette-list" id={listId} role="listbox">
        {items.length === 0 && <li className="muted palette-empty">{t('palette.empty')}</li>}
        {items.map((it, i) => {
          const key = app.keymap.shortcutFor(it.cmd.id);
          const checked = it.cmd.checked?.(state);
          return (
            <li
              key={it.cmd.id}
              id={`palette-${it.cmd.id}`}
              role="option"
              aria-selected={i === index}
              className={i === index ? 'palette-item active' : 'palette-item'}
              onPointerMove={() => {
                if (i !== index) setActive(i);
              }}
              onClick={() => {
                run(i);
              }}
            >
              <span>
                {it.label}
                {checked === true && <span className="palette-check"> ✓</span>}
              </span>
              {key !== undefined && <kbd>{key}</kbd>}
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
