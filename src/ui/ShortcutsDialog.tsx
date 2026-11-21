import { COMMANDS, type CommandId } from '../core/actions/commands';
import type { I18nKey } from '../i18n/en';
import { t } from '../i18n/t';
import { useApp } from './app-context';
import { Dialog } from './Dialog';

type Group = 'tool' | 'edit' | 'view' | 'file' | 'other';

const GROUP_KEYS: Record<Group, I18nKey> = {
  tool: 'shortcuts.group.tool',
  edit: 'shortcuts.group.edit',
  view: 'shortcuts.group.view',
  file: 'shortcuts.group.file',
  other: 'shortcuts.group.other',
};

const GROUP_ORDER: readonly Group[] = ['tool', 'edit', 'view', 'file', 'other'];

function groupOf(id: CommandId): Group {
  switch (id.slice(0, id.indexOf('.'))) {
    case 'tool':
      return 'tool';
    case 'edit':
    case 'selection':
    case 'history':
    case 'z':
    case 'nudge':
      return 'edit';
    case 'view':
    case 'zoom':
      return 'view';
    case 'file':
    case 'insert':
      return 'file';
    default:
      return 'other';
  }
}

interface Row {
  readonly label: string;
  readonly keys: readonly string[];
}

/** Every bound command, grouped, plus gestures that are not commands. */
export function ShortcutsDialog() {
  const app = useApp();
  const rows = new Map<Group, Map<string, Row>>();
  const push = (group: Group, label: string, key: string): void => {
    let g = rows.get(group);
    if (!g) {
      g = new Map();
      rows.set(group, g);
    }
    const row = g.get(label);
    g.set(label, { label, keys: row ? [...row.keys, key] : [key] });
  };
  for (const b of app.keymap.bindings()) {
    const cmd = COMMANDS[b.command];
    push(groupOf(cmd.id), t(cmd.labelKey), app.keymap.format(b.combo));
  }
  push('edit', t('shortcuts.pasteInPlace'), app.keymap.format('Mod+Shift+V'));
  push('view', t('shortcuts.pan'), t('shortcuts.panKeys'));
  push('view', t('shortcuts.zoom'), t('shortcuts.zoomKeys'));

  return (
    <Dialog
      title={t('shortcuts.title')}
      onClose={() => {
        app.ui.dialog.set(null);
      }}
      className="shortcuts-dialog"
    >
      <div className="shortcuts-grid">
        {GROUP_ORDER.map((group) => {
          const g = rows.get(group);
          if (!g) return null;
          return (
            <section key={group} className="shortcuts-group">
              <h3>{t(GROUP_KEYS[group])}</h3>
              <dl>
                {[...g.values()].map((row) => (
                  <div key={row.label} className="shortcut-row">
                    <dt>{row.label}</dt>
                    <dd>
                      {row.keys.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </Dialog>
  );
}
