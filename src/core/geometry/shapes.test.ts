import { describe, expect, it } from 'vitest';
import { createArrow, createBoxElement, createFreedraw, mutateElement } from '../model/scene';
import { normalizeAngle, snapAngle, SNAP_ANGLE } from './angle';
import { elementBounds } from './element-bounds';
import { localToWorld, pointsPatchFromWorld, worldPointsOf } from './element-geometry';
import { distanceToEllipseOutline, pointInEllipse } from './ellipse';
import { distanceToPolyline, distanceToSegment, pointInPolygon } from './segment';
import { strokeOutline } from './stroke-outline';

const close = (a: number, b: number, eps = 1e-6) => {
  expect(Math.abs(a - b)).toBeLessThan(eps);
};

describe('segments', () => {
  it('measures distance to a segment, clamped at the ends', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBe(3);
    expect(distanceToSegment({ x: -3, y: 4 }, a, b)).toBe(5);
    expect(distanceToSegment({ x: 2, y: 2 }, a, a)).toBeCloseTo(Math.SQRT2 * 2);
  });

  it('measures distance to a polyline', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(distanceToPolyline({ x: 12, y: 5 }, pts)).toBe(2);
    expect(distanceToPolyline({ x: 0, y: 0 }, [])).toBe(Infinity);
  });

  it('tests point in polygon', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false);
  });
});

describe('ellipse', () => {
  it('is exact on the axes', () => {
    close(distanceToEllipseOutline({ x: 0, y: 0 }, 50, 20), 20);
    close(distanceToEllipseOutline({ x: 60, y: 0 }, 50, 20), 10);
    close(distanceToEllipseOutline({ x: 0, y: -25 }, 50, 20), 5);
  });

  it('is accurate off-axis (compared to dense sampling)', () => {
    const a = 80;
    const b = 30;
    for (const p of [
      { x: 30, y: 25 },
      { x: -70, y: 10 },
      { x: 10, y: -40 },
      { x: 100, y: 60 },
    ]) {
      let best = Infinity;
      for (let i = 0; i < 20000; i++) {
        const t = (i / 20000) * Math.PI * 2;
        best = Math.min(best, Math.hypot(p.x - a * Math.cos(t), p.y - b * Math.sin(t)));
      }
      close(distanceToEllipseOutline(p, a, b), best, 1e-2);
    }
  });

  it('handles degenerate axes and containment', () => {
    close(distanceToEllipseOutline({ x: 3, y: 15 }, 0, 10), Math.hypot(3, 5));
    expect(pointInEllipse({ x: 49, y: 0 }, 50, 20)).toBe(true);
    expect(pointInEllipse({ x: 40, y: 15 }, 50, 20)).toBe(false);
  });
});

describe('angles', () => {
  it('normalizes into [0, 2π)', () => {
    close(normalizeAngle(-Math.PI / 2), (3 * Math.PI) / 2);
    close(normalizeAngle(5 * Math.PI), Math.PI);
    expect(normalizeAngle(Math.PI * 2)).toBe(0);
  });
  it('snaps to 15°', () => {
    close(snapAngle((22 * Math.PI) / 180), SNAP_ANGLE);
    close(snapAngle((23 * Math.PI) / 180), 2 * SNAP_ANGLE);
  });
});

describe('pointsPatchFromWorld', () => {
  it('normalizes points so the local box starts at 0,0', () => {
    const p = pointsPatchFromWorld(0, [
      { x: 50, y: 80 },
      { x: 10, y: 100 },
    ]);
    expect(p).toEqual({
      x: 10,
      y: 80,
      width: 40,
      height: 20,
      points: [
        { x: 40, y: 0 },
        { x: 0, y: 20 },
      ],
    });
  });

  it('round-trips world points for a rotated element', () => {
    const world = [
      { x: 13, y: -7 },
      { x: 90, y: 40 },
      { x: 55, y: 120 },
    ];
    const angle = 0.7;
    const el = mutateElement(createArrow({ x: 0, y: 0 }), {
      ...pointsPatchFromWorld(angle, world),
      angle,
    });
    worldPointsOf(el).forEach((p, i) => {
      close(p.x, world[i]?.x ?? NaN);
      close(p.y, world[i]?.y ?? NaN);
    });
  });
});

describe('strokeOutline', () => {
  it('surrounds every input point', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 20, y: 5 },
      { x: 40, y: 0 },
    ];
    const outline = strokeOutline(pts, [6, 6, 6]);
    for (const p of pts) expect(pointInPolygon(p, outline)).toBe(true);
    expect(pointInPolygon({ x: 20, y: 20 }, outline)).toBe(false);
  });

  it('renders a single point as a dot', () => {
    const outline = strokeOutline([{ x: 5, y: 5 }], [4]);
    expect(outline.length).toBeGreaterThan(8);
    expect(pointInPolygon({ x: 5, y: 5 }, outline)).toBe(true);
  });
});

describe('elementBounds', () => {
  it('covers a rotated ellipse box plus half the stroke', () => {
    const el = createBoxElement('ellipse', { x: 0, y: 0, width: 100, height: 40 });
    const b = elementBounds(el);
    expect(b).toEqual({ minX: -1, minY: -1, maxX: 101, maxY: 41 });
  });

  it('pads arrows by the head size and freedraw by its max width', () => {
    const arrow = mutateElement(createArrow({ x: 0, y: 0 }), {
      ...pointsPatchFromWorld(0, [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    });
    expect(elementBounds(arrow).minY).toBeLessThan(-5);
    const fd = createFreedraw({ x: 10, y: 10 });
    const b = elementBounds(fd);
    expect(b.minX).toBeLessThan(10);
    expect(b.maxX).toBeGreaterThan(10);
  });

  it('localToWorld honours rotation about the center', () => {
    const el = {
      ...createBoxElement('rectangle', { x: 0, y: 0, width: 100, height: 100 }),
      angle: Math.PI / 2,
    };
    const p = localToWorld(el, { x: 0, y: 0 });
    close(p.x, 100);
    close(p.y, 0);
  });
});
