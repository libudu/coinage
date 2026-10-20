import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";
import { act, createElement as h } from "react";
import { emptyGlyph, newStroke } from "../src/core/model";
import { defaultBrush } from "../src/core/brush";
import { glyphPath } from "../src/core/geometry";
import { insertEdgeMidpoint } from "../src/features/editor/strokeEdges";
import { activeGlyph } from "../src/features/project/projectStore";
import type { ProjectStore } from "../src/features/project/projectStore";
import { projectStorage } from "../src/features/project/projectStorage";

register("./support/domLoader.mjs", import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://127.0.0.1",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
});
const { createRoot } = await import("react-dom/client");
const { ProjectProvider, useProjectApi } =
  await import("../src/features/project/useProject");
const { ToastProvider } = await import("../src/shared/components/Toast");
const { EditorCanvas } = await import("../src/features/editor/EditorCanvas");

async function render(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(projectStorage, "save", async () => {});
  const glyph = emptyGlyph("甲");
  glyph.nodes = {
    a: {
      id: "a",
      x: 100,
      y: 100,
      width: 40,
      mode: "smooth",
      handle: { x: 50, y: 0 },
    },
    b: { id: "b", x: 300, y: 300, width: 80, mode: "corner" },
  };
  glyph.strokes = [newStroke(["a", "b"], 0)];
  insertEdgeMidpoint(
    glyph,
    { strokeId: glyph.strokes[0].id, index: 0, from: "a", to: "b" },
    "mid",
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let store!: ProjectStore;
  function Probe() {
    store = useProjectApi();
    return h(EditorCanvas, {
      importFile: () => {},
      modalOpen: false,
      showShortcuts: () => {},
      openContextMenu: () => {},
    });
  }
  await act(async () =>
    root.render(
      h(ProjectProvider, {
        initialProject: {
          version: 1,
          activeId: glyph.id,
          glyphs: [glyph],
          brush: defaultBrush,
        },
        children: h(ToastProvider, null, h(Probe)),
      }),
    ),
  );
  t.after(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  return { store, container, stage: container.querySelector(".canvas-stage")! };
}

async function wheel(
  target: Element,
  deltaY: number,
  options: WheelEventInit = {},
) {
  const event = new dom.window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY,
    ...options,
  });
  await act(async () => {
    target.dispatchEvent(event);
  });
  assert.equal(event.defaultPrevented, true);
}
async function settle(t: TestContext) {
  await act(async () => t.mock.timers.tick(200));
}

test("wheel scales only selected nodes proportionally and commits one undo step per burst", async (t) => {
  const { store, stage } = await render(t);
  const state = store.getState,
    actions = state().actions;
  await act(async () => actions.selectNodes(["a", "mid"]));
  const before = state().project;
  await wheel(stage, -120);
  await wheel(stage, -120);
  const edited = activeGlyph(state());
  assert.ok(edited.nodes.a.width > 40);
  assert.equal(
    edited.nodes.a.width / 40,
    edited.nodes.mid.width / before.glyphs[0].nodes.mid.width,
  );
  assert.equal(edited.nodes.b.width, 80);
  assert.equal(state().committedProject, before);
  assert.equal(state().past.length, 0);
  await settle(t);
  const after = state().project;
  assert.equal(state().committedProject, after);
  assert.equal(state().past.length, 1);
  await act(async () => actions.undo());
  assert.deepEqual(state().project, before);
  await act(async () => actions.redo());
  assert.deepEqual(state().project, after);
  await act(async () => actions.select("mid"));
  await wheel(stage, 120);
  await settle(t);
  assert.ok(
    activeGlyph(state()).nodes.mid.width < after.glyphs[0].nodes.mid.width,
  );
  assert.equal(state().past.length, 2);
});

