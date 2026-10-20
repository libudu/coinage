import { useId } from "react";

export function ArtboardGrid() {
  const patternId = useId();
  return (
    <g pointerEvents="none" aria-hidden="true" data-artboard-grid="">
      <defs>
        <pattern
          id={patternId}
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="0" cy="0" r=".75" fill="#b7bdb4" />
        </pattern>
      </defs>
      <rect
        width="640"
        height="640"
        fill={`url(#${patternId})`}
        opacity=".65"
      />
      <rect
        x="64"
        y="64"
        width="512"
        height="512"
        fill="none"
        stroke="#cbd0c3"
        strokeWidth=".8"
        strokeDasharray="5 5"
      />
      <path
        d="M320 0V640M0 320H640M64 64 576 576M576 64 64 576"
        stroke="#d3d6ca"
        strokeWidth=".65"
        strokeDasharray="4 5"
      />
    </g>
  );
}
