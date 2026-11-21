import { contentOffscreen } from '../core/actions/view-actions';
import { t } from '../i18n/t';
import { useApp } from './app-context';
import { useEditorState } from './hooks/useEditorState';
import { MinusIcon, PlusIcon } from './icons';

function titled(label: string, key: string | undefined): string {
  return key === undefined ? label : t('shortcut.withKey', { label, key });
}

/** Bottom-left zoom buttons and the "back to content" pill. */
export function ViewControls() {
  const app = useApp();
  const zoom = useEditorState((s) => s.camera.zoom);
  const lost = useEditorState(contentOffscreen);
  const percent = String(Math.round(zoom * 100));
  const outLabel = titled(t('command.zoomOut'), app.keymap.shortcutFor('zoom.out'));
  const inLabel = titled(t('command.zoomIn'), app.keymap.shortcutFor('zoom.in'));
  const resetLabel = t('zoom.level', { percent });
  return (
    <>
      <div className="zoom-controls" role="group" aria-label={t('zoom.label')}>
        <button
          type="button"
          className="tool-button"
          aria-label={outLabel}
          title={outLabel}
          onClick={() => {
            app.runCommand('zoom.out');
          }}
        >
          <MinusIcon />
        </button>
        <button
          type="button"
          className="zoom-level"
          aria-label={resetLabel}
          title={resetLabel}
          onClick={() => {
            app.runCommand('zoom.reset');
          }}
        >
          {percent}%
        </button>
        <button
          type="button"
          className="tool-button"
          aria-label={inLabel}
          title={inLabel}
          onClick={() => {
            app.runCommand('zoom.in');
          }}
        >
          <PlusIcon />
        </button>
      </div>
      {lost && (
        <button
          type="button"
          className="button pill back-to-content"
          onClick={() => {
            app.runCommand('view.content');
          }}
        >
          {t('command.backToContent')}
        </button>
      )}
    </>
  );
}

/** Exit pill shown while zen or view mode hides the chrome. */
export function ModeExit() {
  const app = useApp();
  const zen = useEditorState((s) => s.zenMode);
  const view = useEditorState((s) => s.viewMode);
  if (!zen && !view) return null;
  const command = view ? 'view.mode' : 'view.zen';
  const label = titled(
    view ? t('mode.exitView') : t('mode.exitZen'),
    app.keymap.shortcutFor(command),
  );
  return (
    <button
      type="button"
      className="button pill mode-exit"
      onClick={() => {
        app.runCommand(command);
      }}
    >
      {label}
    </button>
  );
}