test("opposite wheel deltas restore split geometry and preserve redo history", async (t) => {
  const { store, stage } = await render(t);
  const state = store.getState,
    actions = state().actions;
  await act(async () => {
    actions.update((g) => {
      g.color = "#000000";
    });
    actions.undo();
    actions.select("mid");
  });
  const before = state().project,
    future = state().future;
  await wheel(stage, -120);
  assert.notEqual(glyphPath(activeGlyph(state())), glyphPath(before.glyphs[0]));
  await wheel(stage, 120);
  await settle(t);
  assert.equal(state().project, before);
  assert.equal(state().future, future);
  assert.equal(state().past.length, 0);
});

test("wheel respects width limits, shared-node locks and unrelated active transactions", async (t) => {
  const { store, stage } = await render(t);
  const state = store.getState,
    actions = state().actions;
  await act(async () => actions.select("a"));
  await wheel(stage, -100000);
  assert.equal(activeGlyph(state()).nodes.a.width, 200);
  await settle(t);
  await wheel(stage, 100000);
  assert.equal(activeGlyph(state()).nodes.a.width, 1);
  await settle(t);
  await act(async () =>
    actions.update((g) => {
      g.strokes.push({ ...newStroke(["a", "b"], 1), locked: true });
    }),
  );
  const locked = state().project;
  await wheel(stage, -120);
  assert.equal(state().project, locked);
  assert.equal(state().transaction, null);
  await act(async () =>
    actions.update((g) => {
      g.strokes[1].locked = false;
    }),
  );
  const before = state().project;
  let token!: symbol;
  await act(async () => {
    token = actions.beginTransaction();
  });
  await wheel(stage, -120);
  assert.equal(state().transaction?.id, token);
  assert.equal(state().project, before);
});

test("selection changes and stale wheel timers cannot commit another control's transaction", async (t) => {
  const { store, stage } = await render(t);
  const state = store.getState,
    actions = state().actions;
  await act(async () => actions.select("a"));
  await wheel(stage, -120);
  const aWidth = activeGlyph(state()).nodes.a.width;
  await act(async () => actions.select("b"));
  assert.equal(state().past.length, 1);
  await wheel(stage, 120);
  assert.equal(activeGlyph(state()).nodes.a.width, aWidth);
  assert.ok(activeGlyph(state()).nodes.b.width < 80);
  let token!: symbol;
  await act(async () => {
    token = actions.beginTransaction();
    actions.update((g) => {
      g.color = "#000000";
    }, token);
  });
  await settle(t);
  assert.equal(state().transaction?.id, token);
  assert.equal(state().past.length, 2);
});

test("Ctrl and Command wheel keep zooming; unselected and hand modes keep panning", async (t) => {
  const { store, stage, container } = await render(t);
  const state = store.getState,
    actions = state().actions,
    before = state().project;
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
    const zoom = container.querySelector(".zoom-value")!.textContent;
    await wheel(stage, -120, modifier);
    assert.notEqual(container.querySelector(".zoom-value")!.textContent, zoom);
    assert.equal(state().project, before);
  }
  const artboard = () =>
    container.querySelector<HTMLDivElement>(".artboard-wrap")?.style.transform;
  await act(async () => actions.select(null));
  const transform = artboard();
  await wheel(stage, 120);
  assert.notEqual(artboard(), transform);
  await act(async () => {
    actions.select("a");
    actions.setTool("hand");
  });
  await wheel(stage, -120);
  assert.equal(state().project, before);
  assert.equal(state().past.length, 0);
});

test("line wheel units match pixel deltas and window blur commits pending changes", async (t) => {
  const { store, stage } = await render(t);
  const state = store.getState,
    actions = state().actions;
  await act(async () => actions.select("a"));
  const before = state().project;
  await wheel(stage, -3, { deltaMode: 1 });
  await wheel(stage, 120);
  await settle(t);
  assert.equal(state().project, before);
  await wheel(stage, -120);
  await act(async () => window.dispatchEvent(new dom.window.Event("blur")));
  assert.equal(state().transaction, null);
  assert.equal(state().past.length, 1);
  assert.equal(state().committedProject, state().project);
});
