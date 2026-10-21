import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createProjectStore,
  activeGlyph,
} from "../src/features/project/projectStore";
import { emptyGlyph, newStroke } from "../src/core/model";
import type { Project } from "../src/core/model";
import { isProject } from "../src/core/validation";
import { defaultBrush } from "../src/core/brush";
import {
  defaultGlyphEffects,
  defaultInkSettings,
  defaultProjectStyle,
} from "../src/core/glyphEffects";

function manuscript(): Project {
  const glyph = emptyGlyph("甲"),
    other = emptyGlyph("乙");
  glyph.nodes = {
    a: { id: "a", x: 100, y: 100, width: 30, mode: "corner" },
    b: { id: "b", x: 200, y: 200, width: 30, mode: "corner" },
    c: { id: "c", x: 300, y: 300, width: 30, mode: "corner" },
  };
  glyph.strokes = [newStroke(["a", "b"], 0), newStroke(["b", "c"], 1)];
  return { version: 1, glyphs: [glyph, other], activeId: glyph.id };
}
function setup() {
  const store = createProjectStore(manuscript());
  return { store, actions: store.getState().actions, state: store.getState };
}

test("resetting effect settings persists without adding editor history or invalidating redo", () => {
  for (const type of ["fire", "rune", "ink"] as const) {
    const project = manuscript();
    project.style = structuredClone(defaultProjectStyle);
    project.style.color = "#123456";
    project.style.effects.type = type;
    project.style.effects.fire = {
      ...defaultGlyphEffects.fire,
      palette: "azure",
      direction: 90,
    };
    project.style.effects.rune = {
      ...defaultGlyphEffects.rune,
      material: "gold",
      color: "#abcdef",
      haloWidth: 80,
    };
    project.style.effects.ink = {
      intensity: 90,
      speed: 80,
      disturbance: 0,
      stirSize: 150,
      diffusionRange: 50,
    };
    const store = createProjectStore(project);
    const { actions } = store.getState();
    actions.update((g) => {
      g.nodes.a.x += 5;
    });
    actions.update((g) => {
      g.nodes.a.y += 5;
    });
    actions.undo();
    const glyphs = store.getState().project.glyphs;
    const expected = structuredClone(project.style);
    if (type === "fire")
      expected.effects.fire = { ...defaultGlyphEffects.fire };
    else if (type === "rune")
      expected.effects.rune = { ...defaultGlyphEffects.rune };
    else expected.effects.ink = { ...defaultInkSettings };
    actions.resetEffect();
    assert.deepEqual(store.getState().project.style, expected);
    assert.equal(store.getState().committedProject, store.getState().project);
    assert.equal(store.getState().project.glyphs, glyphs);
    assert.equal(store.getState().past.length, 1);
    assert.equal(store.getState().future.length, 1);
    actions.undo();
    assert.equal(activeGlyph(store.getState()).nodes.a.x, 100);
    assert.deepEqual(store.getState().project.style, expected);
    actions.redo();
    actions.redo();
    assert.equal(activeGlyph(store.getState()).nodes.a.x, 105);
    assert.equal(activeGlyph(store.getState()).nodes.a.y, 105);
    assert.deepEqual(store.getState().project.style, expected);
    const current = store.getState().project;
    actions.resetEffect();
    assert.equal(store.getState().project, current);
  }
  const store = createProjectStore(manuscript());
  const current = store.getState().project;
  store.getState().actions.resetEffect();
  assert.equal(store.getState().project, current);
});

