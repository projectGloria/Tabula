import { useEffect, useRef } from 'react';
import { panCamera, setViewport, zoomCameraAt } from '../core/actions/actions';
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

interface PanGesture {
  readonly pointerId: number;
  last: Point;
}

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
    const { editor, tools, toolContext, isMac } = app;

    const renderer = new Renderer(sceneCanvas, overlay, editor.getState, editor.index, debugLabels);
    let spaceHeld = false;
    let pan: PanGesture | null = null;

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

    const onPointerDown = (e: PointerEvent): void => {
      overlay.focus({ preventScroll: true });
      overlay.setPointerCapture(e.pointerId);
      if (e.button === 1 || (e.button === 0 && spaceHeld)) {
        e.preventDefault();
        pan ??= { pointerId: e.pointerId, last: toScreen(e) };
        updateCursor();
        return;
      }
      activeTool().onPointerDown(toolContext, toInput(e));
    };
    const onPointerMove = (e: PointerEvent): void => {
      if (pan) {
        if (pan.pointerId !== e.pointerId) return;
        const p = toScreen(e);
        const dx = p.x - pan.last.x;
        const dy = p.y - pan.last.y;
        pan.last = p;
        editor.update((s) => panCamera(s, dx, dy));
        return;
      }
      activeTool().onPointerMove(toolContext, toInput(e));
    };
    const onPointerUp = (e: PointerEvent): void => {
      if (overlay.hasPointerCapture(e.pointerId)) overlay.releasePointerCapture(e.pointerId);
      if (pan) {
        if (pan.pointerId === e.pointerId) {
          pan = null;
          updateCursor();
        }
        return;
      }
      activeTool().onPointerUp(toolContext, toInput(e));
    };
    const onPointerCancel = (e: PointerEvent): void => {
      if (pan?.pointerId === e.pointerId) {
        pan = null;
        updateCursor();
        return;
      }
      activeTool().cancel(toolContext);
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
      spaceHeld = false;
      updateCursor();
    };
    const onContextMenu = (e: MouseEvent): void => {
      e.preventDefault();
    };

    overlay.addEventListener('pointerdown', onPointerDown);
    overlay.addEventListener('pointermove', onPointerMove);
    overlay.addEventListener('pointerup', onPointerUp);
    overlay.addEventListener('pointercancel', onPointerCancel);
    overlay.addEventListener('wheel', onWheel, { passive: false });
    overlay.addEventListener('contextmenu', onContextMenu);
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
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      dprQuery?.removeEventListener('change', onDprChange);
      resizeObserver.disconnect();
      unsubscribe();
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
