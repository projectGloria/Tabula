import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  screenToWorld,
  visibleWorldBox,
  wheelZoomFactor,
  worldToScreen,
  zoomAt,
  type Camera,
} from './camera';

describe('camera', () => {
  const cam: Camera = { x: 100, y: -50, zoom: 2 };

  it('round-trips world ↔ screen', () => {
    const w = { x: 123.5, y: -7.25 };
    const back = screenToWorld(cam, worldToScreen(cam, w));
    expect(back.x).toBeCloseTo(w.x, 10);
    expect(back.y).toBeCloseTo(w.y, 10);
  });

  it('keeps the world point under the cursor fixed while zooming', () => {
    const cursor = { x: 320, y: 240 };
    const before = screenToWorld(cam, cursor);
    const next = zoomAt(cam, cursor, 5.5);
    const after = screenToWorld(next, cursor);
    expect(next.zoom).toBe(5.5);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('clamps zoom to 10%–3000% and returns the same camera at the limit', () => {
    expect(zoomAt(cam, { x: 0, y: 0 }, 1000).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(cam, { x: 0, y: 0 }, 0.0001).zoom).toBe(MIN_ZOOM);
    const max = zoomAt(cam, { x: 0, y: 0 }, MAX_ZOOM);
    expect(zoomAt(max, { x: 5, y: 5 }, MAX_ZOOM * 2)).toBe(max);
  });

  it('pans content with the pointer', () => {
    const next = panBy(cam, 20, 10);
    // The world point that was at (0,0) should now be at (20,10).
    const s = worldToScreen(next, screenToWorld(cam, { x: 0, y: 0 }));
    expect(s.x).toBeCloseTo(20);
    expect(s.y).toBeCloseTo(10);
  });

  it('computes the visible world box', () => {
    expect(visibleWorldBox(cam, { width: 800, height: 600 })).toEqual({
      minX: 100,
      minY: -50,
      maxX: 500,
      maxY: 250,
    });
  });

  it('maps wheel deltas symmetrically', () => {
    expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(10_000)).toBe(wheelZoomFactor(100));
  });
});