test("all style changes persist across editor undo and redo without adding history or clearing redo", () => {
  const { state, actions } = setup();
  actions.update((g) => {
    g.nodes.a.x += 5;
  });
  actions.update((g) => {
    g.nodes.a.y += 5;
  });
  actions.undo();
  const glyphs = state().project.glyphs;
  for (let i = 0; i < 20; i++) {
    actions.changeStyle((style) => {
      style.color = "#123456";
      style.effects.type = i % 2 === 0 ? "fire" : "rune";
      style.effects.fire.palette = "ashen";
      style.effects.fire.intensity = 70 + i;
      style.effects.fire.direction = i * 10;
      style.effects.rune.material = "gold";
      style.effects.rune.haloWidth = 20 + i;
      style.effects.ink = {
        ...defaultInkSettings,
        diffusionRange: i * 5,
        stirSize: 100 + i,
      };
    });
    assert.equal(state().past.length, 1);
    assert.equal(state().future.length, 1);
    assert.equal(state().project.glyphs, glyphs);
    assert.equal(state().project, state().committedProject);
    for (const snapshot of [...state().past, ...state().future])
      assert.deepEqual(snapshot.style, state().project.style);
  }
  const style = state().project.style;
  actions.undo();
  assert.equal(activeGlyph(state()).nodes.a.x, 100);
  assert.deepEqual(state().project.style, style);
  actions.redo();
  actions.redo();
  assert.equal(activeGlyph(state()).nodes.a.x, 105);
  assert.equal(activeGlyph(state()).nodes.a.y, 105);
  assert.deepEqual(state().project.style, style);
  const current = state().project;
  actions.changeStyle((s) => {
    s.color = "#123456";
  });
  assert.equal(state().project, current);
  const token = actions.beginTransaction();
  actions.update((g) => {
    g.nodes.a.x += 2;
  }, token);
  actions.changeStyle((s) => {
    s.color = "#abcdef";
  });
  assert.equal(state().transaction, null);
  actions.cancelTransaction(token);
  actions.undo();
  assert.equal(activeGlyph(state()).nodes.a.x, 105);
  assert.equal(state().project.style!.color, "#abcdef");
});

test("updates retain untouched branches and never mutate the caller's project or history", () => {
  const original = manuscript(),
    store = createProjectStore(original),
    before = store.getState().project;
  store.getState().actions.update((g) => {
    g.nodes.a.x = 120;
  });
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
  const { state, actions } = setup(),
    before = state().project;
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
  actions.update((g) => {
    g.color = "#123456";
  });
  actions.undo();
  const before = state().project,
    future = state().future;
  const id = actions.beginTransaction();
  actions.update((g) => {
    g.nodes.a.width = 80;
  }, id);
  actions.cancelTransaction(id);
  assert.equal(state().project, before);
  assert.equal(state().future, future);
  actions.update((g) => {
    g.name = "不应写入";
  }, id);
  actions.commitTransaction(id);
  assert.equal(state().project, before);
  actions.redo();
  assert.equal(activeGlyph(state()).color, "#123456");
});

test("empty, unchanged and round-trip gestures do not create history or clear redo", () => {
  const { state, actions } = setup();
  actions.update((g) => {
    g.name = "改名";
  });
  actions.undo();
  const before = state().project;
  actions.update((g) => {
    g.name = g.name;
  });
  actions.commitTransaction(actions.beginTransaction());
  const id = actions.beginTransaction();
  actions.update((g) => {
    g.nodes.a.x += 10;
  }, id);
  actions.update((g) => {
    g.nodes.a.x -= 10;
  }, id);
  actions.commitTransaction(id);
  assert.equal(state().project, before);
  assert.equal(state().past.length, 0);
  assert.equal(state().future.length, 1);
});

test("new stroke edits invalidate redo; typing a stroke name is one transaction", () => {
  const { state, actions } = setup();
  const originalName = activeGlyph(state()).strokes[0].name;
  actions.update((g) => {
    g.color = "#123456";
  });
  actions.undo();
  const id = actions.beginTransaction();
  for (const name of ["新", "新笔", "新笔画"])
    actions.update((g) => {
      g.strokes[0].name = name;
    }, id);
  actions.commitTransaction(id);
  assert.equal(state().future.length, 0);
  assert.equal(state().past.length, 1);
  actions.redo();
  assert.equal(activeGlyph(state()).strokes[0].name, "新笔画");
  actions.undo();
  assert.equal(activeGlyph(state()).strokes[0].name, originalName);
});

test("session changes do not enter history and navigation survives undo", () => {
  const { state, actions } = setup();
  const otherId = state().project.glyphs[1].id;
  actions.update((g) => {
    g.nodes.a.x = 140;
  });
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
  actions.update((g) => {
    g.name = "已提交";
  }, id);
  actions.switchGlyph(state().project.glyphs[1].id);
  const project = state().project;
  actions.update((g) => {
    g.name = "过期更新";
  }, id);
  actions.cancelTransaction(id);
  assert.equal(state().project, project);
  assert.equal(state().past.length, 1);
  assert.equal(activeGlyph(state()).name, "乙");
});

