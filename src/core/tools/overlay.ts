import type { Guide } from '../snapping/snapping';
import { EMPTY_OVERLAY, type AppState, type OverlayState } from '../store/app-state';

const sameGuides = (a: readonly Guide[], b: readonly Guide[]): boolean =>
  a.length === b.length &&
  a.every((g, i) => {
    const h = b[i];
    return g.axis === h?.axis && g.at === h.at && g.from === h.from && g.to === h.to;
  });

/** Patches transient overlay chrome, returning `s` unchanged when nothing differs. */
export function setOverlay(s: AppState, patch: Partial<OverlayState>): AppState {
  const o = s.overlay;
  const next: OverlayState = { ...o, ...patch };
  if (
    next.marquee === o.marquee &&
    next.bindTarget === o.bindTarget &&
    sameGuides(next.guides, o.guides)
  ) {
    return s;
  }
  return { ...s, overlay: next };
}

export function clearOverlay(s: AppState): AppState {
  return setOverlay(s, EMPTY_OVERLAY);
}
