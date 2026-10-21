import { memo } from "react";
import type { Glyph } from "../../core/model";
import { glyphPath } from "../../core/geometry";
import type { BrushDefaults } from "../../core/brush";

export const GlyphPreview = memo(function GlyphPreview({
  glyph,
  brush,
  color = glyph.color,
}: {
  glyph: Glyph;
  brush?: BrushDefaults;
  color?: string;
}) {
  return (
    <svg viewBox="0 0 640 640" aria-hidden="true">
      <path fill={color} d={glyphPath(glyph, brush)} />
    </svg>
  );
});
