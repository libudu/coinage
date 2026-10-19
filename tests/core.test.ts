import { test } from "node:test";
import assert from "node:assert/strict";
import {
  controls,
  demoProject,
  emptyGlyph,
  exportSvg,
  glyphPath,
  isProject,
  newStroke,
  outlinePath,
} from "../src/core/model";
import { defaultTrace, makeMask, traceRaster } from "../src/features/tracing/trace";
import type { Raster } from "../src/features/tracing/trace";
import type { Point } from "../src/core/model";

// SVG's default nonzero fill rule, for checking the actual filled outline.
function pathCoverage(path: string): (point: Point) => boolean {
  const polygons = path.split("Z").map((subpath) =>
    [...subpath.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(
      ([, x, y]) => ({ x: +x, y: +y }),
    ),
  );
  return (point) => {
    let winding = 0;
    for (const vertices of polygons)
      vertices.forEach((a, i) => {
        const b = vertices[(i + 1) % vertices.length];
        const cross =
          (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y);
        if (a.y <= point.y && b.y > point.y && cross > 0) winding++;
        if (a.y > point.y && b.y <= point.y && cross < 0) winding--;
      });
    return winding !== 0;
  };
}
const containsPoint = (path: string, point: Point) => pathCoverage(path)(point);

test("shared endpoints join like a continuous stroke for every cap and corner style", () => {
  const g = emptyGlyph("connected zigzag");
  [[260, 50], [120, 190], [350, 290], [100, 360], [350, 500]].forEach(
    ([x, y], i) => {
      const id = String(i);
      g.nodes[id] = { id, x, y, width: 40 + i * 4, mode: "corner" };
    },
  );
  const continuous = newStroke(Object.keys(g.nodes), 0);
  for (const cap of ["butt", "round", "square"] as const) {
    for (const join of ["miter", "round", "bevel"] as const) {
      for (const reverse of [false, true]) {
        continuous.cap = cap;
        continuous.join = join;
        g.strokes = continuous.nodes.slice(1).map((id, i) => {
          const ids = [String(i), id];
          return {
            ...newStroke(reverse && i % 2 ? ids.reverse() : ids, i),
            cap,
            join,
          };
        });
        const outlines = g.strokes.map((s) => pathCoverage(outlinePath(g, s)));
        const combined = pathCoverage(glyphPath(g));
        const expected = pathCoverage(outlinePath({ ...g, strokes: [continuous] }, continuous));
        for (let y = 20.37; y < 540; y += 5)
          for (let x = 40.37; x < 430; x += 5) {
            const p = { x, y };
            assert.equal(
              outlines.some((contains) => contains(p)),
              expected(p),
              `${cap}/${join}, reversed=${reverse}, point=${x},${y}`,
            );
            assert.equal(combined(p), expected(p));
          }
      }
    }
  }
});

test("only visible shared endpoints affect joins, without changing project data", () => {
  const g = emptyGlyph("junction");
  g.nodes.a = { id: "a", x: 100, y: 100, width: 40, mode: "corner" };
  g.nodes.b = { id: "b", x: 200, y: 100, width: 40, mode: "corner" };
  g.nodes.c = { id: "c", x: 200, y: 200, width: 40, mode: "corner" };
  const s = newStroke(["a", "b"], 0),
    peer = newStroke(["b", "c"], 1);
  g.strokes = [s, peer];
  peer.locked = true;
  const before = structuredClone(g);
  assert.ok(containsPoint(outlinePath(g, s), { x: 210, y: 85 }));
  assert.deepEqual(g, before);
  g.nodes.b.join = "bevel";
  assert.ok(!containsPoint(outlinePath(g, s), { x: 215, y: 85 }));
  delete g.nodes.b.join;
  peer.visible = false;
  const isolated = outlinePath(g, s);
  assert.ok(!containsPoint(isolated, { x: 205, y: 95 }));
  peer.visible = true;
  g.nodes.copy = { ...g.nodes.b, id: "copy" };
  peer.nodes[0] = "copy";
  assert.equal(outlinePath(g, s), isolated);
});
function raster(
  w: number,
  h: number,
  ink: (x: number, y: number) => boolean,
): Raster {
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4,
        v = ink(x, y) ? 0 : 255;
      pixels.set([v, v, v, 255], i);
    }
  return { pixels, width: w, height: h };
}
test("straight strokes retain width and produce editable endpoints", () => {
  const g = traceRaster(
    raster(120, 120, (x, y) => x >= 20 && x < 100 && y >= 50 && y < 70),
    defaultTrace,
    "line",
  );
  assert.equal(g.strokes.length, 1);
  assert.equal(g.strokes[0].nodes.length, 2);
  for (const n of Object.values(g.nodes))
    assert.ok(n.width > 90 && n.width < 115);
  assert.ok(!/NaN|Infinity/.test(exportSvg(g)));
});
test("crossing strokes share a junction node", () => {
  const g = traceRaster(
    raster(
      120,
      120,
      (x, y) =>
        (x >= 54 && x < 66 && y > 15 && y < 105) ||
        (y >= 54 && y < 66 && x > 15 && x < 105),
    ),
    defaultTrace,
    "cross",
  );
  assert.equal(g.strokes.length, 4);
  const counts = new Map<string, number>();
  g.strokes
    .flatMap((s) => [s.nodes[0], s.nodes[s.nodes.length - 1]])
    .forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
  assert.ok([...counts.values()].includes(4));
});
test("closed shapes remain closed and retain their empty center", () => {
  const g = traceRaster(
    raster(120, 120, (x, y) => {
      const d = Math.hypot(x - 60, y - 60);
      return d > 30 && d < 40;
    }),
    defaultTrace,
    "ring",
  );
  assert.equal(g.strokes.length, 1);
  const s = g.strokes[0];
  assert.equal(s.nodes[0], s.nodes[s.nodes.length - 1]);
  assert.equal((outlinePath(g, s).match(/M/g) || []).length, 2);
});
test("transparent pixels and light checkerboard are not ink", () => {
  const r = raster(5, 5, () => false);
  r.pixels.set([0, 0, 0, 0], (2 * 5 + 2) * 4);
  r.pixels.set([190, 190, 190, 255], (1 * 5 + 1) * 4);
  r.pixels.set([122, 38, 29, 255], (3 * 5 + 3) * 4);
  const mask = makeMask(r, defaultTrace);
  assert.equal(
    mask.reduce((a, b) => a + b, 0),
    1,
  );
});
test("noise is discarded without losing separate strokes", () => {
  const g = traceRaster(
    raster(
      160,
      160,
      (x, y) =>
        (x > 20 && x < 140 && ((y > 40 && y < 51) || (y > 100 && y < 111))) ||
        (x === 5 && y === 5),
    ),
    defaultTrace,
    "two",
  );
  assert.equal(g.strokes.length, 2);
});
test("blank input produces an actionable error", () => {
  assert.throws(
    () =>
      traceRaster(
        raster(50, 50, () => false),
        defaultTrace,
        "blank",
      ),
    /没有检测到笔画/,
  );
});
test("round caps extend beyond endpoints and variable widths survive export", () => {
  const g = emptyGlyph("width");
  g.nodes.a = { id: "a", x: 100, y: 100, width: 20, mode: "corner" };
  g.nodes.b = { id: "b", x: 200, y: 100, width: 40, mode: "corner" };
  const s = newStroke(["a", "b"], 0);
  s.cap = "round";
  g.strokes.push(s);
  const d = outlinePath(g, s);
  assert.ok(d.includes("220,100"));
  assert.ok(d.includes("90,100"));
  assert.ok(d.includes("100,110"));
  assert.ok(d.includes("200,120"));
  assert.ok(!/NaN|Infinity/.test(d));
});
test("SVG exports real paths, escapes names, and omits hidden strokes", () => {
  const g = demoProject().glyphs[0];
  g.name = "<script>bad</script>";
  g.strokes[0].visible = false;
  const svg = exportSvg(g);
  assert.equal((svg.match(/<path /g) || []).length, 1);
  assert.ok(svg.includes(`d="${g.strokes.filter((s) => s.visible).map((s) => outlinePath(g, s)).join(" ")}"`));
  assert.ok(svg.includes("&lt;script&gt;"));
  assert.ok(!svg.includes("<image"));
  assert.ok(!svg.includes("<script>"));
});
test("project validation rejects broken references and untrusted markup", () => {
  const p = demoProject();
  assert.ok(isProject(p));
  assert.ok(isProject(JSON.parse(JSON.stringify(p))));
  const broken = structuredClone(p);
  broken.glyphs[0].strokes[0].nodes.push("absent");
  assert.equal(isProject(broken), false);
  const malicious = structuredClone(p);
  malicious.glyphs[0].reference = "javascript:alert(1)";
  assert.equal(isProject(malicious), false);
  for (const value of [
    null,
    [],
    {},
    { ...p, glyphs: [null] },
    { ...p, glyphs: [{ id: p.activeId }] },
  ])
    assert.equal(isProject(value), false);
});
test("a local corner override changes only the stroke containing that node", () => {
  const g = demoProject().glyphs[0],
    s = g.strokes[0],
    before = outlinePath(g, s);
  g.nodes[s.nodes[1]].join = "round";
  assert.notEqual(outlinePath(g, s), before);
  assert.equal(s.join, "miter");
});
test("smooth handles keep independent lengths while symmetric handles mirror", () => {
  const a = {
      id: "a",
      x: 100,
      y: 200,
      width: 40,
      mode: "smooth" as const,
      handle: { x: 60, y: 0 },
      handleIn: { x: -20, y: 0 },
    },
    b = {
      id: "b",
      x: 300,
      y: 200,
      width: 40,
      mode: "smooth" as const,
      handle: { x: 60, y: 0 },
      handleIn: { x: -20, y: 0 },
    };
  assert.equal(controls([a, b], 0)[1].x, 280);
  assert.equal(controls([a, { ...b, mode: "symmetric" }], 0)[1].x, 240);
});
