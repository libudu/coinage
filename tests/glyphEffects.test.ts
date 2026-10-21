import { createProjectStore } from "../src/features/project/projectStore";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultGlyphEffects,
  defaultProjectStyle,
  isGlyphEffects,
  isProjectStyle,
  runePresets,
  firePalettes,
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
  assert.equal(field[index(50, 60) + 1], 0);
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

test("flame roots never paint inside antialiased diagonal ink or below its back edge", () => {
  const size = 100;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let x = 20; x < 80; x++)
    for (let y = x; y <= x + 4; y++)
      pixels[(y * size + x) * 4 + 3] = y === x ? 100 : 255;
  const field = buildFlameField(pixels, size);
  for (let x = 20; x < 80; x++) {
    for (let y = x; y <= x + 5; y++)
      assert.equal(field[(y * size + x) * 4 + 1], 0);
    assert.ok(field[((x - 1) * size + x) * 4 + 1] > 0);
  }
});

test("jade material validates and persists independently of rune color, without affecting exports", () => {
  const before = demoProject();
  before.style = structuredClone(defaultProjectStyle);
  const next = structuredClone(before);
  next.style!.effects.type = "rune";
  const { label, ...jade } = runePresets.find(
    (preset) => preset.material === "jade",
  )!;
  Object.assign(next.style!.effects.rune, jade);
  assert.equal(label, "古玉灵纹");
  assert.equal(isProject(next), true);
  const patch = createProjectPatch(before, next);
  assert.ok(
    patch.some((p) => p.path.join(".") === "style.effects.rune.material"),
  );
  assert.deepEqual(applyProjectPatch(before, patch), next);
  assert.equal(
    exportSvg(next.glyphs[0], next.brush),
    exportSvg(before.glyphs[0], before.brush),
  );
  const luminous = structuredClone(next.style!.effects);
  delete luminous.rune.material;
  assert.equal(isGlyphEffects(luminous), true);
  for (const material of ["stone", null, 0]) {
    const invalid = structuredClone(next.style!.effects);
    (invalid.rune as Record<string, unknown>).material = material;
    assert.equal(isGlyphEffects(invalid), false);
  }
});

test("all rune presets retain their material when color and motion settings change and save as field patches", () => {
  const before = demoProject();
  before.style = structuredClone(defaultProjectStyle);
  const materials = new Set<string>();
  for (const { label, ...preset } of runePresets) {
    const next = structuredClone(before);
    next.style!.effects.type = "rune";
    Object.assign(next.style!.effects.rune, preset, {
      color: "#789abc",
      direction: 135,
      speed: 75,
    });
    assert.equal(isProject(next), true, label);
    assert.equal(next.style!.effects.rune.material, preset.material);
    materials.add(preset.material);
    const patch = createProjectPatch(before, next);
    assert.deepEqual(applyProjectPatch(before, patch), next);
    assert.deepEqual(next.glyphs, before.glyphs);
    assert.ok(patch.every((operation) => operation.path[0] === "style"));
  }
  assert.deepEqual(materials, new Set(["ice", "light", "gold", "jade"]));
});

test("all fire palettes including ashen validate and save without changing rune settings", () => {
  const before = demoProject();
  before.style = structuredClone(defaultProjectStyle);
  for (const palette of Object.keys(
    firePalettes,
  ) as (keyof typeof firePalettes)[]) {
    const next = structuredClone(before);
    next.style!.effects.type = "fire";
    next.style!.effects.fire.palette = palette;
    assert.equal(isProject(next), true);
    assert.deepEqual(
      applyProjectPatch(before, createProjectPatch(before, next)),
      next,
    );
    assert.deepEqual(next.style!.effects.rune, before.style!.effects.rune);
    assert.deepEqual(next.glyphs, before.glyphs);
  }
  assert.equal(firePalettes.ashen.label, "灰黑");
  const invalid = structuredClone(defaultGlyphEffects);
  for (const palette of ["landscape", "toString"]) {
    (invalid.fire as Record<string, unknown>).palette = palette;
    assert.equal(isGlyphEffects(invalid), false);
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

test("interaction settings default to half strength and width, validate bounds and persist as independent fields", () => {
  assert.equal(defaultGlyphEffects.fire.disturbance, 50);
  assert.equal(defaultGlyphEffects.rune.haloWidth, 50);
  for (const [kind, key, min, max] of [
    ["fire", "disturbance", 0, 100],
    ["rune", "haloWidth", 10, 100],
  ] as const) {
    for (const value of [min, max]) {
      const effects = structuredClone(defaultGlyphEffects);
      (effects[kind] as Record<string, unknown>)[key] = value;
      assert.equal(isGlyphEffects(effects), true);
    }
    for (const value of [min - 1, max + 1, NaN, Infinity, "50", undefined]) {
      const effects = structuredClone(defaultGlyphEffects);
      (effects[kind] as Record<string, unknown>)[key] = value;
      assert.equal(isGlyphEffects(effects), false);
    }
  }
  const before = demoProject();
  before.style = structuredClone(defaultProjectStyle);
  const next = structuredClone(before);
  next.style!.effects.fire.disturbance = 0;
  next.style!.effects.rune.haloWidth = 20;
  const patch = createProjectPatch(before, next);
  assert.deepEqual(patch, [
    { op: "set", path: ["style", "effects", "fire", "disturbance"], value: 0 },
    { op: "set", path: ["style", "effects", "rune", "haloWidth"], value: 20 },
  ]);
  assert.deepEqual(applyProjectPatch(before, patch), next);
  assert.deepEqual(next.glyphs, before.glyphs);
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
