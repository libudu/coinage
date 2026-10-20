import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";
import { act, createElement as h, useRef, useState } from "react";
import type { ComponentType } from "react";
import { emptyGlyph, newStroke } from "../src/core/model";
import type { Project } from "../src/core/model";
import { defaultBrush } from "../src/core/brush";
import { activeGlyph } from "../src/features/project/projectStore";
import type { ProjectStore } from "../src/features/project/projectStore";
import { projectStorage } from "../src/features/project/projectStorage";

register("./support/domLoader.mjs", import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
  DOMPoint: class { constructor(public x: number, public y: number) {} matrixTransform() { return this; } },
});
const captures = new WeakMap<Element, number>();
Object.assign(dom.window.Element.prototype, {
  setPointerCapture(id: number) { captures.set(this, id); },
  hasPointerCapture(id: number) { return captures.get(this) === id; },
  releasePointerCapture(id: number) { if (captures.get(this) === id) captures.delete(this); },
});
Object.assign(dom.window.SVGElement.prototype, { getScreenCTM: () => ({ inverse: () => ({}) }) });
const { createRoot } = await import("react-dom/client");
const { ProjectProvider, useProjectApi } = await import("../src/features/project/useProject");
const { useCanvasInteraction } = await import("../src/features/editor/useCanvasInteraction");
const { BrushTuning } = await import("../src/features/editor/BrushTuning");
const { Properties } = await import("../src/features/editor/Properties");
const { GlyphExport } = await import("../src/features/editor/GlyphExport");

function manuscript(): Project {
  const glyph = emptyGlyph("甲");
  glyph.nodes = { a: { id: "a", x: 100, y: 100, width: 30, mode: "corner" },
    b: { id: "b", x: 200, y: 200, width: 30, mode: "corner" } };
  glyph.strokes = [newStroke(["a", "b"], 0)];
  return { version: 1, activeId: glyph.id, glyphs: [glyph, emptyGlyph("乙")],
    brush: { ...defaultBrush, startTip: "horizontal" } };
}
async function render(t: TestContext, Component: ComponentType) {
  t.mock.method(projectStorage, "save", async () => {});
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let store!: ProjectStore;
  function Probe() { store = useProjectApi(); return h(Component); }
  await act(async () => root.render(h(ProjectProvider, { initialProject: manuscript(), children: h(Probe) })));
  t.after(async () => { await act(async () => root.unmount()); container.remove(); });
  return { store, container };
}
function CanvasProbe() {
  const stage = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const interaction = useCanvasInteraction({ toast: () => {}, space: false, preview: false, pan, setPan, stage, svg });
  return h("div", { ref: stage, onPointerMove: interaction.move, onPointerUp: (e) => interaction.end(e),
    onPointerCancel: (e) => interaction.end(e, true), onLostPointerCapture: (e) => interaction.end(e) },
  h("svg", { ref: svg }, h("circle", { "data-node": "a", onPointerDown: (e) => interaction.start(e, "branch", "a") })));
}

test("glyph export owns its menu and dispatches SVG and PNG actions before closing", async (t) => {
  const calls: string[] = [];
  const { container } = await render(t, () => h(GlyphExport, {
    onExportSvg: () => { calls.push("svg"); }, onExportPng: () => { calls.push("png"); },
  }));
  const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="更多导出格式"]')!;
  const click = async (element: HTMLElement) => { await act(async () => element.click()); };
  await click(container.querySelector("button")!);
  assert.deepEqual(calls, ["svg"]);
  await click(toggle);
  const menu = container.querySelector(".export-dropdown")!;
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  // 菜单内部的指针事件不能提前关闭菜单，阻断后续的点击导出。
  await pointer(menu.querySelectorAll("button")[1], "pointerdown", 1);
  assert.ok(container.querySelector(".export-dropdown"));
  await click(menu.querySelectorAll("button")[1]);
  assert.deepEqual(calls, ["svg", "png"]);
  assert.equal(container.querySelector(".export-dropdown"), null);
  await click(toggle);
  await click(container.querySelector(".export-dropdown button")!);
  assert.deepEqual(calls, ["svg", "png", "svg"]);
  for (const close of [
    async () => pointer(document.body, "pointerdown", 1),
    async () => act(async () => { toggle.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }),
    async () => act(async () => { document.body.dispatchEvent(new dom.window.Event("focusin", { bubbles: true })); }),
  ]) {
    await click(toggle);
    await close();
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(container.querySelector(".export-dropdown"), null);
  }
  assert.deepEqual(calls, ["svg", "png", "svg"]);
});
async function pointer(target: Element, type: string, id: number, x = 100, y = 100) {
  const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
  Object.defineProperties(event, { pointerId: { value: id }, isPrimary: { value: id === 1 } });
  await act(async () => { target.dispatchEvent(event); });
}
function range(container: Element, label: string) {
  const element = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  assert.ok(element);
  return element;
}
async function inputValue(input: HTMLInputElement, value: number) {
  await act(async () => {
    // 调用原生属性设置器模拟浏览器输入变化，绕过 React 的值追踪器。
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, String(value));
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

test("an unmoved branch interrupted by window blur creates no history or persisted stroke", async (t) => {
  const { store, container } = await render(t, CanvasProbe);
  const before = store.getState().project;
  await pointer(container.querySelector("circle")!, "pointerdown", 1);
  await act(async () => { window.dispatchEvent(new dom.window.Event("blur")); });
  assert.equal(store.getState().past.length, 0);
  assert.equal(store.getState().committedProject, before);
  assert.equal(activeGlyph(store.getState()).strokes.length, 1);
});

test("a visibility flush before the first branch move does not persist provisional geometry", async (t) => {
  const { store, container } = await render(t, CanvasProbe);
  const before = store.getState().project;
  await pointer(container.querySelector("circle")!, "pointerdown", 1);
  await act(async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new dom.window.Event("visibilitychange"));
    delete (document as unknown as { visibilityState?: string }).visibilityState;
  });
  assert.equal(store.getState().committedProject, before);
  assert.equal(store.getState().past.length, 0);
});

