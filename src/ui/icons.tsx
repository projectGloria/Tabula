import type { ReactNode } from 'react';

/** Original 24px line icons. Stroke follows `currentColor`. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function SelectIcon() {
  return (
    <Icon>
      <path d="M6 4.5 17.5 12l-5.2 1.3 3 5.6-2.1 1.1-3-5.6L6 18z" />
    </Icon>
  );
}

export function RectangleIcon() {
  return (
    <Icon>
      <rect x="4.5" y="6" width="15" height="12" rx="1.2" />
    </Icon>
  );
}

export function DiamondIcon() {
  return (
    <Icon>
      <path d="M12 4.2 19.8 12 12 19.8 4.2 12z" />
    </Icon>
  );
}

export function EllipseIcon() {
  return (
    <Icon>
      <ellipse cx="12" cy="12" rx="8" ry="6.5" />
    </Icon>
  );
}

export function LineIcon() {
  return (
    <Icon>
      <path d="M5.5 18.5 18.5 5.5" />
    </Icon>
  );
}

export function ArrowIcon() {
  return (
    <Icon>
      <path d="M5.5 18.5 18 6" />
      <path d="M11.5 5.5H18.5V12.5" />
    </Icon>
  );
}

export function PencilIcon() {
  return (
    <Icon>
      <path d="M4.5 19.5 5.6 15 15.8 4.8a1.9 1.9 0 0 1 2.7 0l.7.7a1.9 1.9 0 0 1 0 2.7L9 18.4z" />
      <path d="M14 6.6 17.4 10" />
    </Icon>
  );
}

export function TextIcon() {
  return (
    <Icon>
      <path d="M5.5 6.5V5h13v1.5" />
      <path d="M12 5v14" />
      <path d="M9.5 19h5" />
    </Icon>
  );
}

export function UndoIcon() {
  return (
    <Icon>
      <path d="M9 7 5 11l4 4" />
      <path d="M5 11h9a5 5 0 0 1 0 10h-2" />
    </Icon>
  );
}

export function RedoIcon() {
  return (
    <Icon>
      <path d="m15 7 4 4-4 4" />
      <path d="M19 11h-9a5 5 0 0 0 0 10h2" />
    </Icon>
  );
}

export function ToFrontIcon() {
  return (
    <Icon>
      <rect x="9" y="9" width="10" height="10" rx="1" fill="currentColor" fillOpacity="0.25" />
      <path d="M5 15V6a1 1 0 0 1 1-1h9" strokeDasharray="2 2" />
    </Icon>
  );
}

export function ForwardIcon() {
  return (
    <Icon>
      <path d="M12 19V7" />
      <path d="m7 11 5-5 5 5" />
    </Icon>
  );
}

export function BackwardIcon() {
  return (
    <Icon>
      <path d="M12 5v12" />
      <path d="m7 13 5 5 5-5" />
    </Icon>
  );
}

export function ToBackIcon() {
  return (
    <Icon>
      <rect x="5" y="5" width="10" height="10" rx="1" strokeDasharray="2 2" />
      <path d="M9 19h9a1 1 0 0 0 1-1V9" />
    </Icon>
  );
}

/** Alignment icons: a guide line plus two bars of different length. */
export function AlignIcon({
  kind,
}: {
  kind: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';
}) {
  const horizontalGuide = kind === 'top' || kind === 'centerY' || kind === 'bottom';
  if (!horizontalGuide) {
    const gx = kind === 'left' ? 5 : kind === 'right' ? 19 : 12;
    const bar = (w: number) => (kind === 'left' ? 7 : kind === 'right' ? 17 - w : 12 - w / 2);
    return (
      <Icon>
        <path d={`M${String(gx)} 4v16`} />
        <rect x={bar(10)} y="7" width="10" height="4" rx="1" />
        <rect x={bar(6)} y="14" width="6" height="4" rx="1" />
      </Icon>
    );
  }
  const gy = kind === 'top' ? 5 : kind === 'bottom' ? 19 : 12;
  const bar = (h: number) => (kind === 'top' ? 7 : kind === 'bottom' ? 17 - h : 12 - h / 2);
  return (
    <Icon>
      <path d={`M4 ${String(gy)}h16`} />
      <rect x="7" y={bar(10)} width="4" height="10" rx="1" />
      <rect x="14" y={bar(6)} width="4" height="6" rx="1" />
    </Icon>
  );
}

export function DistributeIcon({ axis }: { axis: 'x' | 'y' }) {
  return (
    <Icon>
      <g transform={axis === 'y' ? 'rotate(90 12 12)' : undefined}>
        <path d="M4 4v16M20 4v16" />
        <rect x="9.5" y="8" width="5" height="8" rx="1" />
      </g>
    </Icon>
  );
}

export function GroupIcon() {
  return (
    <Icon>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" strokeDasharray="2.5 2.5" />
      <rect x="7" y="7" width="5" height="5" rx="0.8" />
      <circle cx="15" cy="15" r="2.6" />
    </Icon>
  );
}

export function UngroupIcon() {
  return (
    <Icon>
      <rect x="4" y="4" width="6" height="6" rx="0.8" />
      <circle cx="17" cy="17" r="3" />
      <path d="M13 6h5v5M6 13v5h5" strokeDasharray="2 2" />
    </Icon>
  );
}

export function LockIcon() {
  return (
    <Icon>
      <rect x="5.5" y="10.5" width="13" height="9" rx="1.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </Icon>
  );
}

export function DuplicateIcon() {
  return (
    <Icon>
      <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
      <path d="M15.5 5.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9.5a1 1 0 0 0 1 1h.5" />
    </Icon>
  );
}

export function TrashIcon() {
  return (
    <Icon>
      <path d="M4.5 7h15M10 4h4" />
      <path d="M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" />
      <path d="M10 11v6M14 11v6" />
    </Icon>
  );
}

export function FlipIcon({ axis }: { axis: 'horizontal' | 'vertical' }) {
  return (
    <Icon>
      <g transform={axis === 'vertical' ? 'rotate(90 12 12)' : undefined}>
        <path d="M12 3v18" strokeDasharray="2 2" />
        <path d="M9 7 4 17h5z" />
        <path d="M15 7l5 10h-5z" fill="currentColor" fillOpacity="0.25" />
      </g>
    </Icon>
  );
}
