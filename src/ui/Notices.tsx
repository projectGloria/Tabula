import { useSyncExternalStore } from 'react';
import { t } from '../i18n/t';
import { useApp } from './app-context';
import { CloseIcon } from './icons';

/** Toasts plus the persistent "open in another tab" banner. */
export function Notices() {
  const app = useApp();
  const notices = useSyncExternalStore(app.ui.notices.subscribe, app.ui.notices.get);
  const { session } = app.persistence;
  const info = useSyncExternalStore(session.subscribe, session.getInfo);

  return (
    <>
      {info.conflict && (
        <div className="banner" role="alert">
          <span>{t('conflict.message')}</span>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              void session.takeOver();
            }}
          >
            {t('conflict.takeOver')}
          </button>
        </div>
      )}
      <div className="notices" aria-live="polite">
        {notices.map((n) => (
          <div
            key={n.id}
            className={`notice ${n.tone}`}
            role={n.tone === 'error' ? 'alert' : 'status'}
          >
            <span>{n.message}</span>
            {n.action && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  app.ui.dismiss(n.id);
                  n.action?.run();
                }}
              >
                {n.action.label}
              </button>
            )}
            <button
              type="button"
              className="notice-close"
              aria-label={t('notice.dismiss')}
              onClick={() => {
                app.ui.dismiss(n.id);
              }}
            >
              <CloseIcon />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
