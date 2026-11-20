import type { ElementStyle, StrokeWidth } from './types';

export const DEFAULT_STYLE: ElementStyle = {
  strokeColor: '#26241f',
  fillColor: '#ffffff',
  fillStyle: 'none',
  strokeWidth: 'medium',
  strokePattern: 'solid',
  roughness: 1,
  opacity: 100,
  corners: 'sharp',
};

/** Stroke width presets in world units. */
export const STROKE_WIDTH_PX: Readonly<Record<StrokeWidth, number>> = {
  thin: 1,
  medium: 2,
  bold: 4,
  extra: 7,
};