test("Ctrl+S and Command+S commit a focused control and immediately save to the local service", async (t) => {
  const { store, container } = await render(t, () => h("input"));
  const saved: Project[] = [];
  t.mock.method(projectStorage, "save", async (project: Project) => { saved.push(project); });
  const input = container.querySelector("input")!;
  for (const modifier of ["ctrlKey", "metaKey"]) {
    const id = store.getState().actions.beginTransaction();
    store.getState().actions.update((_, p) => { p.glyphs[0].name = modifier; }, id);
    const event = new dom.window.KeyboardEvent("keydown", { key: "s", [modifier]: true,
      bubbles: true, cancelable: true });
    await act(async () => { input.dispatchEvent(event); });
    assert.equal(event.defaultPrevented, true);
    assert.equal(store.getState().transaction, null);
    assert.equal(saved.at(-1)?.glyphs[0].name, modifier);
    assert.equal(store.getState().saved, "saved");
  }
  assert.equal(saved.length, 2);
});

test("a second pointer cannot move or finish the first pointer's branch transaction", async (t) => {
  const { store, container } = await render(t, CanvasProbe);
  const circle = container.querySelector("circle")!, stage = container.firstElementChild!;
  await pointer(circle, "pointerdown", 1);
  const id = store.getState().transaction?.id;
  await pointer(circle, "pointerdown", 2);
  await pointer(stage, "pointermove", 2, 150, 150);
  await pointer(stage, "pointerup", 2, 150, 150);
  assert.equal(store.getState().transaction?.id, id);
  assert.equal(activeGlyph(store.getState()).strokes.length, 1);
  await pointer(stage, "pointermove", 1, 130, 140);
  await pointer(stage, "pointerup", 1, 130, 140);
  assert.equal(store.getState().past.length, 1);
  assert.equal(activeGlyph(store.getState()).strokes.length, 2);
});

test("late brush pointer events after blur cannot become standalone edits", async (t) => {
  const { store, container } = await render(t, BrushTuning);
  const input = range(container, "起笔长度");
  input.getBoundingClientRect = () => ({ left: 0, width: 216 } as DOMRect);
  await pointer(input, "pointerdown", 1, 80);
  await act(async () => { window.dispatchEvent(new dom.window.Event("blur")); });
  const before = store.getState().project, history = store.getState().past.length;
  await pointer(input, "pointermove", 1, 190);
  await pointer(input, "pointerup", 1, 190);
  assert.equal(store.getState().project, before);
  assert.equal(store.getState().past.length, history);
});

test("pointer cancellation from another touch cannot cancel a live brush adjustment", async (t) => {
  const { store, container } = await render(t, BrushTuning);
  const input = range(container, "起笔长度");
  input.getBoundingClientRect = () => ({ left: 0, width: 216 } as DOMRect);
  await pointer(input, "pointerdown", 1, 100);
  const id = store.getState().transaction?.id, preview = store.getState().project;
  await pointer(input, "pointercancel", 2);
  assert.equal(store.getState().transaction?.id, id);
  assert.equal(store.getState().project, preview);
  await pointer(input, "pointerup", 1, 120);
  assert.equal(store.getState().past.length, 1);
});

test("an unrelated keyup cannot split a held width adjustment into multiple history steps", async (t) => {
  const { store, container } = await render(t, () => h(Properties, { onExportSvg: () => {}, onExportPng: () => {} }));
  const input = range(container, "笔画粗细");
  await act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
  const id = store.getState().transaction?.id;
  await act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent("keyup", { key: "Shift", bubbles: true })); });
  assert.equal(store.getState().transaction?.id, id);
  await act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent("keyup", { key: "ArrowRight", bubbles: true })); });
  assert.equal(store.getState().transaction, null);
});

