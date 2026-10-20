import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement as h, useRef, useState } from "react";
import { emptyGlyph, newStroke } from "../src/core/model";
import type { NodeMode, Point, Project } from "../src/core/model";
import { defaultBrush } from "../src/core/brush";
import { glyphPath, strokeControls } from "../src/core/geometry";
import { exportSvg } from "../src/core/svg";
import { isProject } from "../src/core/validation";
import { insertEdgeMidpoint } from "../src/features/editor/strokeEdges";
import { activeGlyph } from "../src/features/project/projectStore";
import type { ProjectStore } from "../src/features/project/projectStore";
import { projectStorage } from "../src/features/project/projectStorage";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://127.0.0.1",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
  DOMPoint: class {
    constructor(
      public x: number,
      public y: number,
    ) {}
    matrixTransform() {
      return this;
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
const { ProjectProvider, useActiveGlyph, useProject, useProjectApi } =
  await import("../src/features/project/useProject");
const { useCanvasInteraction } =
  await import("../src/features/editor/useCanvasInteraction");
const { GlyphArtwork } = await import("../src/features/editor/GlyphArtwork");

function manuscript(mode: NodeMode, sign = 1): Project {
  const glyph = emptyGlyph("甲");
  glyph.nodes = {
    a: { id: "a", x: 100, y: 100, width: 80, mode: "corner" },
    b: { id: "b", x: 300, y: 300, width: 100, mode: "corner" },
  };
  const node = glyph.nodes[sign === -1 ? "b" : "a"];
  node.mode = mode;
  if (mode !== "corner") node.handle = { x: 80, y: 0 };
  if (mode === "smooth") node.handleIn = { x: -80, y: 0 };
  glyph.strokes = [newStroke(["a", "b"], 0)];
  insertEdgeMidpoint(
    glyph,
    { strokeId: glyph.strokes[0].id, index: 0, from: "a", to: "b" },
    "mid",
  );
  return {
    version: 1,
    activeId: glyph.id,
    glyphs: [glyph],
    brush: { ...defaultBrush, startTip: "horizontal", endTip: "vertical" },
  };
}

async function render(t: TestContext, project: Project) {
  t.mock.method(projectStorage, "save", async () => {});
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let store!: ProjectStore;
  function Probe() {
    store = useProjectApi();
    const glyph = useActiveGlyph(),
      session = useProject((s) => s.session),
      brush = useProject((s) => s.project.brush);
    const stage = useRef<HTMLDivElement>(null),
      svg = useRef<SVGSVGElement>(null);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const interaction = useCanvasInteraction({
      toast: () => {},
      space: false,
      preview: false,
      pan,
      setPan,
      stage,
      svg,
    });
    return h(
      "div",
      {
        ref: stage,
        onPointerMove: interaction.move,
        onPointerUp: (e) => interaction.end(e),
        onPointerCancel: (e) => interaction.end(e, true),
        onLostPointerCapture: (e) => interaction.end(e),
      },
      h(
        "svg",
        { ref: svg },
        h(GlyphArtwork, {
          glyph,
          nodeId: session.nodeIds.at(-1) ?? null,
          nodeIds: session.nodeIds,
          strokeId: session.strokeId,
          tool: session.tool,
          showReference: false,
          brush,
          scale: 1,
          grid: false,
          preview: false,
          nodesVisible: true,
          interaction,
        }),
      ),
    );
  }
  await act(async () =>
    root.render(
      h(ProjectProvider, { initialProject: project, children: h(Probe) }),
    ),
  );
  t.after(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  return {
    store,
    container,
    stage: container.firstElementChild!,
    artwork: () =>
      container.querySelector("[data-stroke-id]")!.getAttribute("d")!,
  };
}

async function pointer(target: Element, type: string, point: Point, id = 1) {
  const event = new dom.window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: point.x,
    clientY: point.y,
  });
  Object.defineProperties(event, {
    pointerId: { value: id },
    isPrimary: { value: id === 1 },
  });
  await act(async () => {
    target.dispatchEvent(event);
  });
}
const path = (project: Project) => glyphPath(project.glyphs[0], project.brush);
function handle(container: Element, sign: number) {
  const element = container.querySelectorAll("circle.handle-target")[
    sign === -1 ? 0 : 1
  ];
  assert.ok(element);
  return {
    element,
    point: { x: +element.getAttribute("cx")!, y: +element.getAttribute("cy")! },
  };
}

for (const mode of ["corner", "smooth", "symmetric"] as const) {
  for (const finish of ["pointerup", "blur"] as const) {
    test(`${mode} midpoint pointer roundtrip restores the complete contour and preserves redo on ${finish}`, async (t) => {
      const { store, container, stage, artwork } = await render(
        t,
        manuscript(mode),
      );
      const state = store.getState,
        actions = state().actions;
      await act(async () => {
        actions.update((g) => {
          g.color = "#000000";
        });
        actions.undo();
        actions.select("mid", activeGlyph(state()).strokes[0].id);
      });
      const before = state().project,
        future = state().future,
        origin = activeGlyph(state()).nodes.mid;
      await pointer(
        container.querySelector('[data-node-id="mid"]')!,
        "pointerdown",
        origin,
      );
      await pointer(stage, "pointermove", {
        x: origin.x + 30,
        y: origin.y + 20,
      });
      assert.notEqual(artwork(), path(before));
      assert.equal(state().committedProject, before);
      await pointer(stage, "pointermove", {
        x: origin.x - 20,
        y: origin.y + 10,
      });
      await pointer(stage, "pointermove", origin);
      if (finish === "blur")
        await act(async () => {
          window.dispatchEvent(new dom.window.Event("blur"));
        });
      else await pointer(stage, "pointerup", origin);
      assert.equal(state().project, before);
      assert.equal(state().committedProject, before);
      assert.equal(state().past.length, 0);
      assert.equal(state().future, future);
      assert.equal(artwork(), path(before));
      assert.equal(
        exportSvg(activeGlyph(state()), before.brush),
        exportSvg(before.glyphs[0], before.brush),
      );
      assert.equal(state().transaction, null);
    });
  }
  test(`${mode} midpoint pointer edits commit once, undo/redo completely and cancel safely`, async (t) => {
    const { store, container, stage, artwork } = await render(
      t,
      manuscript(mode),
    );
    const state = store.getState,
      actions = state().actions;
    const before = state().project,
      origin = activeGlyph(state()).nodes.mid;
    await pointer(
      container.querySelector('[data-node-id="mid"]')!,
      "pointerdown",
      origin,
    );
    await pointer(stage, "pointermove", { x: origin.x + 20, y: origin.y + 15 });
    await pointer(stage, "pointermove", { x: origin.x + 30, y: origin.y + 20 });
    assert.equal(state().past.length, 0);
    await pointer(stage, "pointerup", { x: origin.x + 30, y: origin.y + 20 });
    const edited = state().project;
    assert.equal(state().past.length, 1);
    assert.ok(isProject(edited));
    assert.equal(artwork(), path(edited));
    assert.notEqual(artwork(), path(before));
    await act(async () => {
      actions.undo();
    });
    assert.equal(state().project, before);
    assert.equal(artwork(), path(before));
    await act(async () => {
      actions.redo();
    });
    assert.equal(state().project, edited);
    assert.equal(artwork(), path(edited));
    await act(async () => {
      actions.select("mid", activeGlyph(state()).strokes[0].id);
    });
    const at = activeGlyph(state()).nodes.mid;
    await pointer(
      container.querySelector('[data-node-id="mid"]')!,
      "pointerdown",
      at,
    );
    await pointer(stage, "pointermove", { x: at.x - 35, y: at.y + 20 });
    await pointer(stage, "pointercancel", at);
    await pointer(stage, "pointerup", { x: at.x - 35, y: at.y + 20 });
    assert.equal(state().project, edited);
    assert.equal(state().past.length, 1);
    assert.equal(artwork(), path(edited));
  });
}

for (const mode of ["smooth", "symmetric"] as const) {
  for (const sign of [-1, 1]) {
    test(`${mode} handle ${sign} follows a pointer to the original knot value and returns without changes`, async (t) => {
      const { store, container, stage, artwork } = await render(
        t,
        manuscript(mode, sign),
      );
      const state = store.getState,
        actions = state().actions,
        id = sign === -1 ? "b" : "a";
      await act(async () => {
        actions.select(id, activeGlyph(state()).strokes[0].id);
      });
      const before = state().project,
        node = activeGlyph(state()).nodes[id];
      const start = handle(container, sign),
        target = { x: node.x + sign * 80, y: node.y };
      assert.notDeepEqual(start.point, target);
      await pointer(start.element, "pointerdown", start.point);
      await pointer(stage, "pointermove", target);
      assert.deepEqual(handle(container, sign).point, target);
      const g = activeGlyph(state()),
        s = g.strokes[0];
      assert.deepEqual(
        strokeControls(
          s.nodes.map((nodeId) => g.nodes[nodeId]),
          s,
          sign === -1 ? 1 : 0,
        )[sign === -1 ? 1 : 0],
        target,
      );
      assert.notEqual(artwork(), path(before));
      await pointer(stage, "pointerup", target);
      const edited = state().project;
      assert.equal(state().past.length, 1);
      assert.ok(isProject(edited));
      await act(async () => {
        actions.undo();
      });
      assert.equal(state().project, before);
      assert.equal(artwork(), path(before));
      await act(async () => {
        actions.redo();
      });
      assert.equal(state().project, edited);
      assert.equal(artwork(), path(edited));
      await act(async () => {
        actions.undo();
        actions.select(id, activeGlyph(state()).strokes[0].id);
      });
      const future = state().future,
        again = handle(container, sign);
      await pointer(again.element, "pointerdown", again.point);
      await pointer(stage, "pointermove", { x: target.x, y: target.y + 20 });
      await pointer(stage, "pointermove", again.point);
      await pointer(stage, "pointerup", again.point);
      assert.equal(state().project, before);
      assert.equal(state().past.length, 0);
      assert.equal(state().future, future);
      assert.equal(artwork(), path(before));
    });
  }
}
