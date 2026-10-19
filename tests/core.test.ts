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
import type { Point, Project } from "../src/core/model";
import { brushPresets, changeGlobalBrush, defaultBrush, migrateProjectBrush } from "../src/core/brush";
import { tipIsConnected } from "../src/core/model";

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

function brushFixture(length = 400, width = 40) {
  const g = emptyGlyph("笔锋");
  g.nodes.a = { id: "a", x: 100, y: 100, width, mode: "corner" };
  g.nodes.b = { id: "b", x: 100 + length, y: 100, width, mode: "corner" };
  const s = newStroke(["a", "b"], 0);
  g.strokes = [s];
  return { g, s, brush: structuredClone(defaultBrush) };
}

test("all eight brush presets have distinct slanted ends and a constant-width body", () => {
  const { g, s, brush } = brushFixture();
  const paths = new Set<string>();
  for (const preset of brushPresets) {
    brush.startTip = preset.start;
    brush.endTip = preset.end;
    const path = outlinePath(g, s, brush);
    paths.add(path);
    // Reference shape: 40px body, 54px end and a 12px diagonal cut.
    const startX = preset.start === "horizontal" ? 106 : 94;
    const endX = preset.end === "horizontal" ? 506 : 494;
    assert.ok(path.includes(preset.start === "none" ? "100,120" : `${startX},127`));
    assert.ok(path.includes(preset.end === "none" ? "500,120" : `${endX},127`));
    const contains = pathCoverage(path);
    assert.ok(contains({ x: 300, y: 119 }));
    assert.ok(!contains({ x: 300, y: 121 }));
    const svg = exportSvg(g, brush);
    assert.ok(svg.includes(path));
    assert.ok(!svg.includes("<image"));
  }
  assert.equal(paths.size, 8);
});

test("changing either brush end leaves the opposite end and stored knots unchanged", () => {
  const { g, s, brush } = brushFixture();
  brush.startTip = "horizontal";
  brush.endTip = "vertical";
  const knots = structuredClone(g.nodes);
  const before = pathCoverage(outlinePath(g, s, brush));
  brush.startTip = "vertical";
  const afterStart = pathCoverage(outlinePath(g, s, brush));
  for (let x = 300.3; x < 520; x += 3)
    for (let y = 65.3; y < 135; y += 3)
      assert.equal(before({ x, y }), afterStart({ x, y }));
  brush.endTip = "horizontal";
  const afterEnd = pathCoverage(outlinePath(g, s, brush));
  for (let x = 80.3; x < 300; x += 3)
    for (let y = 65.3; y < 135; y += 3)
      assert.equal(afterStart({ x, y }), afterEnd({ x, y }));
  assert.deepEqual(g.nodes, knots);
});

test("brushes rotate with the path and scale with local width", () => {
  const { g, s, brush } = brushFixture();
  brush.startTip = "horizontal";
  brush.endTip = "vertical";
  const vertices = (d: string) => [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)]
    .map(([, x, y]) => ({ x: +x, y: +y }));
  const original = vertices(outlinePath(g, s, brush));
  for (const n of Object.values(g.nodes)) {
    const x = n.x;
    n.x = 200 - n.y;
    n.y = x;
  }
  assert.deepEqual(vertices(outlinePath(g, s, brush)), original.map(({ x, y }) => ({ x: 200 - y, y: x })));
  g.nodes.a.width = 20;
  g.nodes.b.width = 80;
  const tapered = outlinePath(g, s, brush);
  assert.ok(tapered.includes("86.5,103"));
  assert.ok(tapered.includes("46,488"));
});

test("short, wide strokes keep ordered sides and an unflared middle", () => {
  for (const length of [0.1, 1, 5, 20]) {
    const { g, s, brush } = brushFixture(length, 200);
    for (const preset of brushPresets) {
      brush.startTip = preset.start;
      brush.endTip = preset.end;
      const path = outlinePath(g, s, brush);
      assert.ok(!/NaN|Infinity/.test(path));
      assert.ok(containsPoint(path, { x: 100 + length / 2, y: 100 }));
      const lower = [...path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)]
        .map(([, x, y]) => ({ x: +x, y: +y })).filter((p) => p.y > 100);
      assert.ok(lower.every((p, i) => i === 0 || p.x >= lower[i - 1].x));
      assert.ok(!containsPoint(path, { x: 100 + length / 2, y: 201 }));
    }
  }
});

