import type { GlyphEffects } from "../../core/glyphEffects";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { BrushDefaults } from "../../core/brush";
import type { Glyph } from "../../core/model";
import type { EffectScene } from "./effectRenderer";
import "./EffectPreview.css";

export function EffectPreview({
  glyphs,
  brush,
  effects,
  active = true,
  className = "",
  children,
}: {
  glyphs: readonly Glyph[];
  brush?: BrushDefaults;
  effects: GlyphEffects;
  active?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<EffectScene | null>(null);
  const latest = useRef({ glyphs, brush, effects });
  latest.current = { glyphs, brush, effects };
  const enabled = glyphs.length > 0 && effects.type !== "none";
  useEffect(() => {
    if (!active || !enabled || !host.current || !window.WebGL2RenderingContext)
      return;
    let disposed = false;
    let current: EffectScene | null = null;
    void import("./effectRenderer")
      .then(async ({ createEffectScene }) => {
        if (disposed || !host.current) return;
        current = await createEffectScene(host.current);
        if (disposed) {
          current.destroy();
          return;
        }
        scene.current = current;
        current.update(
          latest.current.glyphs,
          latest.current.brush,
          latest.current.effects,
        );
      })
      .catch(() => {
        current?.destroy();
        if (scene.current === current) scene.current = null;
      });
    return () => {
      disposed = true;
      current?.destroy();
      if (scene.current === current) scene.current = null;
    };
  }, [active, enabled]);
  useEffect(() => {
    scene.current?.update(glyphs, brush, effects);
  });
  return (
    <div ref={host} className={`glyph-effects-preview relative ${className}`}>
      {children}
    </div>
  );
}
