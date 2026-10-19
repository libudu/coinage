import type { Glyph } from "../../core/model";
import { outlinePath } from "../../core/model";

export function GlyphPreview({ glyph }: { glyph: Glyph }) {
  return (
    <svg viewBox="0 0 640 640" aria-hidden="true">
      <g fill={glyph.color}>
        {glyph.strokes
          .filter((s) => s.visible)
          .map((s) => (
            <path key={s.id} d={outlinePath(glyph, s)} />
          ))}
      </g>
    </svg>
  );
}