test("returning a branch to its source remains a no-op even when interrupted by blur", async (t) => {
  const { store, container } = await render(t, CanvasProbe);
  const before = store.getState().project, stage = container.firstElementChild!;
  await pointer(container.querySelector("circle")!, "pointerdown", 1);
  await pointer(stage, "pointermove", 1, 140, 130);
  assert.equal(activeGlyph(store.getState()).strokes.length, 2);
  await pointer(stage, "pointermove", 1, 100, 100);
  await act(async () => { window.dispatchEvent(new dom.window.Event("blur")); });
  assert.equal(store.getState().project, before);
  assert.equal(store.getState().past.length, 0);
  assert.equal(store.getState().committedProject, before);
});

test("focused ranges support undo and reject the rest of an interrupted pointer gesture", async (t) => {
  const { store, container } = await render(t, BrushTuning);
  const input = range(container, "起笔长度"), before = store.getState().project;
  input.getBoundingClientRect = () => ({ left: 0, width: 216 } as DOMRect);
  await pointer(input, "pointerdown", 1, 160);
  await act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true })); });
  assert.equal(store.getState().project, before);
  await pointer(input, "pointermove", 1, 190);
  await pointer(input, "pointerup", 1, 190);
  assert.equal(store.getState().project, before);
  assert.equal(store.getState().future.length, 1);
});

test("range Escape cancels the preview and a later lost-capture event cannot commit it", async (t) => {
  const { store, container } = await render(t, BrushTuning);
  const input = range(container, "起笔长度"), before = store.getState().project;
  input.getBoundingClientRect = () => ({ left: 0, width: 216 } as DOMRect);
  await pointer(input, "pointerdown", 1, 150);
  await act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  await pointer(input, "lostpointercapture", 1);
  await pointer(input, "pointerup", 1, 180);
  assert.equal(store.getState().project, before);
  assert.equal(store.getState().past.length, 0);
});

test("native width input stays one transaction and late input after blur is ignored", async (t) => {
  const { store, container } = await render(t, () => h(Properties, { onExportSvg: () => {}, onExportPng: () => {} }));
  const input = range(container, "笔画粗细"), before = store.getState().project;
  await pointer(input, "pointerdown", 1);
  await inputValue(input, 40);
  await inputValue(input, 50);
  assert.equal(activeGlyph(store.getState()).nodes.b.width, 50);
  assert.equal(store.getState().past.length, 0);
  assert.equal(store.getState().committedProject, before);
  await act(async () => { window.dispatchEvent(new dom.window.Event("blur")); });
  const committed = store.getState().project;
  await inputValue(input, 80);
  await pointer(input, "pointerup", 1);
  assert.equal(store.getState().project, committed);
  assert.equal(store.getState().past.length, 1);
  await act(async () => store.getState().actions.undo());
  assert.equal(store.getState().project, before);
});

test("a live width gesture cannot follow a selection change to another node", async (t) => {
  const { store, container } = await render(t, () => h(Properties, { onExportSvg: () => {}, onExportPng: () => {} }));
  const input = range(container, "笔画粗细");
  await pointer(input, "pointerdown", 1);
  await inputValue(input, 40);
  await act(async () => store.getState().actions.select("a"));
  await inputValue(input, 80);
  await pointer(input, "pointercancel", 1);
  assert.equal(activeGlyph(store.getState()).nodes.a.width, 30);
  assert.equal(activeGlyph(store.getState()).nodes.b.width, 40);
  assert.equal(store.getState().past.length, 1);
  assert.deepEqual(store.getState().session.nodeIds, ["a"]);
});

test("reference opacity uses the same commit/cancel transaction rules as width", async (t) => {
  const { store, container } = await render(t, () => h(Properties, { onExportSvg: () => {}, onExportPng: () => {} }));
  await act(async () => store.getState().actions.update((g) => { g.reference = "data:image/png;base64,AA=="; }));
  const input = range(container, "原图不透明度"), before = store.getState().project;
  await pointer(input, "pointerdown", 1);
  await inputValue(input, 40);
  await inputValue(input, 70);
  assert.equal(activeGlyph(store.getState()).referenceOpacity, 70);
  assert.equal(store.getState().committedProject, before);
  await pointer(input, "pointercancel", 1);
  assert.equal(store.getState().project, before);
  assert.equal(store.getState().past.length, 1);
  await pointer(input, "pointerdown", 1);
  await inputValue(input, 60);
  await pointer(input, "pointerup", 1);
  assert.equal(store.getState().past.length, 2);
  assert.equal(store.getState().committedProject, store.getState().project);
});
