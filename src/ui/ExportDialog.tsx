import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  DEFAULT_EXPORT,
  EXPORT_MIME,
  exportSize,
  renderExport,
  renderPreview,
  type ExportFormat,
  type ExportOptions,
} from '../app/exporter';
import { safeFileName, saveFile, type FileTypeSpec } from '../app/files';
import { selectedIds } from '../core/store/app-state';
import { t } from '../i18n/t';
import { useApp } from './app-context';
import { Dialog } from './Dialog';

const PREVIEW_SIDE = 560;

const FILE_TYPES: Record<ExportFormat, FileTypeSpec> = {
  png: {
    get description() {
      return t('file.typePng');
    },
    mime: EXPORT_MIME.png,
    extensions: ['.png'],
  },
  svg: {
    get description() {
      return t('file.typeSvg');
    },
    mime: EXPORT_MIME.svg,
    extensions: ['.svg'],
  },
};

/** Options survive closing the dialog (for this tab). */
let remembered: ExportOptions = DEFAULT_EXPORT;

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="export-row">
      <span className="export-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            disabled={o.disabled === true}
            className={o.value === value ? 'segment active' : 'segment'}
            onClick={() => {
              onChange(o.value);
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: ReactNode;
}) {
  return (
    <label className="export-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      <span>
        {label}
        {hint !== undefined && <span className="muted export-hint">{hint}</span>}
      </span>
    </label>
  );
}

const PADDINGS = [0, 16, 32, 64] as const;

export function ExportDialog() {
  const app = useApp();
  const { editor, persistence, ui } = app;
  const state = useSyncExternalStore(editor.subscribe, editor.getState);
  const hasSelection = selectedIds(state).length > 0;
  const [opts, setOpts] = useState<ExportOptions>(() => ({
    ...remembered,
    scope: hasSelection ? 'selection' : 'all',
  }));
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const scopeOpts: ExportOptions = hasSelection ? opts : { ...opts, scope: 'all' };
  const size = exportSize(state, scopeOpts);

  const update = (patch: Partial<ExportOptions>): void => {
    setOpts((o) => {
      const next = { ...o, ...patch };
      remembered = next;
      return next;
    });
  };

  // Debounced preview; the scene rarely changes while the dialog is open.
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    const effective: ExportOptions = hasSelection ? opts : { ...opts, scope: 'all' };
    const timer = setTimeout(() => {
      void renderPreview(state, effective, persistence.images, PREVIEW_SIDE).then((blob) => {
        if (cancelled) return;
        url = blob ? URL.createObjectURL(blob) : null;
        setPreview(url);
      });
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [state, opts, hasSelection, persistence.images]);

  const close = (): void => {
    ui.dialog.set(null);
  };

  const withBlob = async (fn: (blob: Blob) => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      const blob = await renderExport(state, scopeOpts, persistence.images);
      if (!blob) {
        ui.notify(t('export.empty'), 'error');
        return;
      }
      await fn(blob);
    } finally {
      setBusy(false);
    }
  };

  const save = (): void => {
    void withBlob(async (blob) => {
      const name = `${safeFileName(persistence.session.getInfo().name)}.${scopeOpts.format}`;
      try {
        const result = await saveFile(blob, name, null, [FILE_TYPES[scopeOpts.format]]);
        if (result.kind === 'cancelled') return;
        ui.notify(t('file.savedTo', { name: result.handle?.name ?? name }));
        close();
      } catch {
        ui.notify(t('file.error.write'), 'error');
      }
    });
  };

  const copy = (): void => {
    void withBlob(async (blob) => {
      try {
        if (scopeOpts.format === 'svg') {
          await navigator.clipboard.writeText(await blob.text());
        } else {
          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        }
        ui.notify(t('export.copied'));
      } catch {
        ui.notify(t('export.copyFailed'), 'error');
      }
    });
  };

  const scaleOptions = ([1, 2, 3] as const).map((s) => ({ value: s, label: `${String(s)}×` }));

  return (
    <Dialog title={t('export.title')} onClose={close} className="export-dialog">
      <div className="export-layout">
        <div className="export-preview" aria-label={t('export.preview')} role="img">
          {preview !== null && size ? (
            <img src={preview} alt="" />
          ) : (
            <p className="muted">{t('export.empty')}</p>
          )}
        </div>
        <div className="export-options">
          <Segmented
            label={t('export.format')}
            value={opts.format}
            options={[
              { value: 'png', label: 'PNG' },
              { value: 'svg', label: 'SVG' },
            ]}
            onChange={(format) => {
              update({ format });
            }}
          />
          <Segmented
            label={t('export.scope')}
            value={scopeOpts.scope}
            options={[
              { value: 'selection', label: t('export.scope.selection'), disabled: !hasSelection },
              { value: 'all', label: t('export.scope.all') },
            ]}
            onChange={(scope) => {
              update({ scope });
            }}
          />
          {opts.format === 'png' && (
            <Segmented
              label={t('export.scale')}
              value={opts.scale}
              options={scaleOptions}
              onChange={(scale) => {
                update({ scale });
              }}
            />
          )}
          <Segmented
            label={t('export.padding')}
            value={opts.padding}
            options={PADDINGS.map((p) => ({ value: p, label: String(p) }))}
            onChange={(padding) => {
              update({ padding });
            }}
          />
          <Toggle
            label={t('export.background')}
            checked={opts.background}
            onChange={(background) => {
              update({ background });
            }}
          />
          <Toggle
            label={t('export.dark')}
            checked={opts.dark}
            onChange={(dark) => {
              update({ dark });
            }}
          />
          <Toggle
            label={t('export.embed')}
            checked={opts.embed}
            hint={t('export.embedHint')}
            onChange={(embed) => {
              update({ embed });
            }}
          />
          {size && (
            <p className="muted">
              {t('export.size', { width: String(size.width), height: String(size.height) })}
              {size.clamped && <> · {t('export.tooBig')}</>}
            </p>
          )}
          <div className="dialog-actions export-actions">
            <button
              type="button"
              className="button primary"
              disabled={busy || !size}
              onClick={save}
            >
              {t('export.save')}
            </button>
            <button type="button" className="button" disabled={busy || !size} onClick={copy}>
              {t('export.copy')}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