test("a new owner, a discrete edit and undo settle pending gestures without duplicate history", () => {
  const { state, actions } = setup();
  const first = actions.beginTransaction();
  actions.update((g) => {
    g.nodes.a.x = 120;
  }, first);
  const second = actions.beginTransaction();
  actions.cancelTransaction(first);
  assert.equal(state().transaction?.id, second);
  actions.update((g) => {
    g.nodes.a.width = 50;
  }, second);
  actions.update((g) => {
    g.color = "#123456";
  });
  assert.equal(state().past.length, 3);
  actions.undo();
  assert.equal(activeGlyph(state()).nodes.a.width, 50);
  const third = actions.beginTransaction();
  actions.update((g) => {
    g.nodes.a.width = 70;
  }, third);
  actions.undo();
  assert.equal(activeGlyph(state()).nodes.a.width, 50);
  assert.equal(state().transaction, null);
});

test("deleting nodes cleans selection and shared references, with lock protection", () => {
  const { state, actions } = setup();
  actions.update((g) => {
    g.strokes[1].locked = true;
  });
  actions.select("b");
  const locked = state().project;
  assert.equal(actions.removeSelection(), false);
  actions.moveSelection({ x: 10, y: 10 });
  assert.equal(state().project, locked);
  actions.update((g) => {
    g.strokes[1].locked = false;
  });
  assert.equal(actions.removeSelection(), true);
  assert.deepEqual(state().session.nodeIds, []);
  assert.equal(state().session.strokeId, null);
  assert.ok(isProject(state().project));
  actions.undo();
  assert.equal(activeGlyph(state()).strokes.length, 2);
  assert.equal(activeGlyph(state()).nodes.b.x, 200);
});

test("deleted glyphs, new glyphs and replaced manuscripts always leave a valid active selection", () => {
  const { state, actions } = setup();
  actions.select(null, null);
  assert.equal(actions.removeSelection(), false);
  actions.removeGlyph(state().project.activeId);
  assert.ok(isProject(state().project));
  actions.removeGlyph(state().project.activeId);
  assert.equal(state().project.glyphs.length, 1);
  assert.ok(isProject(state().project));
  actions.undo();
  actions.addGlyph();
  assert.equal(state().session.tool, "pen");
  const replacement = manuscript();
  replacement.glyphs[0].color = "#123456";
  actions.replace(replacement);
  assert.deepEqual(state().project, replacement);
  assert.notEqual(state().project, replacement);
  assert.deepEqual(state().session.nodeIds, []);
  assert.equal(state().session.tool, "select");
  actions.undo();
  assert.deepEqual(state().project, replacement);
  assert.equal(state().past.length, 0);
});

test("glyph metadata and copies survive undo and redo of earlier geometry edits", () => {
  const { state, actions } = setup();
  const sourceId = state().project.activeId;
  actions.update((g) => {
    g.nodes.a.x = 150;
  });
  actions.editGlyphInfo(sourceId, { name: "新名", description: "描述" });
  actions.duplicateGlyph();
  const copyId = state().project.activeId;
  assert.equal(state().past.length, 1);
  assert.equal(state().committedProject, state().project);
  actions.undo();
  assert.equal(state().project.activeId, copyId);
  assert.equal(state().project.glyphs[0].nodes.a.x, 100);
  assert.equal(state().project.glyphs[0].name, "新名");
  assert.equal(state().project.glyphs[0].description, "描述");
  assert.equal(activeGlyph(state()).nodes.a.x, 150);
  assert.equal(activeGlyph(state()).name, "新名 副本");
  actions.redo();
  assert.equal(state().project.glyphs[0].nodes.a.x, 150);
  assert.equal(state().project.glyphs.length, 3);
  // 副本的造字编辑仍有独立的一步历史。
  actions.update((g) => {
    g.nodes.a.x = 180;
  });
  actions.undo();
  assert.equal(activeGlyph(state()).nodes.a.x, 150);
  assert.equal(state().project.glyphs[0].nodes.a.x, 150);
});

