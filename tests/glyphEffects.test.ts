import { createProjectStore } from "../src/features/project/projectStore";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultGlyphEffects,
  defaultProjectStyle,
  isGlyphEffects,
  isProjectStyle,
} from "../src/core/glyphEffects";
import { demoProject } from "../src/core/demo";
import {
  applyProjectPatch,
  createProjectPatch,
} from "../src/core/projectPatch";
import { isProject } from "../src/core/validation";
import { exportSvg } from "../src/core/svg";
import { buildFlameField } from "../src/features/styles/flameField";

test("flame fuel rises continuously from ink without leaking below or into empty columns", () => {
  const size = 100;
  const pixels = new Uint8ClampedArray(size * size * 4);
  const index = (x: number, y: number) => (y * size + x) * 4;
  for (let y = 60; y <= 64; y++) pixels[index(50, y) + 3] = 255;
  const field = buildFlameField(pixels, size);
  assert.equal(field[index(50, 60)], 0);
  assert.equal(field[index(50, 60) + 1], 255);
  let lastHeight = 0;
  for (let y = 59; y >= 47; y--) {
    assert.ok(field[index(50, y)] > lastHeight);
    assert.equal(field[index(50, y) + 1], 255);
    lastHeight = field[index(50, y)];
  }
  for (const [x, y] of [
    [50, 65],
    [49, 59],
    [51, 59],
    [50, 40],
  ]) {
    assert.equal(field[index(x, y) + 1], 0);
  }
});

test("separate strokes restart flame height at their own roots and empty masks supply no fuel", () => {
  const size = 100;
  const pixels = new Uint8ClampedArray(size * size * 4);
  const index = (y: number) => (y * size + 20) * 4;
  pixels[index(80) + 3] = 255;
  pixels[index(30) + 3] = 180;
  pixels[index(10) + 3] = 20;
  const field = buildFlameField(pixels, size);
  assert.equal(field[index(79) + 1], 255);
  assert.equal(field[index(29) + 1], 180);
  assert.equal(field[index(30)], 0);
  assert.equal(field[index(50) + 1], 0);
  assert.equal(field[index(9) + 1], 0);
  const empty = buildFlameField(new Uint8ClampedArray(pixels.length), size);
  assert.equal(
    empty.some((value, i) => i % 4 === 1 && value !== 0),
    false,
  );
});

test("effects reject invalid palettes, colors, non-finite and out-of-range parameters", () => {
  assert.equal(isGlyphEffects(defaultGlyphEffects), true);
  for (const type of ["none", "fire", "rune"]) {
    assert.equal(isGlyphEffects({ ...defaultGlyphEffects, type }), true);
  }
  for (const value of [
    null,
    [],
    {},
    { ...defaultGlyphEffects, type: "unknown" },
    {
      ...defaultGlyphEffects,
      fire: { ...defaultGlyphEffects.fire, palette: "unknown" },
    },
    {
      ...defaultGlyphEffects,
      rune: { ...defaultGlyphEffects.rune, color: "red" },
    },
  ])
    assert.equal(isGlyphEffects(value), false);
  for (const effect of ["fire", "rune"] as const)
    for (const [key, values] of [
      ["intensity", [19, 101, NaN, Infinity, "60"]],
      ["speed", [19, 161, NaN, Infinity, "60"]],
      ["direction", [-1, 361, NaN, Infinity, "90"]],
    ] as const)
      for (const value of values) {
        const settings = structuredClone(defaultGlyphEffects);
        (settings[effect] as Record<string, unknown>)[key] = value;
        assert.equal(
          isGlyphEffects(settings),
          false,
          `${effect}.${key}=${value}`,
        );
      }
});

test("global effects persist in field patches without changing geometry, reference images or SVG exports", () => {
  const before = demoProject();
  before.glyphs[0].reference = "data:image/png;base64,AAAA";
  const next = structuredClone(before);
  next.style = structuredClone(defaultProjectStyle);
  next.style.effects.type = "fire";
  assert.equal(isProject(next), true);
  const patch = createProjectPatch(before, next);
  assert.deepEqual(
    patch.map((p) => p.path),
    [["style"]],
  );
  assert.equal(JSON.stringify(patch).includes("data:image"), false);
  assert.deepEqual(
    applyProjectPatch(before, JSON.parse(JSON.stringify(patch))),
    next,
  );
  assert.deepEqual(next.glyphs[0].nodes, before.glyphs[0].nodes);
  assert.equal(
    exportSvg(next.glyphs[0], next.brush),
    exportSvg(before.glyphs[0], before.brush),
  );
  const adjusted = structuredClone(next);
  adjusted.style!.effects.fire.intensity = 90;
  assert.deepEqual(createProjectPatch(next, adjusted), [
    {
      op: "set",
      path: ["style", "effects", "fire", "intensity"],
      value: 90,
    },
  ]);
  assert.deepEqual(
    applyProjectPatch(next, createProjectPatch(next, before)),
    before,
  );
  assert.throws(() =>
    applyProjectPatch(next, [
      {
        op: "set",
        path: ["style", "effects", "fire", "intensity"],
        value: 200,
      },
    ]),
  );
});

test("global styles validate direction boundaries and preserve geometry and editor history across glyph management", () => {
  for (const direction of [0, 90, 180, 270, 360]) {
    const style = structuredClone(defaultProjectStyle);
    style.effects.fire.direction = style.effects.rune.direction = direction;
    assert.equal(isProjectStyle(style), true);
  }
  assert.equal(
    isProjectStyle({ ...defaultProjectStyle, color: "transparent" }),
    false,
  );
  const project = demoProject();
  const store = createProjectStore(project);
  const originalGlyphs = store.getState().project.glyphs;
  const actions = store.getState().actions;
  const token = actions.beginTransaction();
  actions.changeStyle((s) => {
    s.effects.type = "fire";
    s.effects.fire.direction = 90;
    s.color = "#123456";
  }, token);
  actions.changeStyle((s) => {
    s.effects.fire.direction = 180;
  }, token);
  actions.commitTransaction(token);
  assert.equal(store.getState().past.length, 1);
  assert.equal(store.getState().project.glyphs, originalGlyphs);
  assert.match(
    exportSvg(
      project.glyphs[0],
      project.brush,
      store.getState().project.style!.color,
    ),
    /fill="#123456"/,
  );
  actions.addGlyph();
  assert.equal(store.getState().past.length, 1);
  const activeId = store.getState().project.activeId;
  assert.equal(store.getState().project.style!.effects.fire.direction, 180);
  actions.undo();
  assert.equal(store.getState().project.style, undefined);
  assert.equal(store.getState().project.activeId, activeId);
  actions.redo();
  assert.equal(store.getState().project.style!.effects.fire.direction, 180);
  const stale = actions.beginTransaction();
  actions.changeStyle((s) => {
    s.effects.rune.direction = 270;
  }, stale);
  actions.cancelTransaction(stale);
  actions.changeStyle((s) => {
    s.effects.rune.direction = 360;
  }, stale);
  assert.equal(store.getState().project.style!.effects.rune.direction, 0);
});
