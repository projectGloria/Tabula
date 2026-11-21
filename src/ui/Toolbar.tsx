import { useSyncExternalStore, type ReactNode } from 'react';
import type { CommandId } from '../core/actions/commands';
import type { ToolId } from '../core/store/app-state';
import type { I18nKey } from '../i18n/en';
import { t } from '../i18n/t';
import { useApp } from './app-context';
import { useEditorState } from './hooks/useEditorState';
import {
  ArrowIcon,
  DiamondIcon,
  EllipseIcon,
  ImageIcon,
  LineIcon,
  PencilIcon,
  RectangleIcon,
  RedoIcon,
  SelectIcon,
  TextIcon,
  UndoIcon,
} from './icons';

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
  { tool: 'diamond', command: 'tool.diamond', labelKey: 'tool.diamond', icon: <DiamondIcon /> },
  { tool: 'ellipse', command: 'tool.ellipse', labelKey: 'tool.ellipse', icon: <EllipseIcon /> },
  { tool: 'arrow', command: 'tool.arrow', labelKey: 'tool.arrow', icon: <ArrowIcon /> },
  { tool: 'line', command: 'tool.line', labelKey: 'tool.line', icon: <LineIcon /> },
  { tool: 'freedraw', command: 'tool.freedraw', labelKey: 'tool.freedraw', icon: <PencilIcon /> },
  { tool: 'text', command: 'tool.text', labelKey: 'tool.text', icon: <TextIcon /> },
];

function useHistoryFlag(read: () => boolean): boolean {
  const { editor } = useApp();
  return useSyncExternalStore(editor.subscribeHistory, read);
}

function HistoryButton({
  command,
  enabled,
  icon,
}: {
  command: CommandId;
  enabled: boolean;
  icon: ReactNode;
}) {
  const app = useApp();
  const label = command === 'history.undo' ? t('command.undo') : t('command.redo');
  const key = app.keymap.shortcutFor(command);
  const title = key === undefined ? label : t('shortcut.withKey', { label, key });
  return (
    <button
      type="button"
      className="tool-button"
      aria-label={title}
      title={title}
      disabled={!enabled}
      onClick={() => {
        app.runCommand(command);
      }}
    >
      {icon}
    </button>
  );
}

export function Toolbar() {
  const app = useApp();
  const activeTool = useEditorState((s) => s.activeTool);
  const canUndo = useHistoryFlag(() => app.editor.history.canUndo);
  const canRedo = useHistoryFlag(() => app.editor.history.canRedo);

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
      <HistoryButton command="insert.image" enabled icon={<ImageIcon />} />
      <div className="toolbar-sep" role="separator" />
      <HistoryButton command="history.undo" enabled={canUndo} icon={<UndoIcon />} />
      <HistoryButton command="history.redo" enabled={canRedo} icon={<RedoIcon />} />
    </div>
  );
}
