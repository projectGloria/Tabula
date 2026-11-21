import { addElements, deleteElements, updateElementWith } from '../actions/actions';
import { pointsPatchFromWorld } from '../geometry/element-geometry';
import { distance, type Point } from '../geometry/vec';
import { createFreedraw, mutateElement } from '../model/scene';
import type { ElementId } from '../model/types';
import type { PointerInput, Tool, ToolContext } from './tool';

/** Samples closer than this (screen px) to the previous one are skipped. */
const MIN_SAMPLE_PX = 1;
/** Streamline factor: 0 = raw input, closer to 1 = heavier smoothing. */
const STREAMLINE = 0.5;
/** Screen px per sample at which simulated pressure bottoms out. */
const SPEED_FOR_MIN_PRESSURE = 40;
const MIN_SIM_PRESSURE = 0.25;
/** How fast simulated pressure follows its target (0–1 per sample). */
const PRESSURE_EASE = 0.25;
const DEFAULT_PRESSURE = 0.5;

interface Stroke {
  readonly pointerId: number;
  readonly id: ElementId;
  readonly usePen: boolean;
  readonly points: Point[];
  readonly pressures: number[];
  lastScreen: Point;
  lastRaw: Point;
  smoothed: Point;
  simPressure: number;
}

/** Pen pressure, or 0.5 when the device reports none. */
function penPressure(p: number): number {
  return p > 0 ? p : DEFAULT_PRESSURE;
}

/**
 * Freehand pencil. Pen input uses real pressure; mouse and touch get a
 * simulated, velocity-based pressure (faster = thinner). Stays active after
 * each stroke and does not select it.
 */
export class FreedrawTool implements Tool {
  readonly id = 'freedraw' as const;
  readonly cursor = 'crosshair';
  readonly wantsCoalesced = true;
  private stroke: Stroke | null = null;

  onPointerDown(ctx: ToolContext, e: PointerInput): void {
    if (e.button !== 0 || this.stroke) return;
    const usePen = e.kind === 'pen';
    const pressure = usePen ? penPressure(e.pressure) : DEFAULT_PRESSURE;
    const el = createFreedraw({
      x: e.world.x,
      y: e.world.y,
      pressure,
      style: ctx.getState().styleMemory.freedraw,
    });
    this.stroke = {
      pointerId: e.pointerId,
      id: el.id,
      usePen,
      points: [e.world],
      pressures: [pressure],
      lastScreen: e.screen,
      lastRaw: e.world,
      smoothed: e.world,
      simPressure: DEFAULT_PRESSURE,
    };
    ctx.update((s) => addElements(s, [el]));
  }

  onPointerMove(ctx: ToolContext, e: PointerInput): void {
    const st = this.stroke;
    if (st?.pointerId !== e.pointerId) return;
    const moved = distance(st.lastScreen, e.screen);
    if (moved < MIN_SAMPLE_PX) return;
    st.lastScreen = e.screen;
    st.lastRaw = e.world;
    st.smoothed = {
      x: st.smoothed.x + (e.world.x - st.smoothed.x) * (1 - STREAMLINE),
      y: st.smoothed.y + (e.world.y - st.smoothed.y) * (1 - STREAMLINE),
    };
    st.points.push(st.smoothed);
    st.pressures.push(this.nextPressure(st, e, moved));
    this.sync(ctx);
  }

  onPointerUp(ctx: ToolContext, e: PointerInput): void {
    const st = this.stroke;
    if (st?.pointerId !== e.pointerId) return;
    this.onPointerMove(ctx, e);
    // Land exactly on the last raw sample so the stroke ends where the pointer did.
    const last = st.points[st.points.length - 1];
    if (last && (last.x !== st.lastRaw.x || last.y !== st.lastRaw.y)) {
      st.points.push(st.lastRaw);
      st.pressures.push(st.pressures[st.pressures.length - 1] ?? DEFAULT_PRESSURE);
      this.sync(ctx);
    }
    this.stroke = null;
  }

  cancel(ctx: ToolContext): void {
    const st = this.stroke;
    if (!st) return;
    this.stroke = null;
    ctx.update((s) => deleteElements(s, [st.id]));
  }

  private nextPressure(st: Stroke, e: PointerInput, movedPx: number): number {
    if (st.usePen) return penPressure(e.pressure);
    const target = Math.max(MIN_SIM_PRESSURE, Math.min(1, 1 - movedPx / SPEED_FOR_MIN_PRESSURE));
    st.simPressure += (target - st.simPressure) * PRESSURE_EASE;
    return st.simPressure;
  }

  private sync(ctx: ToolContext): void {
    const st = this.stroke;
    if (!st) return;
    const patch = pointsPatchFromWorld(0, st.points);
    const pressures = [...st.pressures];
    ctx.update((s) =>
      updateElementWith(s, st.id, (el) =>
        el.type === 'freedraw' ? mutateElement(el, { ...patch, pressures }) : el,
      ),
    );
  }
}
