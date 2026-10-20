import { test } from "node:test";
import assert from "node:assert/strict";
import {
  centerPath,
  distance,
  glyphPath,
  outlinePath,
  strokeControls,
} from "../src/core/geometry";
import { emptyGlyph, newStroke } from "../src/core/model";
import type { Glyph, Point, Stroke } from "../src/core/model";
import { isProject } from "../src/core/validation";
import { exportSvg } from "../src/core/svg";
import {
  applyProjectPatch,
  createProjectPatch,
} from "../src/core/projectPatch";
import { brushPresets, defaultBrush } from "../src/core/brush";
import {
  activeGlyph,
  createProjectStore,
} from "../src/features/project/projectStore";
import {
  canInsertEdgeMidpoint,
  findStrokeEdge,
  insertEdgeMidpoint,
} from "../src/features/editor/strokeEdges";
import type { StrokeEdge } from "../src/features/editor/strokeEdges";

function fixture() {
  const glyph = emptyGlyph("甲");
  glyph.nodes = {
    a: { id: "a", x: 100, y: 100, width: 20, mode: "corner" },
    b: { id: "b", x: 300, y: 100, width: 40, mode: "corner" },
    c: { id: "c", x: 300, y: 500, width: 60, mode: "corner" },
    d: { id: "d", x: 500, y: 500, width: 80, mode: "corner" },
  };
  const stroke = newStroke(["a", "b", "c", "d"], 0);
  glyph.strokes = [stroke];
  const edge: StrokeEdge = {
    strokeId: stroke.id,
    index: 1,
    from: "b",
    to: "c",
  };
  return { glyph, stroke, edge };
}

function curve(glyph: Glyph, stroke: Stroke, index: number) {
  const nodes = structuredClone(stroke.nodes.map((id) => glyph.nodes[id]));
  const a = nodes[index],
    b = nodes[index + 1],
    [c, d] = strokeControls(nodes, stroke, index);
  return (t: number): Point => ({
    x:
      (1 - t) ** 3 * a.x +
      3 * (1 - t) ** 2 * t * c.x +
      3 * (1 - t) * t ** 2 * d.x +
      t ** 3 * b.x,
    y:
      (1 - t) ** 3 * a.y +
      3 * (1 - t) ** 2 * t * c.y +
      3 * (1 - t) * t ** 2 * d.y +
      t ** 3 * b.y,
  });
}

test("edge insertion splits only the targeted edge at its midpoint and interpolates width", () => {
  const { glyph, stroke, edge } = fixture();
  const before = structuredClone(glyph.nodes);
  assert.equal(findStrokeEdge(glyph, stroke, { x: 312, y: 180 })?.index, 1);
  assert.equal(insertEdgeMidpoint(glyph, edge, "new"), true);
  assert.deepEqual(stroke.nodes, ["a", "b", "new", "c", "d"]);
  assert.deepEqual(glyph.nodes.new, {
    id: "new",
    x: 300,
    y: 300,
    width: 50,
    mode: "corner",
  });
  for (const id of Object.keys(before))
    assert.deepEqual(glyph.nodes[id], before[id]);
  assert.ok(isProject({ version: 1, glyphs: [glyph], activeId: glyph.id }));
});

test("curved edge insertion preserves both halves and the neighboring curves", () => {
  for (const mode of ["corner", "smooth", "symmetric"] as const) {
    for (const explicit of [false, true]) {
      const { glyph, stroke, edge } = fixture();
      glyph.nodes.b.mode = mode;
      glyph.nodes.c.mode = "smooth";
      if (explicit) {
        glyph.nodes.b.handle = { x: 150, y: 80 };
        glyph.nodes.b.handleIn = { x: -100, y: -70 };
        glyph.nodes.c.handle = { x: 90, y: 30 };
        glyph.nodes.c.handleIn = { x: 80, y: -120 };
      }
      const original = [0, 1, 2].map((i) => curve(glyph, stroke, i));
      assert.equal(insertEdgeMidpoint(glyph, edge, "new"), true);
      assert.ok(distance(glyph.nodes.new, original[1](0.5)) < 1e-9);
      const split = [0, 1, 2, 3].map((i) => curve(glyph, stroke, i));
      for (let step = 0; step <= 100; step++) {
        const t = step / 100;
        assert.ok(distance(original[0](t), split[0](t)) < 1e-9);
        assert.ok(distance(original[2](t), split[3](t)) < 1e-9);
        assert.ok(distance(original[1](t / 2), split[1](t)) < 1e-9);
        assert.ok(distance(original[1](0.5 + t / 2), split[2](t)) < 1e-9);
      }
      assert.ok(isProject({ version: 1, glyphs: [glyph], activeId: glyph.id }));
    }
  }
});

