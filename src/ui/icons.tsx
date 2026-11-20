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
