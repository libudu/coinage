import { isDraft, original } from "immer";
import { controls, strokeSegments } from "./geometry";
import type { Glyph, Knot, Point, StrokeSegment } from "./model";

const samePoint = (a?: Point, b?: Point) => a?.x === b?.x && a?.y === b?.y;
const sameHandles = (a: Knot, b: Knot) =>
  a.mode === b.mode &&
  samePoint(a.handle, b.handle) &&
  samePoint(a.handleIn, b.handleIn);
const sameShape = (a: Knot, b: Knot) =>
  sameHandles(a, b) && a.width === b.width && a.join === b.join;

// 连续编辑从事务起点重算，回到原值时恢复控制柄、采样和笔锋边界。
// 插入操作显式替换 segments，直接使用它提供的完整拆分结果。
export function reconcileStrokeGeometry(
  current: Glyph,
  glyph: Glyph,
  origin: Glyph = current,
  handleIds: readonly string[] = [],
) {
  const forced = new Set(handleIds);
  for (const stroke of glyph.strokes) {
    if (!stroke.segments) continue;
    const latest = current.strokes.find((s) => s.id === stroke.id);
    const source = isDraft(stroke.segments)
      ? original(stroke.segments)
      : stroke.segments;
    if (!latest?.segments || source !== latest.segments) continue;
    const initial = origin.strokes.find((s) => s.id === stroke.id);
    const before = initial?.segments ? origin : current;
    const previous = initial?.segments ? initial : latest;
    const nodes = stroke.nodes.map((id) => glyph.nodes[id]);
    const topologyChanged =
      stroke.nodes.length !== previous.nodes.length ||
      stroke.nodes.some((id, i) => id !== previous.nodes[i]);
    const first = nodes[0],
      firstOld = before.nodes[first.id];
    const translation =
      !topologyChanged &&
      firstOld &&
      nodes.every((node) => {
        const old = before.nodes[node.id];
        return (
          old &&
          sameShape(old, node) &&
          Math.abs(node.x - old.x - (first.x - firstOld.x)) < 1e-9 &&
          Math.abs(node.y - old.y - (first.y - firstOld.y)) < 1e-9
        );
      });
    const defaults = () =>
      strokeSegments(glyph, { ...stroke, segments: undefined });
    const used = new Set<number>();
    let changed = topologyChanged || previous.segments !== latest.segments;
    const changedControls = new Set<string>();
    const segments = nodes.slice(1).map((b, i): StrokeSegment => {
      const a = nodes[i];
      const oldIndex = topologyChanged
        ? previous.segments!.findIndex(
            (s, j) => !used.has(j) && s.from === a.id && s.to === b.id,
          )
        : i;
      if (oldIndex < 0) return defaults()[i];
      used.add(oldIndex);
      const segment = previous.segments![oldIndex];
      const oldA = before.nodes[a.id],
        oldB = before.nodes[b.id];
      const changeOut =
          oldA &&
          (forced.has(a.id) ||
            !sameHandles(oldA, a) ||
            (a.mode === "corner" && !samePoint(oldA, a))),
        changeIn =
          oldB &&
          (forced.has(b.id) ||
            !sameHandles(oldB, b) ||
            (b.mode === "corner" && !samePoint(oldB, b)));
      const newCorner =
        segment.endBoundary === false &&
        b.mode === "corner" &&
        oldB &&
        (!samePoint(oldB, b) || oldB.mode !== b.mode || oldB.join !== b.join);
      // 整体平移不会生成转折，也不改变边上的控制柄。
      if (
        (!changeOut && !changeIn && !newCorner) ||
        (translation && !forced.has(a.id) && !forced.has(b.id))
      )
        return segment;
      const [c, d] = controls(nodes, i);
      const result: StrokeSegment = {
        ...segment,
        ...(changeOut ? { handleOut: { x: c.x - a.x, y: c.y - a.y } } : {}),
        ...(changeIn ? { handleIn: { x: d.x - b.x, y: d.y - b.y } } : {}),
      };
      if (newCorner) delete result.endBoundary;
      if (
        samePoint(result.handleOut, segment.handleOut) &&
        samePoint(result.handleIn, segment.handleIn) &&
        result.endBoundary === segment.endBoundary
      )
        return segment;
      changed = true;
      if (segment.sampling) changedControls.add(segment.sampling.group);
      return result;
    });
    const groups = new Map<string, Set<string>>();
    segments.forEach((s) => {
      if (!s.sampling) return;
      const ids = groups.get(s.sampling.group) ?? new Set<string>();
      ids.add(s.from);
      ids.add(s.to);
      groups.set(s.sampling.group, ids);
    });
    const invalid = new Set<string>();
    for (const [group, ids] of groups) {
      const first = [...ids][0],
        origin = before.nodes[first],
        target = glyph.nodes[first];
      const dx = target.x - (origin?.x ?? target.x),
        dy = target.y - (origin?.y ?? target.y);
      if (
        topologyChanged ||
        changedControls.has(group) ||
        [...ids].some((id) => {
          const a = before.nodes[id],
            b = glyph.nodes[id];
          return (
            !a ||
            !sameShape(a, b) ||
            Math.abs(b.x - a.x - dx) > 1e-9 ||
            Math.abs(b.y - a.y - dy) > 1e-9
          );
        })
      )
        invalid.add(group);
    }
    if (invalid.size) changed = true;
    if (changed)
      stroke.segments = segments.map((s) => {
        if (!s.sampling || !invalid.has(s.sampling.group)) return s;
        const { sampling: _, ...segment } = s;
        return segment;
      });
  }
}
