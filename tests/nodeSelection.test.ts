import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyGlyph, newStroke } from "../src/core/model";
import { isProject } from "../src/core/validation";
import { removeNodes, selectableNodeIds, selectionLocked, translateNodes } from "../src/features/editor/nodeSelection";

function fixture() {
  const glyph = emptyGlyph("selection");
  [[20, 10], [100, 100], [630, 620], [300, 300], [400, 400]].forEach(([x, y], i) => {
    const id = String(i);
    glyph.nodes[id] = { id, x, y, width: 40, mode: "smooth", handle: { x: 20, y: 10 } };
  });
  glyph.strokes = [newStroke(["0", "1", "2"], 0), newStroke(["1", "3"], 1)];
  return glyph;
}

test("selection movement translates shared nodes once and preserves handles and unselected nodes", () => {
  const glyph = fixture(), before = structuredClone(glyph);
  assert.ok(translateNodes(glyph, ["0", "1", "1", "2"], { x: 1, y: -1 }));
  ["0", "1", "2"].forEach((id) => {
    assert.equal(glyph.nodes[id].x, before.nodes[id].x + 1);
    assert.equal(glyph.nodes[id].y, before.nodes[id].y - 1);
    assert.deepEqual(glyph.nodes[id].handle, before.nodes[id].handle);
  });
  assert.deepEqual(glyph.nodes["3"], before.nodes["3"]);
  assert.deepEqual(glyph.strokes, before.strokes);
});

test("group movement stops at each edge without collapsing node spacing", () => {
  const glyph = fixture();
  translateNodes(glyph, ["0", "2"], { x: 100, y: -100 });
  assert.deepEqual([glyph.nodes["0"].x, glyph.nodes["0"].y, glyph.nodes["2"].x, glyph.nodes["2"].y], [30, 0, 640, 610]);
  assert.equal(translateNodes(glyph, ["0", "2"], { x: 1, y: -1 }), false);
  translateNodes(glyph, ["0", "2"], { x: -100, y: 100 });
  assert.deepEqual([glyph.nodes["0"].x, glyph.nodes["0"].y, glyph.nodes["2"].x, glyph.nodes["2"].y], [0, 30, 610, 640]);
});

test("drag offsets use the original snapshot rather than accumulating across pointer moves", () => {
  const glyph = fixture(), before = structuredClone(glyph);
  const original = structuredClone(before);
  translateNodes(glyph, ["0", "1"], { x: 4, y: 5 }, before);
  translateNodes(glyph, ["0", "1"], { x: 8, y: 9 }, before);
  assert.equal(glyph.nodes["0"].x, 28);
  assert.equal(glyph.nodes["1"].y, 109);
  assert.deepEqual(before, original);
});

test("select all excludes hidden and locked nodes, including shared locked endpoints", () => {
  const glyph = fixture();
  glyph.strokes[1].locked = true;
  assert.ok(selectionLocked(glyph, ["1"]));
  assert.deepEqual(selectableNodeIds(glyph), ["0", "2", "4"]);
  const before = structuredClone(glyph);
  assert.equal(translateNodes(glyph, ["0", "1"], { x: 10, y: 10 }), false);
  removeNodes(glyph, ["0", "1"]);
  assert.deepEqual(glyph, before);
  glyph.strokes[0].visible = false;
  assert.deepEqual(selectableNodeIds(glyph), ["4"]);
});

test("batch deletion keeps shared references valid and preserves unrelated standalone nodes", () => {
  const glyph = fixture();
  removeNodes(glyph, ["0", "2"]);
  assert.equal(glyph.strokes.length, 1);
  assert.deepEqual(glyph.strokes[0].nodes, ["1", "3"]);
  assert.deepEqual(Object.keys(glyph.nodes), ["1", "3", "4"]);
  assert.ok(isProject({ version: 1, name: "test", glyphs: [glyph], activeId: glyph.id }));
  removeNodes(glyph, ["1", "3", "4"]);
  assert.deepEqual(glyph.nodes, {});
  assert.deepEqual(glyph.strokes, []);
});
