import { memo } from "react";
import type { Glyph } from "../../core/model";
import { glyphPath } from "../../core/geometry";
import type { BrushDefaults } from "../../core/brush";

export const GlyphPreview = memo(function GlyphPreview({ glyph, brush }: { glyph: Glyph; brush?: BrushDefaults }) {
  return (
    <svg viewBox="0 0 640 640" aria-hidden="true">
      <path fill={glyph.color} d={glyphPath(glyph, brush)} />
    </svg>
  );
});