test("brush flares end before an interior knot and follow curved strokes", () => {
  const { g, s, brush } = brushFixture();
  g.nodes.c = { id: "c", x: 120, y: 100, width: 40, mode: "corner" };
  s.nodes = ["a", "c", "b"];
  brush.startTip = "horizontal";
  brush.endTip = "none";
  const path = outlinePath(g, s, brush);
  assert.ok(path.includes("116,120"));
  assert.ok(!containsPoint(path, { x: 120, y: 123 }));
  g.nodes.a.mode = "smooth";
  g.nodes.a.handle = { x: 0, y: 100 };
  s.nodes = ["a", "b"];
  const curve = outlinePath(g, s, brush);
  assert.ok(!/NaN|Infinity/.test(curve));
  assert.ok(containsPoint(curve, { x: 100, y: 110 }));
  assert.ok(!containsPoint(curve, { x: 300, y: 100 }));
});

test("shared, branching and closed endpoints suppress brushes without deleting settings", () => {
  for (const kind of ["continuation", "branch", "interior", "closed", "repeated"] as const) {
    const { g, s, brush } = brushFixture();
    g.nodes.c = { id: "c", x: 500, y: 300, width: 40, mode: "corner" };
    g.nodes.d = { id: "d", x: 600, y: 100, width: 40, mode: "corner" };
    if (kind === "closed") s.nodes = ["b", "a", "c", "b"];
    else if (kind === "repeated") s.nodes = ["a", "b", "c", "b"];
    else {
      const peer = newStroke(kind === "interior" ? ["c", "b", "d"] : ["b", "c"], 1);
      peer.locked = true;
      g.strokes.push(peer);
      if (kind === "branch") g.strokes.push(newStroke(["b", "d"], 2));
    }
    const plain = outlinePath(g, s, brush);
    assert.ok(tipIsConnected(g, s, "end"), kind);
    brush.endTip = "horizontal";
    if (kind === "closed") brush.startTip = "vertical";
    const before = structuredClone(g);
    assert.equal(outlinePath(g, s, brush), plain, kind);
    assert.deepEqual(g, before);
  }
});

test("hiding or disconnecting a peer restores a saved brush", () => {
  const { g, s, brush } = brushFixture();
  brush.endTip = "horizontal";
  const isolated = outlinePath(g, s, brush);
  g.nodes.c = { id: "c", x: 500, y: 300, width: 40, mode: "corner" };
  const peer = newStroke(["b", "c"], 1);
  g.strokes.push(peer);
  assert.notEqual(outlinePath(g, s, brush), isolated);
  peer.visible = false;
  assert.equal(outlinePath(g, s, brush), isolated);
  peer.visible = true;
  g.nodes.copy = { ...g.nodes.b, id: "copy" };
  peer.nodes[0] = "copy";
  assert.equal(outlinePath(g, s, brush), isolated);
});

test("optional brush fields preserve v1 projects and reject malformed values", () => {
  const p = demoProject();
  const s = p.glyphs[0].strokes[0];
  s.cap = "round";
  const oldSvg = exportSvg(p.glyphs[0]);
  const old = JSON.parse(JSON.stringify(p));
  assert.ok(isProject(old));
  assert.equal(exportSvg(old.glyphs[0]), oldSvg);
  s.startTip = "horizontal";
  s.endTip = "none";
  const restored = JSON.parse(JSON.stringify(p));
  assert.ok(isProject(restored));
  assert.equal(exportSvg(restored.glyphs[0]), exportSvg(p.glyphs[0]));
  for (const key of ["startTip", "endTip"]) {
    for (const value of [null, "round", "<script>", 0, {}, []]) {
      const invalid = structuredClone(restored);
      invalid.glyphs[0].strokes[0][key] = value;
      assert.equal(isProject(invalid), false);
    }
  }
});

test("default brush tuning exactly preserves existing presets", () => {
  for (const length of [1, 20, 400]) {
    const { g, s, brush } = brushFixture(length);
    for (const preset of brushPresets) {
      brush.startTip = preset.start;
      brush.endTip = preset.end;
      brush.startBrush = { ...defaultBrush.startBrush };
      brush.endBrush = { ...defaultBrush.endBrush };
      const original = outlinePath(g, s, brush);
      brush.startBrush = { length: 100, spread: 100 };
      brush.endBrush = { length: 100, spread: 100 };
      assert.equal(outlinePath(g, s, brush), original);
    }
  }
});