test("edge hit testing follows curves instead of the straight chord between nodes", () => {
  const { glyph, stroke } = fixture();
  glyph.nodes.a.mode = "smooth";
  glyph.nodes.a.handle = { x: 0, y: 400 };
  glyph.nodes.b.mode = "smooth";
  glyph.nodes.b.handleIn = { x: 0, y: 400 };
  assert.equal(findStrokeEdge(glyph, stroke, { x: 200, y: 400 })?.index, 0);
});

test("closed strokes allow inserting on their closing edge without breaking the shared endpoint", () => {
  const { glyph, stroke } = fixture();
  stroke.nodes.push("a");
  const edge: StrokeEdge = {
    strokeId: stroke.id,
    index: 3,
    from: "d",
    to: "a",
  };
  assert.equal(insertEdgeMidpoint(glyph, edge, "new"), true);
  assert.deepEqual(stroke.nodes, ["a", "b", "c", "d", "new", "a"]);
  assert.equal(glyph.nodes.new.x, 300);
  assert.equal(glyph.nodes.new.y, 300);
});

test("inserting on the first or last curved edge preserves endpoint handles and closed curves", () => {
  for (const closed of [false, true]) {
    for (const first of [false, true]) {
      const { glyph, stroke } = fixture();
      Object.values(glyph.nodes).forEach((node) => {
        node.mode = "smooth";
      });
      if (closed) stroke.nodes.push("a");
      const index = first ? 0 : stroke.nodes.length - 2;
      const edge: StrokeEdge = {
        strokeId: stroke.id,
        index,
        from: stroke.nodes[index],
        to: stroke.nodes[index + 1],
      };
      const original = stroke.nodes
        .slice(1)
        .map((_, i) => curve(glyph, stroke, i));
      assert.equal(insertEdgeMidpoint(glyph, edge, "new"), true);
      for (let i = 0; i < original.length; i++) {
        const left = curve(glyph, stroke, i <= index ? i : i + 1);
        const right = i === index ? curve(glyph, stroke, i + 1) : left;
        for (let step = 0; step <= 100; step++) {
          const t = step / 100;
          const actual =
            i !== index ? left(t) : t <= 0.5 ? left(t * 2) : right(t * 2 - 1);
          assert.ok(distance(original[i](t), actual) < 1e-9);
        }
      }
    }
  }
});

test("locked strokes, locked shared endpoints and stale edge targets cannot be changed", () => {
  for (const kind of [
    "locked",
    "shared",
    "stale",
    "missing",
    "hidden",
    "invalid",
    "duplicate",
  ] as const) {
    const { glyph, stroke, edge } = fixture();
    if (kind === "locked") stroke.locked = true;
    if (kind === "shared")
      glyph.strokes.push({ ...newStroke(["a", "b"], 1), locked: true });
    if (kind === "stale") stroke.nodes.splice(2, 0, "d");
    if (kind === "missing") edge.strokeId = "missing";
    if (kind === "hidden") stroke.visible = false;
    if (kind === "invalid") edge.index = -1;
    const before = structuredClone(glyph);
    if (kind !== "duplicate")
      assert.equal(canInsertEdgeMidpoint(glyph, edge), false);
    assert.equal(
      insertEdgeMidpoint(glyph, edge, kind === "duplicate" ? "a" : "new"),
      false,
    );
    assert.deepEqual(glyph, before);
  }
});

test("a curve midpoint outside the canvas cannot create invalid manuscript coordinates", () => {
  const { glyph, stroke, edge } = fixture();
  glyph.nodes.b.mode = "smooth";
  glyph.nodes.b.handle = { x: 2000, y: 0 };
  const before = structuredClone(glyph);
  assert.equal(canInsertEdgeMidpoint(glyph, edge), false);
  assert.equal(insertEdgeMidpoint(glyph, edge, "new"), false);
  assert.deepEqual(glyph, before);
  stroke.nodes = ["a"];
  assert.equal(findStrokeEdge(glyph, stroke, { x: 100, y: 100 }), undefined);
});

