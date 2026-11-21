import type { ReactNode } from 'react';

/** Original 20px option icons for the style panel. Stroke follows `currentColor`. */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function FillNoneIcon() {
  return (
    <Glyph>
      <rect x="3.5" y="3.5" width="13" height="13" rx="2" strokeDasharray="2 2.2" />
    </Glyph>
  );
}

export function FillSolidIcon() {
  return (
    <Glyph>
      <rect x="3.5" y="3.5" width="13" height="13" rx="2" fill="currentColor" />
    </Glyph>
  );
}

export function FillHatchIcon() {
  return (
    <Glyph>
      <rect x="3.5" y="3.5" width="13" height="13" rx="2" />
      <path d="M4 10.5 10.5 4M4 15.5 15.5 4M9.5 16 16 9.5" strokeWidth="1.1" />
    </Glyph>
  );
}

export function FillCrossHatchIcon() {
  return (
    <Glyph>
      <rect x="3.5" y="3.5" width="13" height="13" rx="2" />
      <path
        d="M4 10.5 10.5 4M4 15.5 15.5 4M9.5 16 16 9.5M9.5 4 16 10.5M4 4.5 15.5 16M4 9.5 10.5 16"
        strokeWidth="1"
      />
    </Glyph>
  );
}

export function AlignLeftIcon() {
  return (
    <Glyph>
      <path d="M4 5.5h12M4 10h8M4 14.5h10" />
    </Glyph>
  );
}

export function AlignCenterIcon() {
  return (
    <Glyph>
      <path d="M4 5.5h12M6 10h8M5 14.5h10" />
    </Glyph>
  );
}

export function AlignRightIcon() {
  return (
    <Glyph>
      <path d="M4 5.5h12M8 10h8M6 14.5h10" />
    </Glyph>
  );
}

export function VAlignTopIcon() {
  return (
    <Glyph>
      <path d="M4 4h12M10 7.5v8.5M7 10.5l3-3 3 3" />
    </Glyph>
  );
}

export function VAlignMiddleIcon() {
  return (
    <Glyph>
      <path d="M4 10h12M10 3.5v3.5M10 13v3.5M8 5.5l2 1.5 2-1.5M8 14.5l2-1.5 2 1.5" />
    </Glyph>
  );
}

export function VAlignBottomIcon() {
  return (
    <Glyph>
      <path d="M4 16h12M10 12.5V4M7 9.5l3 3 3-3" />
    </Glyph>
  );
}

export function WidthIcon({ weight }: { weight: number }) {
  return (
    <Glyph>
      <path d="M4 10h12" strokeWidth={weight} />
    </Glyph>
  );
}

export function PatternSolidIcon() {
  return (
    <Glyph>
      <path d="M3.5 10h13" strokeWidth="2" />
    </Glyph>
  );
}

export function PatternDashedIcon() {
  return (
    <Glyph>
      <path d="M3.5 10h13" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="butt" />
    </Glyph>
  );
}

export function PatternDottedIcon() {
  return (
    <Glyph>
      <path d="M4 10h12" strokeWidth="2.2" strokeDasharray="0 4" />
    </Glyph>
  );
}

export function RoughCleanIcon() {
  return (
    <Glyph>
      <path d="M3.5 13c3-6 9-6 13 0" />
    </Glyph>
  );
}

export function RoughSketchyIcon() {
  return (
    <Glyph>
      <path d="M3.5 13.2c3-6.3 9-5.8 13 .1M3.8 12.6c3.2-5.6 8.6-5.9 12.4.6" strokeWidth="1.2" />
    </Glyph>
  );
}

export function RoughLooseIcon() {
  return (
    <Glyph>
      <path
        d="M3 13.8c2.4-7.4 9.6-6.2 13.6-.5M4.2 12.2c3.6-5 8-6.4 12.1 1.9M3.4 12.9c1.8-2.3 3.3-3.6 5.1-4"
        strokeWidth="1.1"
      />
    </Glyph>
  );
}

export function CornersSharpIcon() {
  return (
    <Glyph>
      <path d="M4 16V4h12" />
    </Glyph>
  );
}

export function CornersRoundedIcon() {
  return (
    <Glyph>
      <path d="M4 16V10a6 6 0 0 1 6-6h6" />
    </Glyph>
  );
}

export function EyedropperIcon() {
  return (
    <Glyph>
      <path d="m11.5 5.5 3 3M13 4a2.1 2.1 0 0 1 3 3l-1.6 1.6-3-3zM11.4 7.1 5 13.5 4 16l2.5-1 6.4-6.4" />
    </Glyph>
  );
}
