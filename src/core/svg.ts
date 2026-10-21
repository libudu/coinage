import { glyphPath } from "./geometry";
import type { BrushDefaults } from "./brush";
import type { Glyph } from "./model";

const xml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function exportSvg(
  g: Glyph,
  defaults?: BrushDefaults,
  color = g.color,
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="640" height="640"><title>${xml(g.name)}</title><path fill="${xml(color)}" d="${glyphPath(g, defaults)}"/></svg>`;
}