test("shared automatic and explicit curve handles retain every peer and the same node IDs", () => {
  for (const explicit of [false, true]) {
    for (const reverse of [false, true]) {
      const { glyph, stroke, edge } = fixture();
      glyph.nodes.b.mode = "smooth";
      glyph.nodes.c.mode = "symmetric";
      if (explicit) {
        glyph.nodes.b.handle = { x: 80, y: 30 };
        glyph.nodes.b.handleIn = { x: -50, y: -10 };
        glyph.nodes.c.handle = { x: 60, y: 20 };
      }
      const peer = newStroke(reverse ? ["d", "b"] : ["b", "d"], 1);
      const other = { ...newStroke(["a", "c"], 2), visible: false };
      glyph.strokes.push(peer, other);
      const nodes = structuredClone(glyph.nodes);
      const paths = glyph.strokes
        .slice(1)
        .map((s) => [centerPath(glyph, s), outlinePath(glyph, s)]);
      const original = stroke.nodes
        .slice(1)
        .map((_, i) => curve(glyph, stroke, i));
      assert.ok(insertEdgeMidpoint(glyph, edge, "mid"));
      for (const [id, node] of Object.entries(nodes))
        assert.deepEqual(glyph.nodes[id], node);
      assert.deepEqual(
        glyph.strokes
          .slice(1)
          .map((s) => [centerPath(glyph, s), outlinePath(glyph, s)]),
        paths,
      );
      assert.deepEqual(peer.nodes, reverse ? ["d", "b"] : ["b", "d"]);
      assert.deepEqual(other.nodes, ["a", "c"]);
      for (let i = 0; i < original.length; i++) {
        const left = curve(glyph, stroke, i <= edge.index ? i : i + 1);
        const right = i === edge.index ? curve(glyph, stroke, i + 1) : left;
        for (let step = 0; step <= 100; step++) {
          const t = step / 100;
          assert.ok(
            distance(
              original[i](t),
              i !== edge.index
                ? left(t)
                : t < 0.5
                  ? left(t * 2)
                  : right(t * 2 - 1),
            ) < 1e-9,
          );
        }
      }
    }
  }
});

test("repeated node references keep their separate curve occurrences and fill contours", () => {
  for (const index of [0, 1, 2, 3]) {
    const { glyph, stroke } = fixture();
    glyph.nodes.b.mode = "smooth";
    glyph.nodes.b.handle = { x: 80, y: 30 };
    stroke.nodes = ["b", "a", "b", "c", "b"];
    const original = stroke.nodes
      .slice(1)
      .map((_, i) => curve(glyph, stroke, i));
    const path = outlinePath(glyph, stroke);
    const before = structuredClone(glyph.nodes);
    const edge: StrokeEdge = {
      strokeId: stroke.id,
      index,
      from: stroke.nodes[index],
      to: stroke.nodes[index + 1],
    };
    assert.ok(insertEdgeMidpoint(glyph, edge, "mid"));
    assert.equal(outlinePath(glyph, stroke), path);
    for (const [id, node] of Object.entries(before))
      assert.deepEqual(glyph.nodes[id], node);
    for (let i = 0; i < original.length; i++) {
      if (i === index) continue;
      const unchanged = curve(glyph, stroke, i < index ? i : i + 1);
      for (let step = 0; step <= 100; step++)
        assert.ok(
          distance(original[i](step / 100), unchanged(step / 100)) < 1e-9,
        );
    }
  }
});

test("repeated subdivisions preserve the actual straight and curved contours for every brush preset", () => {
  for (const curved of [false, true]) {
    for (const preset of brushPresets) {
      for (const length of [25, 100, 250]) {
        const { glyph, stroke } = fixture();
        stroke.nodes = ["a", "b"];
        glyph.nodes.a.width = 80;
        glyph.nodes.b.width = 120;
        if (curved) {
          glyph.nodes.a.mode = "smooth";
          glyph.nodes.a.handle = { x: 40, y: 120 };
          glyph.nodes.b.mode = "smooth";
          glyph.nodes.b.handleIn = { x: -40, y: 60 };
        }
        const brush = {
          ...defaultBrush,
          startTip: preset.start,
          endTip: preset.end,
          startBrush: { length, spread: 180 },
          endBrush: { length, spread: 120 },
        };
        const original = outlinePath(glyph, stroke, brush);
        const originalSvg = exportSvg(glyph, brush);
        for (let i = 0; i < 6; i++) {
          const index = i % 2 === 0 ? 0 : stroke.nodes.length - 2;
          assert.ok(
            insertEdgeMidpoint(
              glyph,
              {
                strokeId: stroke.id,
                index,
                from: stroke.nodes[index],
                to: stroke.nodes[index + 1],
              },
              `mid${i}`,
            ),
          );
          assert.equal(
            outlinePath(glyph, stroke, brush),
            original,
            `${curved} ${preset.name} ${length} ${i}`,
          );
          assert.equal(exportSvg(glyph, brush), originalSvg);
        }
        const project = {
          version: 1 as const,
          activeId: glyph.id,
          glyphs: [glyph],
          brush,
        };
        const reopened = JSON.parse(JSON.stringify(project));
        assert.ok(isProject(reopened));
        assert.equal(glyphPath(reopened.glyphs[0], reopened.brush), original);
      }
    }
  }
});

