import { useEffect, useRef, type CSSProperties } from 'react';
import { closeTextEditor, setTextContent } from '../core/actions/text-actions';
import { worldToScreen } from '../core/camera/camera';
import { fontString, LINE_HEIGHT } from '../core/text/fonts';
import { t } from '../i18n/t';
import { useApp } from './app-context';
import { useEditorState } from './hooks/useEditorState';

/**
 * Inline textarea laid exactly over the text being edited. The canvas skips
 * painting that element meanwhile. Closes on blur, Escape or Mod+Enter.
 */
export function TextEditor() {
  const app = useApp();
  const id = useEditorState((s) => s.editingText);
  const el = useEditorState((s) => {
    const e = s.editingText === null ? undefined : s.scene.entities[s.editingText];
    return e?.type === 'text' ? e : null;
  });
  const camera = useEditorState((s) => s.camera);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = ref.current;
    if (!ta || id === null) return;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, [id]);

  useEffect(() => {
    // The element vanished (e.g. its container was deleted): close the editor.
    if (id !== null && el === null) app.editor.update(closeTextEditor);
  }, [app, id, el]);

  if (id === null || el === null) return null;

  const close = (): void => {
    app.editor.update(closeTextEditor);
  };

  const z = camera.zoom;
  const center = worldToScreen(camera, { x: el.x + el.width / 2, y: el.y + el.height / 2 });
  const fixed = el.sizing === 'fixed';
  // Auto text gets slack so the caret never wraps before the layout catches up.
  const slack = fixed ? 0 : el.fontSize * z;
  const shift = el.textAlign === 'left' ? 0 : el.textAlign === 'center' ? slack / 2 : slack;
  const width = el.width * z + slack;
  const height = el.height * z;
  const style: CSSProperties = {
    left: center.x - (el.width * z) / 2 - shift,
    top: center.y - height / 2,
    width: Math.max(width, 4),
    height: Math.max(height, el.fontSize * LINE_HEIGHT * z),
    font: fontString(el.fontFamily, el.fontSize * z),
    lineHeight: String(LINE_HEIGHT),
    color: el.style.strokeColor,
    opacity: el.style.opacity / 100,
    textAlign: el.textAlign,
    whiteSpace: fixed ? 'pre-wrap' : 'pre',
    transform: el.angle === 0 ? undefined : `rotate(${String(el.angle)}rad)`,
    transformOrigin: `${String((el.width * z) / 2 + shift)}px ${String(height / 2)}px`,
  };

  return (
    <textarea
      ref={ref}
      className="text-editor"
      style={style}
      value={el.text}
      aria-label={t('text.editorLabel')}
      spellCheck
      wrap={fixed ? 'soft' : 'off'}
      onChange={(e) => {
        const value = e.target.value;
        app.editor.update((s) => setTextContent(s, id, value));
      }}
      onBlur={close}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          close();
        }
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
    />
  );
}
