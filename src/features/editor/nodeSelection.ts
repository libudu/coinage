import { clamp } from "../../core/geometry";
import type { Glyph, Point } from "../../core/model";

export function selectionLocked(glyph: Glyph, ids: readonly string[]) {
  const selected = new Set(ids);
  return glyph.strokes.some((s) => s.locked && s.nodes.some((id) => selected.has(id)));
}

export function selectableNodeIds(glyph: Glyph) {
  const visible = new Set(glyph.strokes.filter((s) => s.visible).flatMap((s) => s.nodes));
  const used = new Set(glyph.strokes.flatMap((s) => s.nodes));
  return Object.keys(glyph.nodes).filter(
    (id) => (visible.has(id) || !used.has(id)) && !selectionLocked(glyph, [id]),
  );
}

// Use one bounded offset for the whole selection so it keeps its shape at edges.
export function translateNodes(
  glyph: Glyph,
  ids: readonly string[],
  offset: Point,
  origin: Glyph = glyph,
) {
  const nodes = [...new Set(ids)]
    .filter((id) => glyph.nodes[id] && origin.nodes[id])
    .map((id) => origin.nodes[id]);
  if (!nodes.length || selectionLocked(glyph, ids)) return false;
  const dx = clamp(offset.x, -Math.min(...nodes.map((n) => n.x)), 640 - Math.max(...nodes.map((n) => n.x)));
  const dy = clamp(offset.y, -Math.min(...nodes.map((n) => n.y)), 640 - Math.max(...nodes.map((n) => n.y)));
  let changed = false;
  nodes.forEach((n) => {
    const target = glyph.nodes[n.id], x = n.x + dx, y = n.y + dy;
    changed ||= target.x !== x || target.y !== y;
    target.x = x;
    target.y = y;
  });
  return changed;
}

export function removeNodes(glyph: Glyph, ids: readonly string[]) {
  if (selectionLocked(glyph, ids)) return;
  const selected = new Set(ids), unused = new Set<string>();
  ids.forEach((id) => delete glyph.nodes[id]);
  glyph.strokes = glyph.strokes.filter((s) => {
    s.nodes = s.nodes.filter((id) => !selected.has(id));
    if (s.nodes.length >= 2) return true;
    s.nodes.forEach((id) => unused.add(id));
    return false;
  });
  const used = new Set(glyph.strokes.flatMap((s) => s.nodes));
  unused.forEach((id) => {
    if (!used.has(id)) delete glyph.nodes[id];
  });
}