test("subdivision geometry survives PATCH persistence, complete undo/redo and invalidated redo", () => {
  const { glyph, stroke, edge } = fixture();
  glyph.nodes.b.mode = "smooth";
  glyph.nodes.b.handle = { x: 80, y: 30 };
  glyph.strokes.push(newStroke(["b", "d"], 1));
  const other = emptyGlyph("乙");
  const store = createProjectStore({
    version: 1,
    activeId: glyph.id,
    glyphs: [glyph, other],
    brush: { ...defaultBrush, startTip: "horizontal", endTip: "vertical" },
  });
  const state = store.getState,
    actions = state().actions;
  const before = state().project,
    path = glyphPath(activeGlyph(state()), before.brush);
  actions.update((g) => {
    assert.ok(insertEdgeMidpoint(g, edge, "mid"));
  });
  actions.select("mid", stroke.id);
  const inserted = state().project;
  assert.equal(state().past.length, 1);
  assert.equal(glyphPath(activeGlyph(state()), inserted.brush), path);
  assert.deepEqual(
    applyProjectPatch(
      before,
      JSON.parse(JSON.stringify(createProjectPatch(before, inserted))),
    ),
    inserted,
  );
  assert.deepEqual(
    applyProjectPatch(inserted, createProjectPatch(inserted, before)),
    before,
  );
  actions.undo();
  assert.deepEqual(state().project, before);
  assert.deepEqual(state().session.nodeIds, []);
  assert.equal(state().committedProject, state().project);
  actions.redo();
  assert.deepEqual(state().project, inserted);
  assert.equal(glyphPath(activeGlyph(state()), inserted.brush), path);
  actions.select("mid", stroke.id);
  const transaction = actions.beginTransaction();
  actions.moveSelection({ x: 15, y: -20 }, transaction);
  assert.ok(isProject(state().project));
  assert.notEqual(glyphPath(activeGlyph(state()), inserted.brush), path);
  actions.cancelTransaction(transaction);
  assert.deepEqual(state().project, inserted);
  actions.undo();
  actions.switchGlyph(other.id);
  actions.redo();
  assert.equal(state().project.activeId, other.id);
  assert.deepEqual(state().project.glyphs[0], inserted.glyphs[0]);
  actions.switchGlyph(glyph.id);
  actions.undo();
  actions.update((g) => {
    assert.ok(insertEdgeMidpoint(g, edge, "replacement"));
  });
  assert.equal(state().future.length, 0);
  actions.redo();
  assert.ok(activeGlyph(state()).nodes.replacement);
  assert.equal(activeGlyph(state()).nodes.mid, undefined);
});

test("ordinary edits, duplication and deletion keep subdivided edges editable and valid", () => {
  const { glyph, stroke, edge } = fixture();
  glyph.nodes.b.mode = "smooth";
  glyph.nodes.c.mode = "smooth";
  insertEdgeMidpoint(glyph, edge, "mid");
  const store = createProjectStore({
    version: 1,
    activeId: glyph.id,
    glyphs: [glyph],
  });
  const state = store.getState,
    actions = state().actions;
  const initial = state().project;
  actions.selectNodes(stroke.nodes, stroke.id);
  actions.moveSelection({ x: 10, y: 20 });
  assert.deepEqual(
    activeGlyph(state()).strokes[0].segments,
    glyph.strokes[0].segments,
  );
  assert.ok(isProject(state().project));
  actions.undo();
  assert.deepEqual(state().project, initial);
  actions.update((g) => {
    g.nodes.b.handle = { x: 50, y: -10 };
  });
  const updated = activeGlyph(state()),
    [out] = strokeControls(
      updated.strokes[0].nodes.map((id) => updated.nodes[id]),
      updated.strokes[0],
      1,
    );
  assert.deepEqual(out, { x: 350, y: 90 });
  assert.ok(isProject(state().project));
  actions.undo();
  actions.select(null, stroke.id);
  actions.duplicateStroke();
  const copy = activeGlyph(state()).strokes[1];
  assert.ok(copy.segments);
  assert.ok(
    copy.segments.every(
      (s, i) => s.from === copy.nodes[i] && s.to === copy.nodes[i + 1],
    ),
  );
  assert.ok(isProject(state().project));
  actions.undo();
  actions.select("mid", stroke.id);
  actions.removeSelection();
  assert.ok(isProject(state().project));
  assert.equal(activeGlyph(state()).nodes.mid, undefined);
  actions.undo();
  assert.deepEqual(state().project, initial);
});

