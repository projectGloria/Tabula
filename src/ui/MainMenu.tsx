import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { COMMANDS, commandAllowed, type CommandId } from '../core/actions/commands';
import type { SaveStatus } from '../core/persist/session';
import type { I18nKey } from '../i18n/en';
import { t } from '../i18n/t';
import { useApp } from './app-context';
import { MenuIcon } from './icons';

type Entry = CommandId | 'sep';

const ENTRIES: readonly Entry[] = [
  'file.drawings',
  'file.new',
  'sep',
  'file.open',
  'file.save',
  'file.saveAs',
  'sep',
  'insert.image',
  'file.export',
  'sep',
  'view.theme',
  'view.zen',
  'view.mode',
  'view.grid',
  'sep',
  'help.palette',
  'help.shortcuts',
];

const STATUS_KEYS: Record<SaveStatus, I18nKey | null> = {
  idle: null,
  pending: 'save.pending',
  saving: 'save.saving',
  saved: 'save.saved',
  quota: 'save.quota',
  error: 'save.error',
};

/** Top-left menu: drawing name, save status and file commands. */
export function MainMenu() {
  const app = useApp();
  const { session } = app.persistence;
  const info = useSyncExternalStore(session.subscribe, session.getInfo);
  const state = useSyncExternalStore(app.editor.subscribe, app.editor.getState);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    rootRef.current?.querySelector<HTMLButtonElement>('.menu-item')?.focus();
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const statusKey = STATUS_KEYS[info.status];
  const status = statusKey ? t(statusKey) : '';
  const failing = info.status === 'quota' || info.status === 'error';

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.menu-item')];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
    items[(next + items.length) % items.length]?.focus();
  };

  return (
    <div className="main-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="main-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('mainMenu.label')}
        title={t('mainMenu.label')}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        <MenuIcon />
      </button>
      <div className="drawing-title">
        <span className="drawing-name">{info.name}</span>
        <span
          className={failing ? 'save-status failing' : 'save-status'}
          role="status"
          title={status}
        >
          {failing ? status : <span className={`save-dot ${info.status}`} aria-label={status} />}
        </span>
      </div>
      {open && (
        <div className="context-menu main-menu-list" role="menu" onKeyDown={onMenuKey}>
          {ENTRIES.map((entry, i) => {
            if (entry === 'sep') return <div key={`sep${String(i)}`} className="menu-sep" />;
            const key = app.keymap.shortcutFor(entry);
            const cmd = COMMANDS[entry];
            const checked = cmd.checked?.(state);
            return (
              <button
                key={entry}
                type="button"
                role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={checked}
                disabled={!commandAllowed(state, cmd)}
                className={checked === true ? 'menu-item checked' : 'menu-item'}
                onClick={() => {
                  setOpen(false);
                  app.runCommand(entry);
                }}
              >
                <span>{t(COMMANDS[entry].labelKey)}</span>
                {key !== undefined && <kbd>{key}</kbd>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
