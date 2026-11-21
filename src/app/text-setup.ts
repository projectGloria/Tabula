import type { Editor } from '../core/store/editor';
import { relayoutAllText } from '../core/text/bound';
import {
  createCanvasMeasurer,
  invalidateMeasurements,
  setTextMeasurer,
} from '../core/text/measure';

/**
 * Installs canvas-backed text measurement and re-lays out all text whenever
 * web fonts finish loading (metrics change when a fallback is replaced).
 */
export function installTextMeasurement(editor: Editor): void {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return;
  const measurer = createCanvasMeasurer(ctx);
  setTextMeasurer(measurer);

  const relayout = (): void => {
    measurer.clear();
    invalidateMeasurements();
    // A fresh scene object forces a repaint even when no size changed.
    editor.update((s) => ({ ...s, scene: { ...relayoutAllText(s.scene) } }), {
      history: 'skip',
    });
  };
  relayout();
  document.fonts.addEventListener('loadingdone', relayout);
  void document.fonts.ready.then(relayout);
}