test("validation rejects corrupt segment references, handles and sampling intervals", () => {
  const { glyph, edge } = fixture();
  insertEdgeMidpoint(glyph, edge, "mid");
  const project = { version: 1 as const, activeId: glyph.id, glyphs: [glyph] };
  const invalid = [
    (g: Glyph) => {
      g.strokes[0].segments!.pop();
    },
    (g: Glyph) => {
      g.strokes[0].segments![0].from = "absent";
    },
    (g: Glyph) => {
      g.strokes[0].segments![1].handleOut.x = NaN;
    },
    (g: Glyph) => {
      g.strokes[0].segments![1].sampling!.steps = 0;
    },
    (g: Glyph) => {
      g.strokes[0].segments![1].sampling!.start = 0.25;
    },
    (g: Glyph) => {
      g.strokes[0].segments![2].sampling!.end = 0.75;
    },
    (g: Glyph) => {
      g.strokes[0].segments![2].sampling!.steps += 1;
    },
    (g: Glyph) => {
      g.strokes[0].segments![2].sampling!.group = "other";
    },
  ];
  for (const mutate of invalid) {
    const broken = structuredClone(project);
    mutate(broken.glyphs[0]);
    assert.equal(isProject(broken), false);
  }
  assert.ok(isProject(project));
});

test("editing an inserted corner keeps straight adjacent edges and further insertions preserve the edited contour", () => {
  const { glyph, stroke, edge } = fixture();
  insertEdgeMidpoint(glyph, edge, "mid");
  const store = createProjectStore({
    version: 1,
    activeId: glyph.id,
    glyphs: [glyph],
    brush: { ...defaultBrush, startTip: "horizontal", endTip: "vertical" },
  });
  const state = store.getState,
    actions = state().actions;
  const before = state().project;
  actions.select("mid", stroke.id);
  actions.moveSelection({ x: 50, y: -30 });
  const moved = activeGlyph(state()),
    target = moved.strokes[0];
  const nodes = target.nodes.map((id) => moved.nodes[id]);
  assert.deepEqual(strokeControls(nodes, target, 1)[1], {
    x: moved.nodes.mid.x,
    y: moved.nodes.mid.y,
  });
  assert.deepEqual(strokeControls(nodes, target, 2)[0], {
    x: moved.nodes.mid.x,
    y: moved.nodes.mid.y,
  });
  const path = glyphPath(moved, state().project.brush);
  actions.update((g) => {
    assert.ok(
      insertEdgeMidpoint(
        g,
        { strokeId: stroke.id, index: 1, from: "b", to: "mid" },
        "again",
      ),
    );
  });
  assert.ok(isProject(state().project));
  assert.equal(glyphPath(activeGlyph(state()), state().project.brush), path);
  actions.undo();
  actions.undo();
  assert.deepEqual(state().project, before);
});

