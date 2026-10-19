import { applyBrushProfile, defaultBrush } from "./brush";
import type { BrushDefaults, BrushSample } from "./brush";
import type { Glyph, Knot, Point, Stroke } from "./model";

export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export function controls(nodes: Knot[], i: number): [Point, Point] {
  const a = nodes[i],
    b = nodes[i + 1],
    before = nodes[Math.max(0, i - 1)],
    after = nodes[Math.min(nodes.length - 1, i + 2)];
  const span = distance(a, b);
  const tangent = (n: Knot, prev: Knot, next: Knot, sign: number): Point => {
    if (n.mode === "corner") return { x: n.x, y: n.y };
    if (sign < 0 && n.handleIn && n.mode === "smooth")
      return { x: n.x + n.handleIn.x, y: n.y + n.handleIn.y };
    if (n.handle)
      return { x: n.x + n.handle.x * sign, y: n.y + n.handle.y * sign };
    const len = distance(prev, next) || 1,
      scale = Math.min(span / 3, distance(prev, next) / 6);
    return {
      x: n.x + ((next.x - prev.x) / len) * scale * sign,
      y: n.y + ((next.y - prev.y) / len) * scale * sign,
    };
  };
  return [tangent(a, before, b, 1), tangent(b, a, after, -1)];
}
export function centerPath(g: Glyph, stroke: Stroke) {
  const nodes = stroke.nodes.map((id) => g.nodes[id]).filter(Boolean);
  if (!nodes.length) return "";
  let d = `M${nodes[0].x},${nodes[0].y}`;
  for (let i = 0; i < nodes.length - 1; i++) {
    const [a, b] = controls(nodes, i),
      end = nodes[i + 1];
    d += ` C${a.x},${a.y} ${b.x},${b.y} ${end.x},${end.y}`;
  }
  return d;
}
type Sample = BrushSample & { corner?: boolean; join?: Knot["join"] };
function samples(g: Glyph, stroke: Stroke): Sample[] {
  const nodes = stroke.nodes.map((id) => g.nodes[id]).filter(Boolean),
    out: Sample[] = [];
  if (nodes.length < 2) return nodes;
  out.push({ ...nodes[0], corner: true, boundary: true });
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i],
      b = nodes[i + 1],
      [c, d] = controls(nodes, i);
    const steps =
      a.mode === "corner" && b.mode === "corner"
        ? 1
        : Math.max(8, Math.ceil(distance(a, b) / 5));
    for (let j = 1; j <= steps; j++) {
      const t = j / steps,
        s = 1 - t;
      const p = {
        x:
          s ** 3 * a.x +
          3 * s * s * t * c.x +
          3 * s * t * t * d.x +
          t ** 3 * b.x,
        y:
          s ** 3 * a.y +
          3 * s * s * t * c.y +
          3 * s * t * t * d.y +
          t ** 3 * b.y,
        width: a.width + (b.width - a.width) * t,
        corner: j === steps && b.mode === "corner",
        join: b.join,
        boundary: j === steps,
      };
      if (distance(out[out.length - 1], p) > 0.05) out.push(p);
    }
  }
  return out;
}
const norm = (a: Point, b: Point) => {
  const d = distance(a, b) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
};
const fmt = (n: number) => Math.round(n * 100) / 100;

// Two visible arms sharing an endpoint form a corner, even when they belong
// to separate strokes. Do not guess a continuation at a branching junction.
function connectedSample(
  g: Glyph,
  stroke: Stroke,
  id: string,
): Sample | undefined {
  if (
    !stroke.visible ||
    stroke.nodes.filter((node) => node === id).length !== 1
  )
    return;
  let peer: Stroke | undefined;
  for (const candidate of g.strokes) {
    if (candidate.id === stroke.id || !candidate.visible) continue;
    const indices = candidate.nodes.flatMap((node, i) => (node === id ? [i] : []));
    if (!indices.length) continue;
    if (
      peer ||
      indices.length !== 1 ||
      (indices[0] !== 0 && indices[0] !== candidate.nodes.length - 1)
    )
      return;
    peer = candidate;
  }
  if (!peer) return;
  const adjacent = samples(g, peer);
  return peer.nodes[0] === id ? adjacent[1] : adjacent[adjacent.length - 2];
}

// Every shared endpoint is occupied, including T/cross junctions where
// connectedSample deliberately cannot choose a single continuation.
export function tipIsConnected(g: Glyph, stroke: Stroke, end: "start" | "end") {
  const id =
    end === "start" ? stroke.nodes[0] : stroke.nodes[stroke.nodes.length - 1];
  return (
    stroke.nodes.filter((node) => node === id).length > 1 ||
    g.strokes.some((s) => s.id !== stroke.id && s.visible && s.nodes.includes(id))
  );
}

