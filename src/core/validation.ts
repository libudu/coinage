import { isBrushDefaults } from "./brush";
import type { Project } from "./model";

export function isProject(value: unknown): value is Project {
  try {
    if (!value || typeof value !== "object") return false;
    const p = value as Project;
    if (!Array.isArray(p.glyphs)) return false;
    for (const g of p.glyphs)
      for (const n of Object.values(g.nodes)) {
        if (n.join && !["miter", "round", "bevel"].includes(n.join))
          return false;
        if (
          n.handleIn &&
          (!Number.isFinite(n.handleIn.x) || !Number.isFinite(n.handleIn.y))
        )
          return false;
      }
    return (
      p.version === 1 &&
      (p.brush === undefined || isBrushDefaults(p.brush)) &&
      Array.isArray(p.glyphs) &&
      p.glyphs.length > 0 &&
      p.glyphs.length <= 100 &&
      p.glyphs.some((g) => g.id === p.activeId) &&
      new Set(p.glyphs.map((g) => g.id)).size === p.glyphs.length &&
      p.glyphs.every(
        (g) =>
          typeof g.id === "string" &&
          typeof g.name === "string" &&
          (g.description === undefined || typeof g.description === "string") &&
          /^#[0-9a-f]{6}$/i.test(g.color) &&
          (!g.reference ||
            /^data:image\/(png|jpeg|webp);base64,/.test(g.reference)) &&
          Number.isFinite(g.referenceOpacity) &&
          g.referenceOpacity >= 0 &&
          g.referenceOpacity <= 100 &&
          g.nodes && typeof g.nodes === "object" && !Array.isArray(g.nodes) &&
          Object.values(g.nodes).length < 20000 &&
          Object.entries(g.nodes).every(
            ([key, n]) =>
              n.id === key &&
              Number.isFinite(n.x) &&
              Number.isFinite(n.y) &&
              n.x >= 0 &&
              n.x <= 640 &&
              n.y >= 0 &&
              n.y <= 640 &&
              Number.isFinite(n.width) &&
              n.width >= 1 &&
              n.width <= 200 &&
              ["corner", "smooth", "symmetric"].includes(n.mode) &&
              (!n.handle ||
                (Number.isFinite(n.handle.x) && Number.isFinite(n.handle.y))),
          ) &&
          Array.isArray(g.strokes) &&
          new Set(g.strokes.map((s) => s.id)).size === g.strokes.length &&
          g.strokes.every(
            (s) =>
              typeof s.id === "string" &&
              typeof s.name === "string" &&
              typeof s.visible === "boolean" &&
              typeof s.locked === "boolean" &&
              ["butt", "round", "square"].includes(s.cap) &&
              ["miter", "round", "bevel"].includes(s.join) &&
              Array.isArray(s.nodes) &&
              s.nodes.length >= 2 &&
              s.nodes.every((id) => typeof id === "string" && Object.hasOwn(g.nodes, id)),
          ),
      )
    );
  } catch {
    return false;
  }
}