test("brush length changes the shoulder reach while spread changes end width", () => {
  const { g, s, brush } = brushFixture();
  brush.startTip = "horizontal";
  brush.endTip = "none";
  brush.startBrush = { length: 200, spread: 100 };
  const long = outlinePath(g, s, brush);
  assert.ok(long.includes("196,120"));
  assert.ok(long.includes("106,127"));
  assert.ok(containsPoint(long, { x: 170, y: 121 }));
  brush.startBrush.spread = 200;
  const wide = outlinePath(g, s, brush);
  assert.ok(wide.includes("196,120"));
  assert.ok(wide.includes("106,134"));
  brush.startBrush.spread = 0;
  const flat = outlinePath(g, s, brush);
  assert.ok(flat.includes("106,120"));
  assert.ok(!containsPoint(flat, { x: 170, y: 121 }));
  brush.startBrush = { length: 25, spread: 100 };
  const short = outlinePath(g, s, brush);
  assert.ok(short.includes("112,120"));
  assert.ok(!containsPoint(short, { x: 130, y: 121 }));
});

test("start and end brush tuning remain independent and do not mutate knots", () => {
  const { g, s, brush } = brushFixture();
  brush.startTip = "horizontal";
  brush.endTip = "vertical";
  const knots = structuredClone(g.nodes);
  const before = pathCoverage(outlinePath(g, s, brush));
  brush.startBrush = { length: 200, spread: 200 };
  const changedStart = pathCoverage(outlinePath(g, s, brush));
  for (let x = 310.3; x < 520; x += 3)
    for (let y = 60.3; y < 140; y += 3)
      assert.equal(before({ x, y }), changedStart({ x, y }));
  brush.endBrush = { length: 150, spread: 25 };
  const changedEnd = pathCoverage(outlinePath(g, s, brush));
  for (let x = 80.3; x < 290; x += 3)
    for (let y = 60.3; y < 140; y += 3)
      assert.equal(changedStart({ x, y }), changedEnd({ x, y }));
  assert.deepEqual(g.nodes, knots);
});

test("maximum brush tuning respects short strokes, knots and occupied endpoints", () => {
  for (const length of [0.1, 1, 20, 400]) {
    const { g, s, brush } = brushFixture(length, 200);
    brush.startTip = "horizontal";
    brush.endTip = "vertical";
    brush.startBrush = { length: 250, spread: 200 };
    brush.endBrush = { length: 250, spread: 200 };
    const d = outlinePath(g, s, brush);
    assert.ok(!/NaN|Infinity/.test(d));
    assert.ok(containsPoint(d, { x: 100 + length / 2, y: 100 }));
    assert.ok(!containsPoint(d, { x: 100 + length / 2, y: 201 }));
  }
  const { g, s, brush } = brushFixture();
  g.nodes.c = { id: "c", x: 120, y: 100, width: 40, mode: "corner" };
  s.nodes = ["a", "c", "b"];
  brush.startTip = "horizontal";
  brush.startBrush = { length: 250, spread: 200 };
  assert.ok(!containsPoint(outlinePath(g, s, brush), { x: 120, y: 123 }));
  g.nodes.d = { id: "d", x: 100, y: 300, width: 40, mode: "corner" };
  g.strokes.push(newStroke(["a", "d"], 1));
  const connected = outlinePath(g, s, brush);
  brush.startBrush = { length: 25, spread: 0 };
  assert.equal(outlinePath(g, s, brush), connected);
});

test("v1 brush tuning survives JSON and SVG export and validates both ends", () => {
  const p = demoProject();
  const g = p.glyphs[0];
  const brush = p.brush = structuredClone(defaultBrush);
  brush.startTip = "horizontal";
  brush.endTip = "vertical";
  brush.startBrush = { length: 200, spread: 0 };
  brush.endBrush = { length: 25, spread: 200 };
  const restored = JSON.parse(JSON.stringify(p));
  assert.ok(isProject(restored));
  assert.equal(exportSvg(restored.glyphs[0], restored.brush), exportSvg(g, brush));
  for (const key of ["startBrush", "endBrush"]) {
    for (const value of [
      null, [], {}, "100", { length: 100 }, { spread: 100 },
      { length: 24, spread: 100 }, { length: 251, spread: 100 },
      { length: 100, spread: -1 }, { length: 100, spread: 201 },
      { length: NaN, spread: 100 }, { length: 100, spread: Infinity },
      { length: "100", spread: 100 },
    ]) {
      const invalid = structuredClone(restored);
      invalid.brush[key] = value;
      assert.equal(isProject(invalid), false);
    }
  }
});

test("global brushes apply to all glyphs and new strokes through the same export geometry", () => {
  const first = brushFixture(), second = brushFixture(300);
  const p: Project = { version: 1, name: "global", activeId: first.g.id, glyphs: [first.g, second.g] };
  changeGlobalBrush(p, {
    startTip: "horizontal", endTip: "vertical",
    startBrush: { length: 150, spread: 180 }, endBrush: { length: 70, spread: 40 },
  });
  for (const g of p.glyphs) {
    const s = g.strokes[0];
    const before = structuredClone(s);
    const path = outlinePath(g, s, p.brush);
    assert.equal(glyphPath(g, p.brush), path);
    assert.ok(exportSvg(g, p.brush).includes(path));
    assert.notEqual(path, outlinePath(g, s));
    assert.deepEqual(s, before);
  }
  const fresh = newStroke(["a", "b"], 1);
  assert.equal(outlinePath({ ...first.g, strokes: [fresh] }, fresh, p.brush), outlinePath(first.g, first.s, p.brush));
});

