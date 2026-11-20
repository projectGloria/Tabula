import type { ReactNode } from 'react';
import type { CommandId } from '../core/actions/commands';
import type { ToolId } from '../core/store/app-state';
import type { I18nKey } from '../i18n/en';
import { t } from '../i18n/t';
import { useApp } from './app-context';
import { useEditorState } from './hooks/useEditorState';
import { RectangleIcon, SelectIcon } from './icons';

interface ToolButtonDef {
  readonly tool: ToolId;
  readonly command: CommandId;
  readonly labelKey: I18nKey;
  readonly icon: ReactNode;
}

const TOOL_BUTTONS: readonly ToolButtonDef[] = [
  { tool: 'select', command: 'tool.select', labelKey: 'tool.select', icon: <SelectIcon /> },
  {
    tool: 'rectangle',
    command: 'tool.rectangle',
    labelKey: 'tool.rectangle',
    icon: <RectangleIcon />,
  },
];

export function Toolbar() {
  const app = useApp();
  const activeTool = useEditorState((s) => s.activeTool);

  return (
    <div className="toolbar" role="toolbar" aria-label={t('toolbar.label')}>
      {TOOL_BUTTONS.map((b) => {
        const label = t(b.labelKey);
        const key = app.keymap.shortcutFor(b.command);
        const title = key === undefined ? label : t('shortcut.withKey', { label, key });
        return (
          <button
            key={b.tool}
            type="button"
            className="tool-button"
            aria-label={title}
            aria-pressed={activeTool === b.tool}
            title={title}
            onClick={() => {
              app.runCommand(b.command);
            }}
          >
            {b.icon}
          </button>
        );
      })}
    </div>
  );
}
