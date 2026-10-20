import { test } from "node:test";
import assert from "node:assert/strict";
import { demoProject } from "../src/core/demo";
import { emptyGlyph, newStroke } from "../src/core/model";
import { createProjectPatch, applyProjectPatch } from "../src/core/projectPatch";

test("node edits send only changed fields and omit unchanged reference images", () => {
  const before = demoProject();
  before.glyphs[0].reference = `data:image/png;base64,${"A".repeat(100000)}`;
  const next = structuredClone(before), glyph = next.glyphs[0], node = Object.values(glyph.nodes)[0];
  node.x += 1;
  const patch = createProjectPatch(before, next);
  assert.deepEqual(patch, [{ op: "set", path: ["glyphs", glyph.id, "nodes", node.id, "x"], value: node.x }]);
  assert.ok(JSON.stringify(patch).length < 300);
  assert.deepEqual(applyProjectPatch(before, JSON.parse(JSON.stringify(patch))), next);
  assert.notDeepEqual(before, next);
  assert.deepEqual(createProjectPatch(next, structuredClone(next)), []);
});

test("glyph additions, deletions and ordering never resend surviving glyphs or their images", () => {
  const before = demoProject();
  for (const g of before.glyphs) g.reference = `data:image/png;base64,${g.id}`;
  const next = structuredClone(before);
  next.glyphs.splice(1, 1);
  next.glyphs.reverse();
  next.glyphs.push(emptyGlyph("新增"));
  next.activeId = next.glyphs[0].id;
  const patch = createProjectPatch(before, next);
  assert.ok(!JSON.stringify(patch).includes("data:image"));
  assert.deepEqual(applyProjectPatch(before, patch), next);
});

test("stroke and node changes preserve order, shared references, optional fields and global brushes", () => {
  const before = demoProject(), next = structuredClone(before), glyph = next.glyphs[0];
  const node = Object.values(glyph.nodes)[0];
  node.handle = { x: 12, y: 18 };
  glyph.strokes[0].locked = true;
  glyph.strokes[0].visible = false;
  glyph.strokes.reverse();
  glyph.nodes.extra = { ...node, id: "extra", handle: undefined };
  glyph.strokes.push(newStroke([node.id, "extra"], glyph.strokes.length));
  next.brush = { startTip: "none", endTip: "vertical", startBrush: { length: 100, spread: 100 }, endBrush: { length: 80, spread: 90 } };
  const forward = JSON.parse(JSON.stringify(createProjectPatch(before, next)));
  assert.deepEqual(applyProjectPatch(before, forward), JSON.parse(JSON.stringify(next)));
  assert.deepEqual(applyProjectPatch(next, createProjectPatch(next, before)), before);
});

test("reference images are sent only when added, replaced or removed", () => {
  const before = demoProject(), next = structuredClone(before);
  next.glyphs[0].reference = "data:image/png;base64,AAAA";
  const patch = createProjectPatch(before, next);
  assert.equal(patch.length, 1);
  assert.deepEqual(applyProjectPatch(before, patch), next);
  const replaced = structuredClone(next);
  replaced.glyphs[0].reference = "data:image/png;base64,BBBB";
  assert.deepEqual(applyProjectPatch(next, createProjectPatch(next, replaced)), replaced);
  assert.deepEqual(applyProjectPatch(next, createProjectPatch(next, before)), before);
});

test("invalid patch paths, broken references and invalid ordering never mutate the baseline", () => {
  const before = demoProject(), snapshot = structuredClone(before), glyph = before.glyphs[0];
  const invalid: unknown[] = [null, {}, [{ op: "set", path: [], value: before }],
    [{ op: "set", path: ["__proto__", "polluted"], value: true }],
    [{ op: "set", path: ["glyphs", "missing", "name"], value: "错误" }],
    [{ op: "remove", path: ["glyphs", glyph.id, "nodes", glyph.strokes[0].nodes[0]] }],
    [{ op: "set", path: ["glyphOrder"], value: [glyph.id, glyph.id] }],
    [{ op: "set", path: ["glyphs", glyph.id, "reference"], value: "https://example.com/image.png" }],
  ];
  for (const patch of invalid) assert.throws(() => applyProjectPatch(before, patch));
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
  assert.deepEqual(before, snapshot);
});
