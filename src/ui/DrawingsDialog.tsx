import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { DrawingMeta } from '../core/persist/store';
import { t } from '../i18n/t';
import { useApp } from './app-context';
import { Dialog } from './Dialog';

function Thumb({ blob }: { blob: Blob | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
      setUrl(null);
    };
  }, [blob]);
  if (!blob || url === null) {
    return <div className="drawing-thumb empty">{t('drawings.noPreview')}</div>;
  }
  return <img className="drawing-thumb" src={url} alt="" />;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** "My drawings": every drawing stored in this browser. */
export function DrawingsDialog() {
  const app = useApp();
  const { session, store } = app.persistence;
  const info = useSyncExternalStore(session.subscribe, session.getInfo);
  const [list, setList] = useState<DrawingMeta[] | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    // Include unsaved edits of the open drawing in the listing.
    await session.flush();
    const all = await store.listDrawings();
    setList(all.sort((a, b) => b.updated - a.updated));
  }, [session, store]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    renameRef.current?.select();
  }, [renaming]);

  const close = (): void => {
    app.ui.dialog.set(null);
  };

  const run = (fn: () => Promise<unknown>): void => {
    void fn().then(refresh);
  };

  const commitRename = (id: string): void => {
    setRenaming(null);
    run(() => session.rename(id, draft));
  };

  return (
    <Dialog title={t('drawings.title')} onClose={close} className="drawings-dialog">
      <div className="dialog-actions">
        <button
          type="button"
          className="button primary"
          onClick={() => {
            close();
            void session.create();
          }}
        >
          {t('drawings.new')}
        </button>
      </div>
      {list?.length === 0 && <p className="muted">{t('drawings.empty')}</p>}
      <ul className="drawings-list">
        {list?.map((d) => {
          const current = d.id === info.id;
          return (
            <li key={d.id} className={current ? 'drawing-card current' : 'drawing-card'}>
              <button
                type="button"
                className="drawing-open"
                aria-label={`${t('drawings.open')}: ${d.name}`}
                onClick={() => {
                  close();
                  void session.open(d.id);
                }}
              >
                <Thumb blob={d.thumbnail} />
              </button>
              <div className="drawing-meta">
                {renaming === d.id ? (
                  <input
                    ref={renameRef}
                    className="rename-input"
                    aria-label={t('drawings.renameLabel')}
                    value={draft}
                    maxLength={200}
                    onChange={(e) => {
                      setDraft(e.target.value);
                    }}
                    onBlur={() => {
                      commitRename(d.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(d.id);
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setRenaming(null);
                      }
                    }}
                  />
                ) : (
                  <span className="drawing-card-name" title={d.name}>
                    {d.name}
                  </span>
                )}
                <span className="muted">
                  {current
                    ? t('drawings.current')
                    : t('drawings.updated', { when: dateFormat.format(d.updated) })}
                </span>
              </div>
              <div className="drawing-buttons">
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setDraft(d.name);
                    setRenaming(d.id);
                  }}
                >
                  {t('drawings.rename')}
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    run(() => session.duplicate(d.id, (name) => t('drawing.copyName', { name })));
                  }}
                >
                  {t('drawings.duplicate')}
                </button>
                <button
                  type="button"
                  className="link-button danger"
                  onClick={() => {
                    if (window.confirm(t('drawings.confirmDelete', { name: d.name }))) {
                      run(() => session.remove(d.id));
                    }
                  }}
                >
                  {t('drawings.delete')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
