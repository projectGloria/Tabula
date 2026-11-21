import type { ElementStyle, Roughness, StrokeWidth } from './types';

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

/** Base wobble amplitude (world units) per roughness level, before size scaling. */
export const ROUGHNESS_AMP: Readonly<Record<Roughness, number>> = { 0: 0, 1: 1.1, 2: 2.8 };