export function outlinePath(g: Glyph, stroke: Stroke, defaults?: BrushDefaults): string {
  const brush = defaults ?? defaultBrush;
  let points = samples(g, stroke);
  if (points.length < 2) return "";
  const closed =
    stroke.nodes.length > 2 &&
    stroke.nodes[0] === stroke.nodes[stroke.nodes.length - 1];
  if (closed && distance(points[0], points[points.length - 1]) < 0.05)
    points.pop();
  const startConnection = closed
      ? undefined
      : connectedSample(g, stroke, stroke.nodes[0]),
    endConnection = closed
      ? undefined
      : connectedSample(g, stroke, stroke.nodes[stroke.nodes.length - 1]);
  const startTip =
      closed || tipIsConnected(g, stroke, "start")
        ? "none"
        : brush.startTip || "none",
    endTip =
      closed || tipIsConnected(g, stroke, "end")
        ? "none"
        : brush.endTip || "none",
    startCap = defaults === undefined ? stroke.cap : "butt",
    endCap = defaults === undefined ? stroke.cap : "butt";
  if (!closed)
    points = applyBrushProfile(points, startTip, endTip, brush.startBrush, brush.endBrush);
  const left: Point[] = [],
    right: Point[] = [];
  const arc = (
    p: Point,
    radius: number,
    start: number,
    sweep: number,
    steps = 10,
  ): Point[] =>
    Array.from({ length: steps + 1 }, (_, i) => ({
      x: p.x + Math.cos(start + (sweep * i) / steps) * radius,
      y: p.y + Math.sin(start + (sweep * i) / steps) * radius,
    }));
  points.forEach((p, i) => {
    const prev =
        (i === 0 && startConnection) ||
        points[
          closed ? (i - 1 + points.length) % points.length : Math.max(0, i - 1)
        ],
      next =
        (i === points.length - 1 && endConnection) ||
        points[
          closed ? (i + 1) % points.length : Math.min(points.length - 1, i + 1)
        ],
      incoming = norm(prev, p),
      outgoing = norm(p, next),
      half = p.width / 2;
    if (
      !closed &&
      ((i === 0 && !startConnection) ||
        (i === points.length - 1 && !endConnection))
    ) {
      const v = i === 0 ? outgoing : incoming,
        cap = i === 0 ? startCap : endCap,
        extension = cap === "square" ? (i === 0 ? -half : half) : 0,
        skew = p.brushSkew || 0;
      left.push({
        x: p.x - v.y * half + v.x * (extension + skew),
        y: p.y + v.x * half + v.y * (extension + skew),
      });
      right.push({
        x: p.x + v.y * half + v.x * (extension - skew),
        y: p.y - v.x * half + v.y * (extension - skew),
      });
      return;
    }
    for (const side of [1, -1]) {
      const target = side === 1 ? left : right,
        n1 = { x: -incoming.y * side, y: incoming.x * side },
        n2 = { x: -outgoing.y * side, y: outgoing.x * side },
        sum = { x: n1.x + n2.x, y: n1.y + n2.y },
        denominator = sum.x * n2.x + sum.y * n2.y;
      const turn = incoming.x * outgoing.y - incoming.y * outgoing.x,
        outer = turn * side < 0;
      const join = p.join || stroke.join;
      if (outer && p.corner && join === "round") {
        let sweep = Math.atan2(n2.y, n2.x) - Math.atan2(n1.y, n1.x);
        if (sweep > Math.PI) sweep -= Math.PI * 2;
        if (sweep < -Math.PI) sweep += Math.PI * 2;
        target.push(...arc(p, half, Math.atan2(n1.y, n1.x), sweep));
      } else if (
        Math.abs(denominator) < 0.15 ||
        (outer && p.corner && join === "bevel")
      ) {
        target.push(
          { x: p.x + n1.x * half, y: p.y + n1.y * half },
          { x: p.x + n2.x * half, y: p.y + n2.y * half },
        );
      } else
        target.push({
          x: p.x + (sum.x * half) / denominator +
            outgoing.x * (p.brushSkew || 0) * side,
          y: p.y + (sum.y * half) / denominator +
            outgoing.y * (p.brushSkew || 0) * side,
        });
    }
  });
  const path = (poly: Point[]) =>
    poly.map((p, i) => `${i ? "L" : "M"}${fmt(p.x)},${fmt(p.y)}`).join(" ") +
    "Z";
  if (closed) return path(left) + " " + path(right.reverse());
  const first = points[0],
    last = points[points.length - 1],
    end = norm(points[points.length - 2], last),
    start = norm(first, points[1]);
  const polygon = [...left];
  if (endCap === "round" && !endConnection)
    polygon.push(
      ...arc(last, last.width / 2, Math.atan2(end.x, -end.y), -Math.PI),
    );
  polygon.push(...right.reverse());
  if (startCap === "round" && !startConnection)
    polygon.push(
      ...arc(first, first.width / 2, Math.atan2(-start.x, start.y), -Math.PI),
    );
  return path(polygon);
}
// Fill connected outlines together so antialiasing cannot expose their seams.
export function glyphPath(g: Glyph, defaults?: BrushDefaults): string {
  return g.strokes
    .filter((s) => s.visible)
    .map((s) => outlinePath(g, s, defaults))
    .join(" ");
}
