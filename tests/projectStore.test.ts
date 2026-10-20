import { test } from "node:test";
import assert from "node:assert/strict";
import { createProjectStore, activeGlyph } from "../src/features/project/projectStore";
import { emptyGlyph, newStroke } from "../src/core/model";
import type { Project } from "../src/core/model";
import { isProject } from "../src/core/validation";
import { defaultBrush } from "../src/core/brush";

function manuscript(): Project {
  const glyph = emptyGlyph("甲"), other = emptyGlyph("乙");
  glyph.nodes = {
    a: { id: "a", x: 100, y: 100, width: 30, mode: "corner" },
    b: { id: "b", x: 200, y: 200, width: 30, mode: "corner" },
    c: { id: "c", x: 300, y: 300, width: 30, mode: "corner" },
  };
  glyph.strokes = [newStroke(["a", "b"], 0), newStroke(["b", "c"], 1)];
  return { version: 1, name: "测试", glyphs: [glyph, other], activeId: glyph.id };
}
function setup() {
  const store = createProjectStore(manuscript());
  return { store, actions: store.getState().actions, state: store.getState };
}

test("updates retain untouched branches and never mutate the caller's project or history", () => {
  const original = manuscript(), store = createProjectStore(original), before = store.getState().project;
  store.getState().actions.update((g) => { g.nodes.a.x = 120; });
  const after = store.getState().project;
  assert.equal(before.glyphs[0].nodes.a.x, 100);
  assert.equal(original.glyphs[0].nodes.a.x, 100);
  assert.notEqual(after.glyphs[0], before.glyphs[0]);
  assert.equal(after.glyphs[1], before.glyphs[1]);
  assert.equal(after.glyphs[0].nodes.b, before.glyphs[0].nodes.b);
  assert.equal(after.glyphs[0].strokes, before.glyphs[0].strokes);
  assert.equal(store.getState().past[0], before);
});

test("a continuous node gesture commits one history entry and restores shared nodes with undo/redo", () => {
  const { state, actions } = setup(), before = state().project;
  actions.selectNodes(["a", "b"]);
  const id = actions.beginTransaction();
  for (let i = 0; i < 10; i++) actions.moveSelection({ x: 1, y: 2 }, id);
  assert.equal(state().past.length, 0);
  assert.equal(state().committedProject, before);
  assert.equal(activeGlyph(state()).nodes.b.x, 210);
  actions.commitTransaction(id);
  const after = state().project;
  assert.equal(state().past.length, 1);
  assert.equal(state().committedProject, after);
  actions.undo();
  assert.equal(state().project, before);
  assert.deepEqual(state().session.nodeIds, []);
  actions.redo();
  assert.equal(state().project, after);
  assert.ok(isProject(state().project));
});

test("cancel restores the document and keeps the existing redo branch; stale events are ignored", () => {
  const { state, actions } = setup();
  actions.update((g) => { g.color = "#123456"; });
  actions.undo();
  const before = state().project, future = state().future;
  const id = actions.beginTransaction();
  actions.update((g) => { g.nodes.a.width = 80; }, id);
  actions.cancelTransaction(id);
  assert.equal(state().project, before);
  assert.equal(state().future, future);
  actions.update((g) => { g.name = "不应写入"; }, id);
  actions.commitTransaction(id);
  assert.equal(state().project, before);
  actions.redo();
  assert.equal(activeGlyph(state()).color, "#123456");
});

test("empty, unchanged and round-trip gestures do not create history or clear redo", () => {
  const { state, actions } = setup();
  actions.update((g) => { g.name = "改名"; });
  actions.undo();
  const before = state().project;
  actions.update((g) => { g.name = g.name; });
  actions.commitTransaction(actions.beginTransaction());
  const id = actions.beginTransaction();
  actions.update((g) => { g.nodes.a.x += 10; }, id);
  actions.update((g) => { g.nodes.a.x -= 10; }, id);
  actions.commitTransaction(id);
  assert.equal(state().project, before);
  assert.equal(state().past.length, 0);
  assert.equal(state().future.length, 1);
});

test("new edits including manuscript names invalidate redo; typing is one transaction", () => {
  const { state, actions } = setup();
  actions.update((g) => { g.color = "#123456"; });
  actions.undo();
  const id = actions.beginTransaction();
  for (const name of ["新", "新手", "新手稿"]) actions.update((_, p) => { p.name = name; }, id);
  actions.commitTransaction(id);
  assert.equal(state().future.length, 0);
  assert.equal(state().past.length, 1);
  actions.redo();
  assert.equal(state().project.name, "新手稿");
  actions.undo();
  assert.equal(state().project.name, "测试");
});

test("session changes do not enter history; navigation survives undo and remains a v1 field", () => {
  const { state, actions } = setup();
  const otherId = state().project.glyphs[1].id;
  actions.update((g) => { g.nodes.a.x = 140; });
  actions.switchGlyph(otherId);
  const committed = state().committedProject;
  actions.selectNodes(["missing"]);
  actions.setTool("pen");
  actions.setShowReference(true);
  assert.equal(state().committedProject, committed);
  assert.equal(state().past.length, 1);
  assert.deepEqual(state().session.nodeIds, []);
  actions.undo();
  assert.equal(state().project.activeId, otherId);
  assert.equal(state().project.glyphs[0].nodes.a.x, 100);
  assert.equal(state().project.version, 1);
  assert.ok(isProject(state().project));
});

