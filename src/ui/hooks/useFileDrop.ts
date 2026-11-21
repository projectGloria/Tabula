import { useEffect } from 'react';
import { isTabulaFile } from '../../app/persistence';
import { useApp } from '../app-context';

const hasFiles = (e: DragEvent): boolean => e.dataTransfer?.types.includes('Files') === true;

/** Dropping a `.tabula` file anywhere opens it as a new drawing. */
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
      const file = e.dataTransfer?.files[0];
      if (file && isTabulaFile(file)) void app.persistence.importFile(file);
    };
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [app]);
}
