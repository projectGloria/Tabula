import { boxExpand, type Box } from './box';
import { rectAABB } from './rect';
import { STROKE_WIDTH_PX } from '../model/style';
import type { SceneElement } from '../model/types';

/** Visual AABB of an element in world units, including half the stroke width. */
export function elementBounds(el: SceneElement): Box {
  switch (el.type) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- single-variant union until M2 adds shapes
    case 'rectangle':
      return boxExpand(rectAABB(el), STROKE_WIDTH_PX[el.style.strokeWidth] / 2);
  }
}
