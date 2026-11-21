import { BIND_DISTANCE_PX, bindingFor, findBindTarget, type Bindable } from '../binding/binding';
import type { Point } from '../geometry/vec';
import type { ElementId, PointBinding } from '../model/types';
import type { ToolContext } from './tool';

export interface BindCandidate {
  readonly target: Bindable;
  readonly binding: PointBinding;
}

/**
 * The shape an arrow end dropped at `p` would attach to (Ctrl/⌘ held: none).
 * `exclude` lists the arrow itself and any shape the other end must not share.
 */
export function bindCandidate(
  ctx: ToolContext,
  p: Point,
  mod: boolean,
  exclude: ReadonlySet<ElementId>,
): BindCandidate | null {
  if (mod) return null;
  const state = ctx.getState();
  const tol = BIND_DISTANCE_PX / state.camera.zoom;
  const candidates = ctx.queryBox?.({
    minX: p.x - tol,
    minY: p.y - tol,
    maxX: p.x + tol,
    maxY: p.y + tol,
  });
  const target = findBindTarget(state.scene, p, tol, exclude, candidates);
  return target ? { target, binding: bindingFor(target, p) } : null;
}
