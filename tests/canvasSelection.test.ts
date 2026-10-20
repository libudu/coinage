import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";
import { act, createElement as h } from "react";
import { emptyGlyph, newStroke } from "../src/core/model";
import { defaultBrush } from "../src/core/brush";
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
  DOMPoint: class {
    constructor(
      public x: number,
      public y: number,
    ) {}
    matrixTransform() {
      return { x: (this.x - 40) / 2, y: (this.y - 60) / 2 };
    }
  },
});
const captures = new WeakMap<Element, number>();
Object.assign(dom.window.Element.prototype, {
  setPointerCapture(id: number) {
    captures.set(this, id);
  },
  hasPointerCapture(id: number) {
    return captures.get(this) === id;
  },
  releasePointerCapture(id: number) {
    if (captures.get(this) === id) captures.delete(this);
  },
});
Object.assign(dom.window.SVGElement.prototype, {
  getScreenCTM: () => ({ inverse: () => ({}) }),
});
const { createRoot } = await import("react-dom/client");
const { ProjectProvider, useProjectApi } =
  await import("../src/features/project/useProject");
const { ToastProvider } = await import("../src/shared/components/Toast");
const { EditorCanvas } = await import("../src/features/editor/EditorCanvas");

async function render(t: TestContext) {
  t.mock.method(projectStorage, "save", async () => {});
  const glyph = emptyGlyph("甲");
  glyph.nodes = Object.fromEntries(
    (
      [
        ["a", 100, 100],
        ["b", 200, 200],
        ["c", 400, 400],
        ["hidden", 140, 140],
        ["locked", 160, 160],
        ["shared", 180, 180],
        ["single", 120, 120],
        ["edge", 0, 0],
      ] as const
    ).map(([id, x, y]) => [id, { id, x, y, width: 40, mode: "corner" }]),
  );
  glyph.strokes = [
    newStroke(["a", "b", "c", "shared"], 0),
    { ...newStroke(["hidden", "c"], 1), visible: false },
    { ...newStroke(["locked", "shared"], 2), locked: true },
  ];
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
          glyphs: [glyph, emptyGlyph("乙")],
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
  const stage = container.querySelector(".canvas-stage")!;
  const svg = container.querySelector("svg.artboard")!;
  const box = () => container.querySelector(".selection-marquee");
  return { store, stage, svg, container, box };
}

async function pointer(
  target: Element,
  type: string,
  x: number,
  y: number,
  options: MouseEventInit & { pointerId?: number } = {},
) {
  const event = new dom.window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x * 2 + 40,
    clientY: y * 2 + 60,
    ...options,
  });
  Object.defineProperties(event, {
    pointerId: { value: options.pointerId ?? 1 },
    isPrimary: { value: true },
  });
  await act(async () => {
    target.dispatchEvent(event);
  });
}

test("marquee selects visible editable nodes in either direction through the canvas transform without changing history", async (t) => {
  const { store, stage, svg, container, box } = await render(t);
  const state = store.getState,
    actions = state().actions;
  await act(async () => {
    actions.update((g) => {
      g.color = "#000000";
    });
    actions.undo();
  });
  const before = state().project,
    future = state().future;
  for (const [start, end] of [
    [
      [80, 80],
      [200, 200],
    ],
    [
      [200, 200],
      [80, 80],
    ],
  ]) {
    await pointer(svg, "pointerdown", ...(start as [number, number]));
    assert.equal(stage.hasPointerCapture(1), true);
    await pointer(stage, "pointermove", ...(end as [number, number]));
    assert.deepEqual(state().session.nodeIds, ["a", "b", "single"]);
    assert.deepEqual(
      [box()!.getAttribute("x"), box()!.getAttribute("width")],
      ["80", "120"],
    );
    assert.equal(
      container
        .querySelector('[data-node-id="a"]')!
        .getAttribute("data-selected"),
      "true",
    );
    await pointer(stage, "pointerup", ...(end as [number, number]));
    assert.equal(box(), null);
    assert.equal(stage.hasPointerCapture(1), false);
    assert.equal(state().project, before);
    assert.equal(state().committedProject, before);
    assert.equal(state().future, future);
    assert.equal(state().past.length, 0);
    assert.equal(state().transaction, null);
  }
  await pointer(svg, "pointerdown", 450, 450);
  await pointer(stage, "pointermove", 500, 500);
  assert.deepEqual(state().session.nodeIds, []);
  await pointer(stage, "pointerup", 500, 500);
});

test("marquee can start outside the artboard and does not clamp outside points to border nodes", async (t) => {
  const { store, stage } = await render(t);
  await pointer(stage, "pointerdown", -100, -100);
  await pointer(stage, "pointermove", -20, -20);
  assert.deepEqual(store.getState().session.nodeIds, []);
  await pointer(stage, "pointermove", 130, 130);
  assert.deepEqual(store.getState().session.nodeIds, ["a", "single", "edge"]);
  await pointer(stage, "pointerup", 130, 130);
});