test("switching glyphs commits the old gesture and isolates late updates from the new glyph", () => {
  const { state, actions } = setup();
  const id = actions.beginTransaction();
  actions.update((g) => { g.name = "已提交"; }, id);
  actions.switchGlyph(state().project.glyphs[1].id);
  const project = state().project;
  actions.update((g) => { g.name = "过期更新"; }, id);
  actions.cancelTransaction(id);
  assert.equal(state().project, project);
  assert.equal(state().past.length, 1);
  assert.equal(activeGlyph(state()).name, "乙");
});

test("a new owner, a discrete edit and undo settle pending gestures without duplicate history", () => {
  const { state, actions } = setup();
  const first = actions.beginTransaction();
  actions.update((g) => { g.nodes.a.x = 120; }, first);
  const second = actions.beginTransaction();
  actions.cancelTransaction(first);
  assert.equal(state().transaction?.id, second);
  actions.update((g) => { g.nodes.a.width = 50; }, second);
  actions.update((g) => { g.color = "#123456"; });
  assert.equal(state().past.length, 3);
  actions.undo();
  assert.equal(activeGlyph(state()).nodes.a.width, 50);
  const third = actions.beginTransaction();
  actions.update((g) => { g.nodes.a.width = 70; }, third);
  actions.undo();
  assert.equal(activeGlyph(state()).nodes.a.width, 50);
  assert.equal(state().transaction, null);
});

test("deleting nodes cleans selection and shared references, with lock protection", () => {
  const { state, actions } = setup();
  actions.update((g) => { g.strokes[1].locked = true; });
  actions.select("b");
  const locked = state().project;
  assert.equal(actions.removeSelection(), false);
  actions.moveSelection({ x: 10, y: 10 });
  assert.equal(state().project, locked);
  actions.update((g) => { g.strokes[1].locked = false; });
  assert.equal(actions.removeSelection(), true);
  assert.deepEqual(state().session.nodeIds, []);
  assert.equal(state().session.strokeId, null);
  assert.ok(isProject(state().project));
  actions.undo();
  assert.equal(activeGlyph(state()).strokes.length, 2);
  assert.equal(activeGlyph(state()).nodes.b.x, 200);
});

test("deleted glyphs, new glyphs and imported manuscripts always leave a valid active selection", () => {
  const { state, actions } = setup();
  actions.select(null, null);
  actions.removeSelection();
  assert.ok(isProject(state().project));
  actions.removeSelection();
  assert.equal(state().project.glyphs.length, 1);
  assert.ok(isProject(state().project));
  actions.undo();
  actions.addGlyph();
  assert.equal(state().session.tool, "pen");
  const before = state().project, imported = manuscript();
  imported.glyphs[0].strokes[0].startTip = "horizontal";
  actions.replace(imported);
  assert.equal(activeGlyph(state()).strokes[0].startTip, undefined);
  assert.equal(imported.glyphs[0].strokes[0].startTip, "horizontal");
  assert.deepEqual(state().session.nodeIds, []);
  assert.equal(state().session.tool, "select");
  actions.undo();
  assert.equal(state().project.glyphs, before.glyphs);
});

test("global brush edits are transactional, affect locked strokes and keep unrelated geometry stable", () => {
  const { state, actions } = setup();
  actions.update((g) => { g.strokes[0].locked = true; });
  const glyphs = state().project.glyphs, previous = state().project.brush;
  const id = actions.beginTransaction();
  actions.changeBrush({ ...defaultBrush, startTip: "horizontal" }, id);
  actions.changeBrush({ startBrush: { length: 150, spread: 80 } }, id);
  actions.commitTransaction(id);
  assert.equal(state().project.glyphs, glyphs);
  assert.equal(state().project.brush?.startBrush.length, 150);
  actions.undo();
  assert.equal(state().project.brush, previous);
});

test("history retains only sixty edits and stores are independent", () => {
  const { state, actions } = setup(), other = setup();
  for (let i = 0; i < 75; i++) actions.update((_, p) => { p.name = String(i); });
  assert.equal(state().past.length, 60);
  for (let i = 0; i < 61; i++) actions.undo();
  assert.equal(state().project.name, "14");
  assert.equal(other.state().project.name, "测试");
  assert.equal(other.state().past.length, 0);
});

test("changing selection settles a gesture and cannot retarget its late updates", () => {
  const { state, actions } = setup();
  actions.select("a");
  const id = actions.beginTransaction();
  actions.moveSelection({ x: 10, y: 0 }, id);
  actions.select("b");
  assert.equal(state().transaction, null);
  assert.equal(state().past.length, 1);
  actions.moveSelection({ x: 30, y: 0 }, id);
  actions.select("a", null, id);
  assert.deepEqual(state().session.nodeIds, ["b"]);
  assert.equal(activeGlyph(state()).nodes.a.x, 110);
  assert.equal(activeGlyph(state()).nodes.b.x, 200);
});

test("an owner may select newly created geometry without committing the preview", () => {
  const { state, actions } = setup();
  const before = state().project, id = actions.beginTransaction();
  actions.update((g) => { g.nodes.d = { ...g.nodes.a, id: "d" }; }, id);
  actions.select("d", null, id);
  assert.equal(state().transaction?.id, id);
  assert.equal(state().committedProject, before);
  actions.cancelTransaction(id);
  assert.deepEqual(state().session.nodeIds, []);
  assert.equal(state().past.length, 0);
});
