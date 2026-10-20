import {
  distance,
  segmentSampleSteps,
  strokeControls,
  strokeSegments,
} from "../../core/geometry";
import type { Glyph, Point, Stroke } from "../../core/model";
import { selectionLocked } from "./nodeSelection";

export type StrokeEdge = {
  strokeId: string;
  index: number;
  from: string;
  to: string;
};

const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
const relative = (p: Point, origin: Point): Point => ({
  x: p.x - origin.x,
  y: p.y - origin.y,
});
const cubic = (a: Point, c: Point, d: Point, b: Point, t: number): Point => {
  const s = 1 - t;
  return {
    x: s ** 3 * a.x + 3 * s * s * t * c.x + 3 * s * t * t * d.x + t ** 3 * b.x,
    y: s ** 3 * a.y + 3 * s * s * t * c.y + 3 * s * t * t * d.y + t ** 3 * b.y,
  };
};

// 在画布坐标中寻找右键所指的边，避免把点击位置直接用作新节点位置。
export function findStrokeEdge(glyph: Glyph, stroke: Stroke, point: Point) {
  const nodes = stroke.nodes.map((id) => glyph.nodes[id]);
  let best = Infinity;
  let edge: StrokeEdge | undefined;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i],
      b = nodes[i + 1];
    const [c, d] = strokeControls(nodes, stroke, i);
    let previous: Point = a;
    for (let step = 1; step <= 40; step++) {
      const next = cubic(a, c, d, b, step / 40);
      const dx = next.x - previous.x,
        dy = next.y - previous.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared
        ? Math.max(
            0,
            Math.min(
              1,
              ((point.x - previous.x) * dx + (point.y - previous.y) * dy) /
                lengthSquared,
            ),
          )
        : 0;
      const gap = distance(point, {
        x: previous.x + dx * t,
        y: previous.y + dy * t,
      });
      if (gap < best) {
        best = gap;
        edge = { strokeId: stroke.id, index: i, from: a.id, to: b.id };
      }
      previous = next;
    }
  }
  return edge;
}

function edgeGeometry(glyph: Glyph, edge: StrokeEdge) {
  const stroke = glyph.strokes.find((s) => s.id === edge.strokeId);
  if (
    !stroke ||
    !stroke.visible ||
    stroke.locked ||
    !Number.isInteger(edge.index) ||
    edge.index < 0 ||
    stroke.nodes[edge.index] !== edge.from ||
    stroke.nodes[edge.index + 1] !== edge.to ||
    selectionLocked(glyph, [edge.from, edge.to])
  )
    return;
  const nodes = stroke.nodes.map((id) => glyph.nodes[id]);
  const a = nodes[edge.index],
    b = nodes[edge.index + 1];
  const [c, d] = strokeControls(nodes, stroke, edge.index);
  const sampling = stroke.segments?.[edge.index].sampling;
  if (sampling) {
    const middle = (sampling.start + sampling.end) / 2;
    if (middle <= sampling.start || middle >= sampling.end) return;
  }
  const ac = midpoint(a, c),
    cd = midpoint(c, d),
    db = midpoint(d, b);
  const left = midpoint(ac, cd),
    right = midpoint(cd, db);
  const point = midpoint(left, right);
  if (point.x < 0 || point.x > 640 || point.y < 0 || point.y > 640) return;
  return { stroke, nodes, a, b, c, d, ac, db, left, right, point };
}

export function canInsertEdgeMidpoint(glyph: Glyph, edge: StrokeEdge) {
  return !!edgeGeometry(glyph, edge);
}

export function insertEdgeMidpoint(glyph: Glyph, edge: StrokeEdge, id: string) {
  const geometry = edgeGeometry(glyph, edge);
  if (!geometry || glyph.nodes[id]) return false;
  const { stroke, a, b, c, d, ac, db, left, right, point } = geometry;
  const segments = [...strokeSegments(glyph, stroke)];
  const original = segments[edge.index];
  // 沿用原边的采样参数，插入点不新增笔锋边界或改变填充轮廓。
  const sampling = original.sampling ?? {
    group: id,
    start: 0,
    end: 1,
    steps: segmentSampleSteps(a, b, c, d),
  };
  const middle = (sampling.start + sampling.end) / 2;
  const straight =
    sampling.steps === 1 && a.mode === "corner" && b.mode === "corner";
  glyph.nodes[id] = {
    id,
    ...point,
    width: (a.width + b.width) / 2,
    mode: straight ? "corner" : "smooth",
    ...(!straight
      ? { handle: relative(right, point), handleIn: relative(left, point) }
      : {}),
  };
  segments.splice(
    edge.index,
    1,
    {
      from: a.id,
      to: id,
      handleOut: relative(ac, a),
      handleIn: relative(left, point),
      endBoundary: false,
      sampling: { ...sampling, end: middle },
    },
    {
      from: id,
      to: b.id,
      handleOut: relative(right, point),
      handleIn: relative(db, b),
      ...(original.endBoundary === false ? { endBoundary: false } : {}),
      sampling: { ...sampling, start: middle },
    },
  );
  stroke.nodes.splice(edge.index + 1, 0, id);
  stroke.segments = segments;
  return true;
}
