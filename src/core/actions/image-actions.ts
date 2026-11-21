import type { Point } from '../geometry/vec';
import { createImage, insertElements } from '../model/scene';
import type { ImageElement } from '../model/types';
import type { AppState } from '../store/app-state';
import { setSelection } from './actions';

export interface ImagePlacement {
  readonly fileId: string;
  readonly width: number;
  readonly height: number;
}

const GAP = 16;

/**
 * Inserts images side by side, centered on `center`, selects them and
 * switches to the select tool.
 */
export function insertImages(
  state: AppState,
  images: readonly ImagePlacement[],
  center: Point,
): AppState {
  if (images.length === 0) return state;
  const total = images.reduce((sum, i) => sum + i.width, 0) + GAP * (images.length - 1);
  let x = center.x - total / 2;
  const created: ImageElement[] = images.map((img) => {
    const el = createImage({
      x,
      y: center.y - img.height / 2,
      width: img.width,
      height: img.height,
      fileId: img.fileId,
    });
    x += img.width + GAP;
    return el;
  });
  const scene = insertElements(state.scene, created);
  return setSelection(
    { ...state, scene, activeTool: 'select' },
    created.map((e) => e.id),
  );
}