test("legacy endpoint overrides cannot change global rendering", () => {
  const { g, s } = brushFixture();
  const p: Project = { version: 1, name: "legacy", activeId: g.id, glyphs: [g] };
  changeGlobalBrush(p, { startTip: "horizontal", endTip: "vertical" });
  const expected = outlinePath(g, s, p.brush);
  s.startTip = "basic";
  s.endTip = "horizontal";
  s.startBrush = { length: 65, spread: 170 };
  s.endBrush = { length: 250, spread: 0 };
  assert.equal(outlinePath(g, s, p.brush), expected);
  const clean = { ...newStroke(["a", "b"], 1), id: s.id };
  const plain = outlinePath(g, clean);
  assert.equal(outlinePath(g, s), plain);
  changeGlobalBrush(p, { startTip: "vertical", startBrush: { length: 200, spread: 0 } });
  assert.notEqual(outlinePath(g, s, p.brush), expected);
  assert.equal(outlinePath(g, s, p.brush), outlinePath(g, clean, p.brush));
});

test("global changes apply to locked strokes without modifying their nodes or lock state", () => {
  for (const cap of ["round", "square", "butt"] as const) {
    const { g, s } = brushFixture();
    s.cap = cap;
    s.locked = true;
    const p: Project = { version: 1, name: "locked", activeId: g.id, glyphs: [g] };
    const geometry = structuredClone(g);
    const before = outlinePath(g, s);
    changeGlobalBrush(p, { startTip: "horizontal", endTip: "vertical" });
    const first = outlinePath(g, s, p.brush);
    assert.notEqual(first, before);
    changeGlobalBrush(p, { startBrush: { length: 250, spread: 200 } });
    assert.notEqual(outlinePath(g, s, p.brush), first);
    assert.deepEqual(g, geometry);
    assert.ok(isProject(p));
  }
});

test("global brush changes still avoid connected endpoints", () => {
  const { g, s } = brushFixture();
  g.nodes.c = { id: "c", x: 500, y: 300, width: 40, mode: "corner" };
  g.strokes.push(newStroke(["b", "c"], 1));
  const p: Project = { version: 1, name: "connected", activeId: g.id, glyphs: [g] };
  const before = outlinePath(g, s);
  changeGlobalBrush(p, { endTip: "horizontal", endBrush: { length: 250, spread: 200 } });
  assert.equal(outlinePath(g, s, p.brush), before);
  g.strokes[1].visible = false;
  assert.notEqual(outlinePath(g, s, p.brush), before);
});

test("v1 migration removes all local overrides while preserving global settings and geometry", () => {
  for (const hasGlobal of [false, true]) {
    const p = demoProject();
    if (hasGlobal) changeGlobalBrush(p, { startTip: "vertical", startBrush: { length: 180, spread: 60 } });
    const expected = structuredClone(p);
    for (const g of p.glyphs) for (const s of g.strokes) {
      s.startTip = "horizontal";
      s.endTip = "basic";
      s.startBrush = { length: 40, spread: 180 };
      s.endBrush = { length: 250, spread: 0 };
    }
    assert.ok(isProject(p));
    const migrated = migrateProjectBrush(JSON.parse(JSON.stringify(p)));
    assert.deepEqual(migrated, expected);
    assert.deepEqual(migrateProjectBrush(migrated), expected);
    assert.ok(isProject(migrated));
  }
});

test("global defaults persist in v1 JSON, validate nested fields and restore with project snapshots", () => {
  const p = demoProject();
  const before = structuredClone(p);
  changeGlobalBrush(p, { startTip: "horizontal", endTip: "vertical" });
  const restored: Project = JSON.parse(JSON.stringify(p));
  assert.ok(isProject(restored));
  assert.deepEqual(restored.brush, p.brush);
  assert.equal(exportSvg(restored.glyphs[0], restored.brush), exportSvg(p.glyphs[0], p.brush));
  assert.equal(before.brush, undefined);
  assert.ok(isProject(before));
  for (const brush of [null, [], {}, { ...defaultBrush, startTip: "basic" },
    { ...defaultBrush, endBrush: { length: 0, spread: 100 } },
    { ...defaultBrush, startBrush: null }]) {
    assert.equal(isProject({ ...p, brush }), false);
  }
});