test("library changes preserve redo and newly added or imported glyphs", () => {
  const { state, actions } = setup();
  const sourceId = state().project.activeId;
  actions.update((g) => {
    g.nodes.a.width = 55;
  });
  actions.undo();
  actions.editGlyphInfo(sourceId, { name: "新名" });
  actions.addGlyph();
  const blankId = state().project.activeId;
  const imported = manuscript().glyphs[0];
  imported.name = "导入";
  actions.addGlyph(imported);
  assert.equal(state().past.length, 0);
  assert.equal(state().future.length, 1);
  actions.redo();
  assert.equal(state().project.glyphs[0].nodes.a.width, 55);
  assert.equal(state().project.glyphs[0].name, "新名");
  assert.ok(state().project.glyphs.some((g) => g.id === blankId));
  assert.deepEqual(activeGlyph(state()), imported);
  actions.undo();
  assert.equal(state().project.glyphs.length, 4);
  assert.equal(state().project.glyphs[0].nodes.a.width, 30);
});

test("deleting a glyph prunes its past and future edits but retains other glyph and brush edits", () => {
  const { state, actions } = setup();
  const firstId = state().project.activeId,
    otherId = state().project.glyphs[1].id;
  actions.update((g) => {
    g.nodes.a.x = 150;
  });
  actions.switchGlyph(otherId);
  actions.update((g) => {
    g.color = "#123456";
  });
  actions.switchGlyph(firstId);
  actions.update((g) => {
    g.nodes.b.x = 250;
  });
  actions.changeBrush({ ...defaultBrush, startTip: "horizontal" });
  actions.undo();
  actions.undo();
  assert.equal(state().future.length, 2);
  actions.removeGlyph(firstId);
  assert.equal(state().past.length, 1);
  assert.equal(state().future.length, 1);
  assert.deepEqual(state().session.nodeIds, []);
  actions.undo();
  assert.notEqual(activeGlyph(state()).color, "#123456");
  actions.redo();
  assert.equal(activeGlyph(state()).color, "#123456");
  actions.redo();
  assert.equal(state().project.brush?.startTip, "horizontal");
  assert.deepEqual(
    state().project.glyphs.map((g) => g.id),
    [otherId],
  );
  assert.ok(isProject(state().project));
});

test("deleting the final glyph leaves a permanent blank glyph and no dead geometry history", () => {
  const { state, actions } = setup();
  actions.removeGlyph(state().project.glyphs[1].id);
  const id = actions.beginTransaction();
  actions.update((g) => {
    g.nodes.a.x = 150;
  }, id);
  actions.removeGlyph(state().project.activeId);
  const blank = state().project;
  actions.update((g) => {
    g.nodes.a.x = 999;
  }, id);
  actions.undo();
  actions.redo();
  assert.equal(state().project, blank);
  assert.equal(state().committedProject, blank);
  assert.equal(state().transaction, null);
  assert.equal(state().past.length, 0);
  assert.equal(state().future.length, 0);
  assert.deepEqual(activeGlyph(state()).nodes, {});
  assert.ok(isProject(blank));
});

test("global brush edits are transactional, affect locked strokes and keep unrelated geometry stable", () => {
  const { state, actions } = setup();
  actions.update((g) => {
    g.strokes[0].locked = true;
  });
  const glyphs = state().project.glyphs,
    previous = state().project.brush;
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
  const { state, actions } = setup(),
    other = setup();
  for (let i = 0; i < 75; i++)
    actions.update((_, p) => {
      p.glyphs[0].name = String(i);
    });
  assert.equal(state().past.length, 60);
  for (let i = 0; i < 61; i++) actions.undo();
  assert.equal(state().project.glyphs[0].name, "14");
  assert.equal(other.state().project.glyphs[0].name, "甲");
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
  const before = state().project,
    id = actions.beginTransaction();
  actions.update((g) => {
    g.nodes.d = { ...g.nodes.a, id: "d" };
  }, id);
  actions.select("d", null, id);
  assert.equal(state().transaction?.id, id);
  assert.equal(state().committedProject, before);
  actions.cancelTransaction(id);
  assert.deepEqual(state().session.nodeIds, []);
  assert.equal(state().past.length, 0);
});
