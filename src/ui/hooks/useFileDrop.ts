import { useEffect } from 'react';
import { isTabulaFile } from '../../app/persistence';
import { screenToWorld } from '../../core/camera/camera';
import { useApp } from '../app-context';

const hasFiles = (e: DragEvent): boolean => e.dataTransfer?.types.includes('Files') === true;

/**
 * Dropping files anywhere: a `.tabula` file (or an exported image with an
 * embedded scene) opens as a new drawing; other images are inserted where
 * they were dropped.
 */
export function useFileDrop(): void {
  const app = useApp();
  useEffect(() => {
    const onOver = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])];
      const first = files[0];
      if (!first) return;
      if (isTabulaFile(first)) {
        void app.persistence.importFile(first);
        return;
      }
      const state = app.editor.getState();
      const at = screenToWorld(state.camera, { x: e.clientX, y: e.clientY });
      void app.persistence.importSceneImage(first).then((opened) => {
        if (!opened) app.insertImageFiles(files, at);
      });
    };
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [app]);
}