for (const modifier of ["shiftKey", "ctrlKey", "metaKey"]) {
  test(`${modifier} adds to the original selection while the marquee shrinks`, async (t) => {
    const { store, stage, svg } = await render(t);
    await act(async () => store.getState().actions.select("c"));
    await pointer(svg, "pointerdown", 80, 80, { [modifier]: true });
    await pointer(stage, "pointermove", 220, 220);
    assert.deepEqual(store.getState().session.nodeIds, [
      "c",
      "a",
      "b",
      "single",
    ]);
    await pointer(stage, "pointermove", 130, 130);
    assert.deepEqual(store.getState().session.nodeIds, ["c", "a", "single"]);
    await pointer(stage, "pointerup", 130, 130);
  });
}

test("pointer cancellation and Escape restore selection; unrelated pointers cannot change or finish a marquee", async (t) => {
  const { store, stage, svg, box } = await render(t);
  const sid = activeGlyph(store.getState()).strokes[0].id;
  await act(async () => store.getState().actions.select("c", sid));
  for (const cancel of ["pointercancel", "Escape"]) {
    await pointer(svg, "pointerdown", 80, 80);
    await pointer(stage, "pointermove", 130, 130);
    await pointer(stage, "pointermove", 500, 500, { pointerId: 2 });
    await pointer(stage, "pointerup", 500, 500, { pointerId: 2 });
    assert.deepEqual(store.getState().session.nodeIds, ["a", "single"]);
    assert.ok(box());
    if (cancel === "Escape")
      await act(async () => {
        document.body.dispatchEvent(
          new dom.window.KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
          }),
        );
      });
    else await pointer(stage, cancel, 130, 130);
    assert.deepEqual(store.getState().session.nodeIds, ["c"]);
    assert.equal(store.getState().session.strokeId, sid);
    assert.equal(box(), null);
    assert.equal(stage.hasPointerCapture(1), false);
    await pointer(stage, "pointermove", 500, 500);
    assert.deepEqual(store.getState().session.nodeIds, ["c"]);
  }
});

test("empty clicks clear selection, modifier clicks preserve it, and small pointer jitter does not select", async (t) => {
  const { store, stage, svg, box } = await render(t);
  await act(async () => store.getState().actions.select("c"));
  await pointer(svg, "pointerdown", 80, 80, { shiftKey: true });
  await pointer(stage, "pointerup", 80, 80);
  assert.deepEqual(store.getState().session.nodeIds, ["c"]);
  await pointer(svg, "pointerdown", 80, 80);
  await pointer(stage, "pointermove", 81, 81);
  assert.equal(box(), null);
  await pointer(stage, "pointerup", 81, 81);
  assert.deepEqual(store.getState().session.nodeIds, []);
});

test("blur, tool changes, hidden nodes, preview and glyph changes clear a marquee and stale events", async (t) => {
  const { store, stage, svg, container, box } = await render(t);
  const actions = store.getState().actions;
  for (const finish of [
    () => window.dispatchEvent(new dom.window.Event("blur")),
    () => actions.setTool("hand"),
    () => actions.select("c"),
    () =>
      container
        .querySelector<HTMLButtonElement>('button[title="显示节点"]')!
        .click(),
    () => container.querySelector<HTMLButtonElement>(".view-button")!.click(),
    () => actions.switchGlyph(store.getState().project.glyphs[1].id),
  ]) {
    await pointer(svg, "pointerdown", 80, 80);
    await pointer(stage, "pointermove", 220, 220);
    assert.ok(box());
    await act(async () => {
      finish();
    });
    assert.equal(box(), null);
    assert.equal(stage.hasPointerCapture(1), false);
    const selection = store.getState().session.nodeIds;
    await pointer(stage, "pointermove", 500, 500);
    await pointer(stage, "pointerup", 500, 500);
    assert.equal(store.getState().session.nodeIds, selection);
    await act(async () => actions.setTool("pen"));
    await act(async () => actions.setTool("select"));
  }
});

test("marquee-selected nodes can be dragged together and undone in one step", async (t) => {
  const { store, stage, svg, container } = await render(t);
  await pointer(svg, "pointerdown", 80, 80);
  await pointer(stage, "pointermove", 130, 130);
  await pointer(stage, "pointerup", 130, 130);
  const before = store.getState().project;
  await pointer(
    container.querySelector('[data-node-id="a"]')!,
    "pointerdown",
    100,
    100,
  );
  await pointer(stage, "pointermove", 110, 120);
  await pointer(stage, "pointerup", 110, 120);
  const glyph = activeGlyph(store.getState());
  assert.equal(glyph.nodes.a.x, 110);
  assert.equal(glyph.nodes.single.y, 140);
  assert.equal(glyph.nodes.b.x, 200);
  assert.equal(store.getState().past.length, 1);
  await act(async () => store.getState().actions.undo());
  assert.equal(store.getState().project, before);
});