test("subdivided stroke copies use one bounded offset and keep contours, references and history intact", () => {
  for (const [ax, ay, bx, by, dx, dy] of [
    [600, 100, 640, 500, 0, 24],
    [580, 500, 625, 640, 15, 0],
    [600, 600, 640, 640, 0, 0],
  ]) {
    for (const curved of [false, true]) {
      for (const closed of [false, true]) {
        const glyph = emptyGlyph("甲");
        glyph.nodes = {
          a: {
            id: "a",
            x: ax,
            y: ay,
            width: 2,
            mode: curved ? "smooth" : "corner",
            ...(curved ? { handle: { x: 10, y: 30 } } : {}),
          },
          b: { id: "b", x: bx, y: by, width: 4, mode: "corner" },
        };
        const stroke = newStroke(closed ? ["a", "b", "a"] : ["a", "b"], 0);
        glyph.strokes = [stroke];
        insertEdgeMidpoint(
          glyph,
          { strokeId: stroke.id, index: 0, from: "a", to: "b" },
          "mid",
        );
        const brush = {
          ...defaultBrush,
          startTip: "horizontal" as const,
          endTip: "vertical" as const,
        };
        const store = createProjectStore({
          version: 1,
          activeId: glyph.id,
          glyphs: [glyph],
          brush,
        });
        const state = store.getState,
          actions = state().actions,
          before = state().project;
        const expected = structuredClone(glyph);
        Object.values(expected.nodes).forEach((n) => {
          n.x += dx;
          n.y += dy;
        });
        actions.select(null, stroke.id);
        actions.duplicateStroke();
        const copied = state().project,
          current = activeGlyph(state()),
          copy = current.strokes[1];
        assert.equal(state().past.length, 1);
        assert.equal(current.strokes[0], before.glyphs[0].strokes[0]);
        assert.equal(
          outlinePath(current, copy, brush),
          outlinePath(expected, expected.strokes[0], brush),
        );
        assert.ok(isProject(copied));
        const mapping = new Map(
          stroke.nodes.map((id, i) => [id, copy.nodes[i]]),
        );
        assert.equal(new Set(copy.nodes).size, new Set(stroke.nodes).size);
        stroke.nodes.forEach((id, i) => {
          const original = glyph.nodes[id],
            node = current.nodes[copy.nodes[i]];
          assert.equal(copy.nodes[i], mapping.get(id));
          assert.notEqual(node.id, id);
          assert.equal(node.x - original.x, dx);
          assert.equal(node.y - original.y, dy);
          assert.ok(
            node.x >= 0 && node.x <= 640 && node.y >= 0 && node.y <= 640,
          );
        });
        assert.ok(
          copy.segments!.every(
            (s, i) => s.from === copy.nodes[i] && s.to === copy.nodes[i + 1],
          ),
        );
        assert.equal(
          applyProjectPatch(before, createProjectPatch(before, copied))
            .glyphs[0].strokes.length,
          2,
        );
        actions.undo();
        assert.equal(state().project, before);
        actions.redo();
        assert.equal(state().project, copied);
        actions.select(mapping.get("mid")!, copy.id);
        actions.moveSelection({ x: -5, y: 0 });
        assert.equal(
          activeGlyph(state()).strokes[0],
          before.glyphs[0].strokes[0],
        );
        assert.ok(isProject(state().project));
        actions.undo();
        assert.equal(state().project, copied);
        actions.select(null, stroke.id);
        actions.removeSelection();
        const remaining = state().project;
        assert.ok(isProject(remaining));
        assert.equal(activeGlyph(state()).strokes[0].id, copy.id);
        assert.equal(
          Object.keys(activeGlyph(state()).nodes).length,
          new Set(copy.nodes).size,
        );
        assert.equal(
          outlinePath(
            activeGlyph(state()),
            activeGlyph(state()).strokes[0],
            brush,
          ),
          outlinePath(expected, expected.strokes[0], brush),
        );
        actions.undo();
        assert.equal(state().project, copied);
        actions.redo();
        assert.equal(state().project, remaining);
        actions.select(null, copy.id);
        actions.removeSelection();
        assert.deepEqual(activeGlyph(state()).nodes, {});
        assert.deepEqual(activeGlyph(state()).strokes, []);
        actions.undo();
        assert.equal(state().project, remaining);
      }
    }
  }
});

test("incremental node and width transactions restore subdivision metadata when returning to their initial values", () => {
  const { glyph, edge } = fixture();
  insertEdgeMidpoint(glyph, edge, "mid");
  const store = createProjectStore({
    version: 1,
    activeId: glyph.id,
    glyphs: [glyph],
  });
  const state = store.getState,
    actions = state().actions;
  actions.update((g) => {
    g.color = "#000000";
  });
  actions.undo();
  actions.select("mid");
  const before = state().project,
    future = state().future;
  for (const kind of ["position", "width"]) {
    const token = actions.beginTransaction();
    if (kind === "position") {
      actions.moveSelection({ x: 30, y: 20 }, token);
      actions.moveSelection({ x: -30, y: -20 }, token);
    } else {
      actions.update((g) => {
        g.nodes.mid.width += 20;
      }, token);
      actions.update((g) => {
        g.nodes.mid.width -= 20;
      }, token);
    }
    actions.commitTransaction(token);
    assert.equal(state().project, before);
    assert.equal(state().past.length, 0);
    assert.equal(state().future, future);
  }
});
