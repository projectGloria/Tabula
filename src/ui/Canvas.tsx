import { useEffect, useRef } from 'react';
import { clearSelection, panCamera, setViewport, zoomCameraAt } from '../core/actions/actions';
import { selectWithGroups } from '../core/actions/edit-actions';
import { isSelected } from '../core/store/app-state';
import { screenToWorld, wheelZoomFactor } from '../core/camera/camera';
import type { Point } from '../core/geometry/vec';
import { isEditableTarget } from '../core/keymap/keymap';
import { Renderer, type DebugLabels } from '../core/render/renderer';
import type { PointerInput } from '../core/tools';
import type { PointerKind } from '../core/tools/tool';
import { t } from '../i18n/t';
import { useApp } from './app-context';

const debugLabels: DebugLabels = {
  fps: (value) => t('debug.fps', { value }),
  elements: (visible, total) => t('debug.elements', { visible, total }),
  zoom: (value) => t('debug.zoom', { value }),
  cells: (value) => t('debug.cells', { value }),
};

const LINE_HEIGHT_PX = 16;
/** Touch press duration that opens the context menu. */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 8;

interface PanGesture {
  readonly pointerId: number;
  last: Point;
}

interface Pinch {
  readonly a: number;
  readonly b: number;
  mid: Point;
  dist: number;
}

const midpoint = (p: Point, q: Point): Point => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });

