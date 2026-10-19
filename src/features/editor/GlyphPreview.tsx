import type { Glyph } from "../../core/model";
import { glyphPath } from "../../core/model";

export function GlyphPreview({ glyph }: { glyph: Glyph }) {
  return (
    <svg viewBox="0 0 640 640" aria-hidden="true">
      <path fill={glyph.color} d={glyphPath(glyph)} />
    </svg>
  );
}
