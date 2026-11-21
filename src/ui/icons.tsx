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
