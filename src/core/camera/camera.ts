import type { Box } from '../geometry/box';
import type { Point } from '../geometry/vec';

/**
 * Camera: `x`/`y` is the world point shown at the viewport's top-left corner.
 * screen = (world - camera) * zoom.  Screen units are CSS pixels.
 */
export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 30;
export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function screenToWorld(cam: Camera, p: Point): Point {
  return { x: p.x / cam.zoom + cam.x, y: p.y / cam.zoom + cam.y };
}

export function worldToScreen(cam: Camera, p: Point): Point {
  return { x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom };
}

/** Pans by a screen-space delta (content follows the pointer). */
export function panBy(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  return { ...cam, x: cam.x - dxScreen / cam.zoom, y: cam.y - dyScreen / cam.zoom };
}

/** Zooms to `zoom` (clamped) keeping the world point under `screenPoint` fixed. */
export function zoomAt(cam: Camera, screenPoint: Point, zoom: number): Camera {
  const next = clampZoom(zoom);
  if (next === cam.zoom) return cam;
  const anchor = screenToWorld(cam, screenPoint);
  return { x: anchor.x - screenPoint.x / next, y: anchor.y - screenPoint.y / next, zoom: next };
}

/** World-space box currently visible in the viewport. */
export function visibleWorldBox(cam: Camera, vp: Viewport): Box {
  return {
    minX: cam.x,
    minY: cam.y,
    maxX: cam.x + vp.width / cam.zoom,
    maxY: cam.y + vp.height / cam.zoom,
  };
}

/** Converts a wheel delta to a multiplicative zoom factor. */
export function wheelZoomFactor(deltaY: number): number {
  const clamped = Math.max(-100, Math.min(100, deltaY));
  return Math.exp(-clamped * 0.002);
}
