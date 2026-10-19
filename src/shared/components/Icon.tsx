import type { CSSProperties } from "react";
export type IconName =
  | "cursor"
  | "pen"
  | "branch"
  | "hand"
  | "undo"
  | "redo"
  | "upload"
  | "download"
  | "chevron"
  | "plus"
  | "minus"
  | "grid"
  | "eye"
  | "eyeOff"
  | "lock"
  | "unlock"
  | "trash"
  | "copy"
  | "close"
  | "check"
  | "folder"
  | "settings"
  | "fit"
  | "image"
  | "node"
  | "corner"
  | "smooth"
  | "symmetric"
  | "more"
  | "arrow"
  | "shortcut"
  | "file"
  | "reflect"
  | "rotate"
  | "save";
const paths: Record<IconName, React.ReactNode> = {
  cursor: <path d="m5 3 14 9-7 1-3 7z" />,
  pen: (
    <>
      <path d="m15 3 6 6-11 11-7 1 1-7zM12 6l6 6M4 14l6 6" />
    </>
  ),
  branch: (
    <>
      <path d="M6 18V6m0 7 12-7" />
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="19" cy="5" r="2" />
    </>
  ),
  hand: (
    <path d="M8 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 4-3 7-7 7h-1c-3 0-4-2-6-5l-3-5a2 2 0 0 1 3-2l2 2Z" />
  ),
  undo: (
    <>
      <path
        d="m8 5-5 5 5 5M3 10h11a6 6 0 0 1 0 12"
        transform="translate(0 -2)"
      />
    </>
  ),
  redo: (
    <g transform="translate(24 0) scale(-1 1)">
      <path d="m8 3-5 5 5 5M3 8h11a6 6 0 0 1 0 12" />
    </g>
  ),
  upload: (
    <>
      <path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4" />
    </>
  ),
  chevron: <path d="m7 10 5 5 5-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  grid: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 12h16M12 4v16" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="m3 3 18 18M10 5c6-1 12 7 12 7s-2 3-5 5M6 6c-3 2-4 6-4 6s5 8 13 6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V6a4 4 0 0 1 8 0M12 14v3" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M16 8V3H3v13h5" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  folder: <path d="M3 7V4h6l3 3h9v13H3Z" />,
  settings: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="8" cy="18" r="2" />
    </>
  ),
  fit: (
    <>
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8" r="1" />
      <path d="m3 17 6-6 4 4 3-3 5 5" />
    </>
  ),
  node: (
    <>
      <path d="M5 5h14v14H5z" />
      <path d="M3 3h4v4H3zM17 17h4v4h-4z" fill="currentColor" stroke="none" />
    </>
  ),
  corner: (
    <>
      <path d="M3 19 12 5l9 14" />
      <rect
        x="10"
        y="3"
        width="4"
        height="4"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  smooth: (
    <>
      <path d="M2 19C5 19 5 5 12 5s7 14 10 14M5 5h14" />
      <circle cx="12" cy="5" r="2" fill="currentColor" />
    </>
  ),
  symmetric: (
    <>
      <path d="M2 19Q12-9 22 19M4 5h16" />
      <rect x="10" y="3" width="4" height="4" fill="currentColor" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  shortcut: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M6 9h1m3 0h1m3 0h1m3 0h1M6 13h1m3 0h1m3 0h1m3 0h1M7 16h10" />
    </>
  ),
  file: (
    <>
      <path d="M5 2h9l5 5v15H5ZM14 2v6h5M8 13h8M8 17h6" />
    </>
  ),
  reflect: (
    <>
      <path d="M12 2v20M3 7l5 5-5 5zm18 0-5 5 5 5z" />
    </>
  ),
  rotate: (
    <>
      <path d="M4 10a8 8 0 1 1 2 8M4 3v7h7" />
    </>
  ),
  save: (
    <>
      <path d="M4 3h13l4 4v14H3V3ZM7 3v6h9V3M7 21v-8h10v8" />
    </>
  ),
};
export function Icon({
  name,
  size = 18,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
