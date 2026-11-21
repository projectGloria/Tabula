import type { AppState, GridStyle } from '../store/app-state';

export function toggleGrid(s: AppState): AppState {
  return { ...s, gridVisible: !s.gridVisible };
}

export function toggleGridSnap(s: AppState): AppState {
  return { ...s, gridSnap: !s.gridSnap };
}

export function toggleObjectSnap(s: AppState): AppState {
  return { ...s, objectSnap: !s.objectSnap };
}

export function setGridSize(s: AppState, size: number): AppState {
  const v = Math.max(2, Math.min(200, Math.round(size)));
  return s.gridSize === v ? s : { ...s, gridSize: v };
}

export function setGridStyle(s: AppState, style: GridStyle): AppState {
  return s.gridStyle === style ? s : { ...s, gridStyle: style };
}
