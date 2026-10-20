import { isBrushDefaults } from "./brush";
import type { Project } from "./model";

function validSegments(value: unknown, nodes: string[]) {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length !== nodes.length - 1) return false;
  const completed = new Set<string>();
  let group: { id: string; end: number; steps: number } | undefined;
  for (const [i, segment] of value.entries()) {
    if (
      !segment ||
      typeof segment !== "object" ||
      segment.from !== nodes[i] ||
      segment.to !== nodes[i + 1] ||
      ![segment.handleOut, segment.handleIn].every(
        (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y),
      ) ||
      (segment.endBoundary !== undefined && segment.endBoundary !== false)
    )
      return false;
    const sample = segment.sampling;
    if (sample !== undefined) {
      if (
        !sample ||
        typeof sample !== "object" ||
        typeof sample.group !== "string" ||
        !sample.group ||
        !Number.isFinite(sample.start) ||
        !Number.isFinite(sample.end) ||
        sample.start < 0 ||
        sample.end > 1 ||
        sample.start >= sample.end ||
        !Number.isInteger(sample.steps) ||
        sample.steps < 1 ||
        sample.steps > 10000
      )
        return false;
    }
    if (group && group.id !== sample?.group) {
      if (group.end !== 1) return false;
      completed.add(group.id);
      group = undefined;
    }
    if (sample) {
      if (
        completed.has(sample.group) ||
        (group
          ? sample.start !== group.end || sample.steps !== group.steps
          : sample.start !== 0)
      )
        return false;
      group = { id: sample.group, end: sample.end, steps: sample.steps };
    }
  }
  return !group || group.end === 1;
}

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
          g.nodes &&
          typeof g.nodes === "object" &&
          !Array.isArray(g.nodes) &&
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
              validSegments(s.segments, s.nodes) &&
              s.nodes.every(
                (id) => typeof id === "string" && Object.hasOwn(g.nodes, id),
              ),
          ),
      )
    );
  } catch {
    return false;
  }
}
