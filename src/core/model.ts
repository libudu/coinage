export type Point = { x: number; y: number };
export type NodeMode = "corner" | "smooth" | "symmetric";
export type Knot = Point & {
  id: string;
  width: number;
  mode: NodeMode;
  handle?: Point;
  handleIn?: Point;
  join?: "miter" | "round" | "bevel";
};
export type Stroke = {
  id: string;
  name: string;
  nodes: string[];
  visible: boolean;
  locked: boolean;
  cap: "butt" | "round" | "square";
  join: "miter" | "round" | "bevel";
};
export type Glyph = {
  id: string;
  name: string;
  nodes: Record<string, Knot>;
  strokes: Stroke[];
  color: string;
  reference?: string;
  referenceOpacity: number;
};
export type Project = {
  version: 1;
  name: string;
  glyphs: Glyph[];
  activeId: string;
};
export const uid = () => crypto.randomUUID();
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const emptyGlyph = (name = "新字符"): Glyph => ({
  id: uid(),
  name,
  nodes: {},
  strokes: [],
  color: "#243d34",
  referenceOpacity: 22,
});
export function newStroke(nodes: string[], count: number): Stroke {
  return {
    id: uid(),
    name: `笔画 ${String(count + 1).padStart(2, "0")}`,
    nodes,
    visible: true,
    locked: false,
    cap: "butt",
    join: "miter",
  };
}

export function demoProject(): Project {
  const shapes = [
    [
      [
        [126, 401],
        [126, 290],
        [320, 116],
        [514, 290],
        [514, 401],
      ],
      [
        [126, 290],
        [240, 290],
        [240, 220],
        [320, 307],
        [402, 190],
      ],
      [
        [320, 116],
        [320, 230],
      ],
      [
        [402, 190],
        [402, 290],
        [514, 290],
      ],
    ],
    [
      [
        [133, 251],
        [133, 351],
        [61, 414],
        [201, 414],
        [320, 537],
        [425, 414],
        [572, 414],
        [477, 337],
        [477, 192],
        [355, 337],
      ],
      [
        [133, 251],
        [175, 215],
        [245, 284],
      ],
    ],
    [
      [
        [105, 167],
        [105, 311],
        [320, 510],
        [535, 311],
        [535, 168],
      ],
      [
        [105, 311],
        [205, 220],
        [205, 376],
      ],
      [
        [205, 292],
        [320, 402],
        [320, 455],
      ],
      [
        [320, 402],
        [424, 290],
        [424, 220],
        [535, 311],
      ],
      [
        [424, 290],
        [424, 414],
      ],
    ],
  ];
  const glyphs = shapes.map((paths, index) => {
    const g = emptyGlyph(`字形 ${String(index + 1).padStart(2, "0")}`);
    const byPosition = new Map<string, string>();
    paths.forEach((coords) => {
      const ids = coords.map(([x, y]) => {
        const key = `${x},${y}`;
        if (byPosition.has(key)) return byPosition.get(key)!;
        const id = uid();
        g.nodes[id] = {
          id,
          x,
          y: index === 0 ? y + 65 : y,
          width: 48,
          mode: "corner",
        };
        byPosition.set(key, id);
        return id;
      });
      g.strokes.push(newStroke(ids, g.strokes.length));
    });
    return g;
  });
  return { version: 1, name: "我的造字手稿", glyphs, activeId: glyphs[0].id };
}

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
type Sample = Point & { width: number; corner?: boolean; join?: Knot["join"] };
function samples(g: Glyph, stroke: Stroke): Sample[] {
  const nodes = stroke.nodes.map((id) => g.nodes[id]).filter(Boolean),
    out: Sample[] = [];
  if (nodes.length < 2) return nodes;
  out.push({ ...nodes[0], corner: true });
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
export function outlinePath(g: Glyph, stroke: Stroke): string {
  const points = samples(g, stroke);
  if (points.length < 2) return "";
  const closed =
    stroke.nodes.length > 2 &&
    stroke.nodes[0] === stroke.nodes[stroke.nodes.length - 1];
  if (closed && distance(points[0], points[points.length - 1]) < 0.05)
    points.pop();
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
        points[
          closed ? (i - 1 + points.length) % points.length : Math.max(0, i - 1)
        ],
      next =
        points[
          closed ? (i + 1) % points.length : Math.min(points.length - 1, i + 1)
        ],
      incoming = norm(prev, p),
      outgoing = norm(p, next),
      half = p.width / 2;
    if (!closed && (i === 0 || i === points.length - 1)) {
      const v = i === 0 ? outgoing : incoming,
        extension = stroke.cap === "square" ? (i === 0 ? -half : half) : 0;
      left.push({
        x: p.x - v.y * half + v.x * extension,
        y: p.y + v.x * half + v.y * extension,
      });
      right.push({
        x: p.x + v.y * half + v.x * extension,
        y: p.y - v.x * half + v.y * extension,
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
          x: p.x + (sum.x * half) / denominator,
          y: p.y + (sum.y * half) / denominator,
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
  if (stroke.cap === "round")
    polygon.push(
      ...arc(last, last.width / 2, Math.atan2(end.x, -end.y), -Math.PI),
    );
  polygon.push(...right.reverse());
  if (stroke.cap === "round")
    polygon.push(
      ...arc(first, first.width / 2, Math.atan2(-start.x, start.y), -Math.PI),
    );
  return path(polygon);
}
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
export function exportSvg(g: Glyph): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="640" height="640"><title>${xml(g.name)}</title><g fill="${xml(g.color)}">${g.strokes
    .filter((s) => s.visible)
    .map((s) => `<path d="${outlinePath(g, s)}"/>`)
    .join("")}</g></svg>`;
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
      typeof p.name === "string" &&
      Array.isArray(p.glyphs) &&
      p.glyphs.length > 0 &&
      p.glyphs.length <= 100 &&
      p.glyphs.some((g) => g.id === p.activeId) &&
      new Set(p.glyphs.map((g) => g.id)).size === p.glyphs.length &&
      p.glyphs.every(
        (g) =>
          typeof g.id === "string" &&
          typeof g.name === "string" &&
          /^#[0-9a-f]{6}$/i.test(g.color) &&
          (!g.reference ||
            /^data:image\/(png|jpeg|webp);base64,/.test(g.reference)) &&
          Number.isFinite(g.referenceOpacity) &&
          g.referenceOpacity >= 0 &&
          g.referenceOpacity <= 100 &&
          g.nodes &&
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
              s.nodes.every((id) => !!g.nodes[id]),
          ),
      )
    );
  } catch {
    return false;
  }
}