export function Canvas() {
  const app = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const sceneCanvas = sceneRef.current;
    const overlay = overlayRef.current;
    if (!container || !sceneCanvas || !overlay) return;
    const { editor, tools, toolContext, isMac, ui } = app;

    const images = app.persistence.images;
    const renderer = new Renderer(
      sceneCanvas,
      overlay,
      editor.getState,
      editor.index,
      debugLabels,
      images,
    );
    const offImages = images.onLoad(() => {
      renderer.invalidate({ scene: true });
    });
    let spaceHeld = false;
    let pan: PanGesture | null = null;
    // Touch: two fingers pinch-zoom and pan. Once a pen has been used, single
    // touches pan instead of drawing (palm rejection).
    const touches = new Map<number, Point>();
    let pinch: Pinch | null = null;
    // Pointers left over from a pinch; ignored until lifted.
    const ignored = new Set<number>();
    let penSeen = false;
    // Pointers whose gesture is open as a history transaction.
    const gestures = new Set<number>();
    const endGesture = (pointerId: number): void => {
      if (gestures.delete(pointerId)) editor.end();
    };

    const updateCursor = (): void => {
      overlay.style.cursor = pan
        ? 'grabbing'
        : spaceHeld
          ? 'grab'
          : tools[editor.getState().activeTool].cursor;
    };

    const unsubscribe = editor.subscribe(() => {
      renderer.onStateChange();
      updateCursor();
    });
    renderer.onStateChange();
    updateCursor();

    // --- Sizing & devicePixelRatio -------------------------------------
    const applySize = (): void => {
      const rect = container.getBoundingClientRect();
      editor.update((s) => setViewport(s, rect.width, rect.height));
      renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    };
    const resizeObserver = new ResizeObserver(applySize);
    resizeObserver.observe(container);
    let dprQuery: MediaQueryList | null = null;
    const watchDpr = (): void => {
      dprQuery?.removeEventListener('change', onDprChange);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprQuery.addEventListener('change', onDprChange);
    };
    const onDprChange = (): void => {
      applySize();
      watchDpr();
    };
    applySize();
    watchDpr();

    // --- Pointer input --------------------------------------------------
    const toScreen = (e: { clientX: number; clientY: number }): Point => {
      const rect = overlay.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const toInput = (e: PointerEvent): PointerInput => {
      const screen = toScreen(e);
      return {
        pointerId: e.pointerId,
        kind: (e.pointerType === 'pen' || e.pointerType === 'touch'
          ? e.pointerType
          : 'mouse') satisfies PointerKind,
        screen,
        world: screenToWorld(editor.getState().camera, screen),
        button: e.button,
        pressure: e.pressure,
        shift: e.shiftKey,
        alt: e.altKey,
        mod: isMac ? e.metaKey : e.ctrlKey,
      };
    };
    const activeTool = () => tools[editor.getState().activeTool];

    /** Selects what is under `screen` (if unselected), then opens the menu there. */
    const openMenuAt = (screen: Point): void => {
      const world = screenToWorld(editor.getState().camera, screen);
      const hit = editor.hitTest(world);
      if (hit === undefined) editor.update(clearSelection);
      else if (!isSelected(editor.getState(), hit))
        editor.update((s) => selectWithGroups(s, [hit], false));
      ui.pointerWorld = world;
      ui.openContextMenu(screen);
    };

    let longPress: { id: number; timer: number; start: Point } | null = null;
    const clearLongPress = (): void => {
      if (longPress) window.clearTimeout(longPress.timer);
      longPress = null;
    };

    /** Second finger down: abort whatever the first one started and pinch. */
    const startPinch = (): void => {
      clearLongPress();
      activeTool().cancel(toolContext);
      for (const id of [...gestures]) endGesture(id);
      pan = null;
      const [a, b] = [...touches.keys()];
      const pa = a === undefined ? undefined : touches.get(a);
      const pb = b === undefined ? undefined : touches.get(b);
      if (a === undefined || b === undefined || !pa || !pb) return;
      pinch = { a, b, mid: midpoint(pa, pb), dist: Math.hypot(pa.x - pb.x, pa.y - pb.y) };
    };
    const movePinch = (p: Pinch): void => {
      const pa = touches.get(p.a);
      const pb = touches.get(p.b);
      if (!pa || !pb) return;
      const mid = midpoint(pa, pb);
      const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      const dx = mid.x - p.mid.x;
      const dy = mid.y - p.mid.y;
      const ratio = p.dist > 0 && dist > 0 ? dist / p.dist : 1;
      p.mid = mid;
      p.dist = dist;
      editor.update((s) => zoomCameraAt(panCamera(s, dx, dy), mid, s.camera.zoom * ratio));
    };
    /** Removes a touch; true when the event belonged to a pinch (or its leftovers). */
    const releaseTouch = (pointerId: number): boolean => {
      touches.delete(pointerId);
      if (ignored.delete(pointerId)) return true;
      if (pinch && (pinch.a === pointerId || pinch.b === pointerId)) {
        const other = pinch.a === pointerId ? pinch.b : pinch.a;
        if (touches.has(other)) ignored.add(other);
        pinch = null;
        return true;
      }
      return false;
    };

    const onPointerDown = (e: PointerEvent): void => {
      overlay.focus({ preventScroll: true });
      overlay.setPointerCapture(e.pointerId);
      if (e.pointerType === 'pen') penSeen = true;
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, toScreen(e));
        if (pinch || touches.size > 2) {
          ignored.add(e.pointerId);
          return;
        }
        if (touches.size === 2) {
          startPinch();
          return;
        }
        if (penSeen) {
          pan = { pointerId: e.pointerId, last: toScreen(e) };
          updateCursor();
          return;
        }
      }
      if (e.button === 1 || (e.button === 0 && spaceHeld)) {
        e.preventDefault();
        pan ??= { pointerId: e.pointerId, last: toScreen(e) };
        updateCursor();
        return;
      }
      if (!gestures.has(e.pointerId)) {
        gestures.add(e.pointerId);
        editor.begin();
      }
      if (e.pointerType === 'touch') {
        clearLongPress();
        const start = toScreen(e);
        const id = e.pointerId;
        const timer = window.setTimeout(() => {
          longPress = null;
          activeTool().cancel(toolContext);
          endGesture(id);
          openMenuAt(start);
        }, LONG_PRESS_MS);
        longPress = { id, timer, start };
      }
      activeTool().onPointerDown(toolContext, toInput(e));
      updateCursor();
    };
    const onPointerMove = (e: PointerEvent): void => {
      const screenPt = toScreen(e);
      ui.pointerWorld = screenToWorld(editor.getState().camera, screenPt);
      if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
        touches.set(e.pointerId, screenPt);
        if (ignored.has(e.pointerId)) return;
        if (pinch) {
          if (pinch.a === e.pointerId || pinch.b === e.pointerId) movePinch(pinch);
          return;
        }
      }
      if (
        longPress?.id === e.pointerId &&
        Math.hypot(screenPt.x - longPress.start.x, screenPt.y - longPress.start.y) >
          LONG_PRESS_SLOP_PX
      ) {
        clearLongPress();
      }
      if (pan) {
        if (pan.pointerId !== e.pointerId) return;
        const p = toScreen(e);
        const dx = p.x - pan.last.x;
        const dy = p.y - pan.last.y;
        pan.last = p;
        editor.update((s) => panCamera(s, dx, dy));
        return;
      }
      const tool = activeTool();
      const samples =
        tool.wantsCoalesced === true && 'getCoalescedEvents' in e ? e.getCoalescedEvents() : [];
      if (samples.length > 0) for (const s of samples) tool.onPointerMove(toolContext, toInput(s));
      else tool.onPointerMove(toolContext, toInput(e));
      updateCursor();
    };
    const onPointerUp = (e: PointerEvent): void => {
      if (longPress?.id === e.pointerId) clearLongPress();
      if (overlay.hasPointerCapture(e.pointerId)) overlay.releasePointerCapture(e.pointerId);
      if (e.pointerType === 'touch' && releaseTouch(e.pointerId)) return;
      if (pan) {
        if (pan.pointerId === e.pointerId) {
          pan = null;
          updateCursor();
        }
        return;
      }
      activeTool().onPointerUp(toolContext, toInput(e));
      endGesture(e.pointerId);
      updateCursor();
    };
    const onPointerCancel = (e: PointerEvent): void => {
      if (longPress?.id === e.pointerId) clearLongPress();
      if (e.pointerType === 'touch' && releaseTouch(e.pointerId)) return;
      if (pan?.pointerId === e.pointerId) {
        pan = null;
        updateCursor();
        return;
      }
      activeTool().cancel(toolContext);
      endGesture(e.pointerId);
    };
    const onDoubleClick = (e: MouseEvent): void => {
      const screen = toScreen(e);
      activeTool().onDoubleClick?.(toolContext, {
        pointerId: -1,
        kind: 'mouse',
        screen,
        world: screenToWorld(editor.getState().camera, screen),
        button: 0,
        pressure: 0,
        shift: e.shiftKey,
        alt: e.altKey,
        mod: isMac ? e.metaKey : e.ctrlKey,
      });
      updateCursor();
    };

    // --- Wheel: pan, Ctrl/⌘ (or trackpad pinch) zooms to cursor ----------
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const unit =
        e.deltaMode === 1 ? LINE_HEIGHT_PX : e.deltaMode === 2 ? container.clientHeight : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (e.ctrlKey || e.metaKey) {
        const point = toScreen(e);
        editor.update((s) => zoomCameraAt(s, point, s.camera.zoom * wheelZoomFactor(dy)));
        return;
      }
      if (e.shiftKey && dx === 0) editor.update((s) => panCamera(s, -dy, 0));
      else editor.update((s) => panCamera(s, -dx, -dy));
    };

    // --- Space-to-pan -----------------------------------------------------
    const isTyping = (e: KeyboardEvent): boolean =>
      isEditableTarget(e.target instanceof HTMLElement ? e.target : null);
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || isTyping(e)) return;
      e.preventDefault();
      if (!spaceHeld) {
        spaceHeld = true;
        updateCursor();
      }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code !== 'Space') return;
      spaceHeld = false;
      updateCursor();
    };
    const onBlur = (): void => {
      for (const id of [...gestures]) endGesture(id);
      spaceHeld = false;
      updateCursor();
    };
    const onContextMenu = (e: MouseEvent): void => {
      e.preventDefault();
      // Touch long-press is handled by the timer above.
      if ((e as PointerEvent).pointerType === 'touch') return;
      openMenuAt(toScreen(e));
    };
    const onPointerLeave = (): void => {
      ui.pointerWorld = null;
    };

    overlay.addEventListener('pointerdown', onPointerDown);
    overlay.addEventListener('pointermove', onPointerMove);
    overlay.addEventListener('pointerup', onPointerUp);
    overlay.addEventListener('pointercancel', onPointerCancel);
    overlay.addEventListener('wheel', onWheel, { passive: false });
    overlay.addEventListener('contextmenu', onContextMenu);
    overlay.addEventListener('dblclick', onDoubleClick);
    overlay.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      overlay.removeEventListener('pointerdown', onPointerDown);
      overlay.removeEventListener('pointermove', onPointerMove);
      overlay.removeEventListener('pointerup', onPointerUp);
      overlay.removeEventListener('pointercancel', onPointerCancel);
      overlay.removeEventListener('wheel', onWheel);
      overlay.removeEventListener('contextmenu', onContextMenu);
      overlay.removeEventListener('dblclick', onDoubleClick);
      overlay.removeEventListener('pointerleave', onPointerLeave);
      clearLongPress();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      dprQuery?.removeEventListener('change', onDprChange);
      resizeObserver.disconnect();
      unsubscribe();
      offImages();
      renderer.dispose();
    };
  }, [app]);

  return (
    <div ref={containerRef} className="canvas-host">
      <canvas ref={sceneRef} className="canvas-layer" aria-hidden="true" />
      <canvas
        ref={overlayRef}
        className="canvas-layer canvas-overlay"
        role="application"
        aria-label={t('canvas.label')}
        tabIndex={0}
      />
    </div>
  );
}
