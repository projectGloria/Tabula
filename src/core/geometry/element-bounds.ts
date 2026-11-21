import { boxExpand, boxFromPoints, type Box } from './box';
import { worldPointsOf } from './element-geometry';
import { arrowheadSize, freedrawMaxWidth, hasArrowheads, strokePx } from './element-shape';
import { rectAABB } from './rect';
import type { SceneElement } from '../model/types';

/** Visual AABB of an element in world units, including stroke and decorations. */
export function elementBounds(el: SceneElement): Box {
  const stroke = strokePx(el);
  switch (el.type) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse':
      return boxExpand(rectAABB(el), stroke / 2);
    case 'line':
    case 'arrow':
    case 'freedraw': {
      const box = boxFromPoints(worldPointsOf(el)) ?? rectAABB(el);
      let pad = stroke / 2;
      if (el.type === 'arrow' && hasArrowheads(el)) pad = Math.max(pad, arrowheadSize(stroke));
      if (el.type === 'freedraw') pad = freedrawMaxWidth(stroke) / 2;
      return boxExpand(box, pad);
    }
  }
}
