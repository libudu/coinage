import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";
import { act, createElement as h, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { emptyGlyph, newStroke } from "../src/core/model";
import type { ProjectStore } from "../src/features/project/projectStore";
import { activeGlyph } from "../src/features/project/projectStore";
import { defaultBrush } from "../src/core/brush";
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
});
const { createRoot } = await import("react-dom/client");
const { Input } = await import("../src/shared/components/Input");
const { NumberInput } = await import("../src/shared/components/NumberInput");
const { NumberField } = await import("../src/shared/components/NumberField");
const { SegmentedControl } =
  await import("../src/shared/components/SegmentedControl");
const { ProjectProvider, useProjectApi } =
  await import("../src/features/project/useProject");
const { Properties } = await import("../src/features/editor/Properties");
const { BrushTuning } = await import("../src/features/editor/BrushTuning");

async function render(t: TestContext, content: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(content));
  t.after(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  return { container, root };
}

async function editor(
  t: TestContext,
  Component: ComponentType = () =>
    h(Properties, { onExportSvg() {}, onExportPng() {} }),
) {
  t.mock.method(projectStorage, "save", async () => {});
  const glyph = emptyGlyph("甲");
  glyph.nodes = {
    a: { id: "a", x: 100, y: 100, width: 30, mode: "corner" },
    b: { id: "b", x: 200, y: 200, width: 30, mode: "corner" },
  };
  glyph.strokes = [newStroke(["a", "b"], 0)];
  let store!: ProjectStore;
  function Probe() {
    store = useProjectApi();
    return h(Component);
  }
  const result = await render(
    t,
    h(ProjectProvider, {
      initialProject: {
        version: 1,
        activeId: glyph.id,
        glyphs: [glyph, emptyGlyph("乙")],
        brush: { ...defaultBrush, startTip: "horizontal" },
      },
      children: h(Probe),
    }),
  );
  return { ...result, store };
}
async function inputValue(input: HTMLInputElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, text);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
async function key(
  element: Element,
  value: string,
  options: KeyboardEventInit = {},
) {
  const event = new dom.window.KeyboardEvent("keydown", {
    key: value,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  await act(async () => {
    element.dispatchEvent(event);
  });
  return event;
}
async function focus(input: HTMLInputElement) {
  await act(async () => input.focus());
}
async function blur(input: HTMLInputElement) {
  await act(async () => input.blur());
}
function field(container: Element, label: string) {
  const input = container.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  );
  assert.ok(input, label);
  return input;
}

test("text input preserves native refs, composition events and form attributes", async (t) => {
  let starts = 0,
    ends = 0;
  function Probe() {
    const ref = useRef<HTMLInputElement>(null);
    return h(Input, {
      ref,
      id: "text",
      name: "name",
      required: true,
      maxLength: 20,
      defaultValue: "初始",
      onCompositionStart: () => {
        assert.equal(ref.current?.name, "name");
        starts++;
      },
      onCompositionEnd: () => ends++,
    });
  }
  const { container } = await render(t, h(Probe));
  const input = container.querySelector("input")!;
  await focus(input);
  await inputValue(input, "中文");
  await act(async () => {
    input.dispatchEvent(
      new dom.window.CompositionEvent("compositionstart", { bubbles: true }),
    );
    input.dispatchEvent(
      new dom.window.CompositionEvent("compositionend", { bubbles: true }),
    );
  });
  assert.equal(input.value, "中文");
  assert.equal(starts, 1);
  assert.equal(ends, 1);
  assert.equal(input.required, true);
  assert.equal(input.maxLength, 20);
});

test("deferred numbers preserve partial typing, commit on Enter, cancel on Escape and reject empty drafts", async (t) => {
  const changes: number[] = [];
  function Probe() {
    const [value, setValue] = useState(100);
    return h(NumberInput, {
      "aria-label": "数值",
      value,
      min: 25,
      max: 250,
      commitOn: "blur",
      onValueChange: (next) => {
        changes.push(next);
        setValue(next);
      },
    });
  }
  const { container } = await render(t, h(Probe));
  const input = field(container, "数值");
  await focus(input);
  for (const text of ["1", "17", "175"]) await inputValue(input, text);
  assert.deepEqual(changes, []);
  assert.equal(input.value, "175");
  await key(input, "Enter");
  assert.deepEqual(changes, [175]);
  await focus(input);
  await inputValue(input, "999");
  await act(async () => {
    input.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    input.blur();
  });
  assert.deepEqual(changes, [175]);
  assert.equal(input.value, "175");
  await focus(input);
  await inputValue(input, "");
  await blur(input);
  assert.equal(input.value, "175");
  await focus(input);
  await inputValue(input, "999");
  await blur(input);
  assert.deepEqual(changes, [175, 250]);
});

test("external numeric changes replace a pending draft and NumberField has no canvas bounds", async (t) => {
  const changes: number[] = [];
  const content = (value: number) =>
    h(NumberInput, {
      value,
      commitOn: "blur",
      "aria-label": "外部数值",
      onValueChange: (next) => changes.push(next),
    });
  const { container, root } = await render(t, content(100));
  const input = field(container, "外部数值");
  await focus(input);
  await inputValue(input, "175");
  await act(async () => root.render(content(200)));
  await blur(input);
  assert.deepEqual(changes, []);
  assert.equal(input.value, "200");
  await act(async () =>
    root.render(
      h(NumberField, {
        label: "数量",
        value: 0,
        onValueChange: (next) => changes.push(next),
      }),
    ),
  );
  const count = field(container, "数量");
  assert.equal(count.getAttribute("max"), null);
  await inputValue(count, "1200");
  assert.deepEqual(changes, [1200]);
  await act(async () =>
    root.render(
      h(NumberField, {
        label: "数量",
        value: 12.34,
        onValueChange: (next) => changes.push(next),
      }),
    ),
  );
  await inputValue(field(container, "数量"), "12.4");
  assert.deepEqual(changes, [1200, 12.4]);
});

test("segmented controls support mixed values, disabled options and arrow navigation without background edits", async (t) => {
  const changes: string[] = [];
  let leaked = 0;
  const handler = () => leaked++;
  window.addEventListener("keydown", handler);
  t.after(() => window.removeEventListener("keydown", handler));
  function Probe() {
    const [value, setValue] = useState<string | null>(null);
    return h(SegmentedControl, {
      label: "选择",
      value,
      options: [
        { value: "a", label: "甲" },
        { value: "b", label: "禁用", disabled: true },
        { value: "c", label: "丙" },
      ],
      onValueChange: (next) => {
        changes.push(next);
        setValue(next);
      },
    });
  }
  const { container } = await render(t, h(Probe));
  const buttons = container.querySelectorAll("button");
  assert.ok(
    [...buttons].every(
      (button) => button.getAttribute("aria-pressed") === "false",
    ),
  );
  await act(async () => buttons[0].focus());
  await key(buttons[0], "ArrowRight");
  assert.ok(document.activeElement === buttons[2]);
  assert.equal(buttons[2].getAttribute("aria-pressed"), "true");
  await key(buttons[2], "Home");
  assert.ok(document.activeElement === buttons[0]);
  assert.deepEqual(changes, ["c", "a"]);
  assert.equal(leaked, 0);
  await act(async () => buttons[1].click());
  assert.deepEqual(changes, ["c", "a"]);
  await key(buttons[0], "s", { ctrlKey: true });
  assert.equal(leaked, 1);
});

test("stroke name editing stays in one transaction with focused undo, redo, save and late-event protection", async (t) => {
  const { store, container } = await editor(t);
  const strokeId = activeGlyph(store.getState()).strokes[0].id;
  await act(async () => store.getState().actions.select(null, strokeId));
  let input = field(container, "笔画名称");
  const original = input.value;
  await focus(input);
  for (const name of ["新", "新笔", "新笔画"]) await inputValue(input, name);
  assert.equal(store.getState().past.length, 0);
  assert.equal(
    activeGlyph({ project: store.getState().committedProject }).strokes[0].name,
    original,
  );
  await blur(input);
  assert.equal(store.getState().past.length, 1);
  await focus(input);
  await key(input, "z", { ctrlKey: true });
  assert.equal(activeGlyph(store.getState()).strokes[0].name, original);
  assert.equal(container.querySelector('input[aria-label="笔画名称"]'), null);
  await act(async () => store.getState().actions.select(null, strokeId));
  input = field(container, "笔画名称");
  await focus(input);
  await key(input, "y", { ctrlKey: true });
  assert.equal(activeGlyph(store.getState()).strokes[0].name, "新笔画");
  await inputValue(input, "迟到输入");
  assert.equal(activeGlyph(store.getState()).strokes[0].name, "新笔画");
  await act(async () => store.getState().actions.select(null, strokeId));
  input = field(container, "笔画名称");
  await focus(input);
  await key(input, "a");
  await inputValue(input, "继续输入");
  await key(input, "s", { ctrlKey: true });
  assert.equal(store.getState().transaction, null);
  assert.equal(store.getState().past.length, 2);
  await key(input, "b");
  await inputValue(input, "取消输入");
  await key(input, "Escape");
  assert.equal(input.value, "继续输入");
  assert.equal(store.getState().past.length, 2);
  await act(async () =>
    input.dispatchEvent(
      new dom.window.CompositionEvent("compositionstart", { bubbles: true }),
    ),
  );
  await inputValue(input, "中文笔画");
  await act(async () =>
    input.dispatchEvent(
      new dom.window.CompositionEvent("compositionend", { bubbles: true }),
    ),
  );
  await blur(input);
  assert.equal(activeGlyph(store.getState()).strokes[0].name, "中文笔画");
  assert.equal(store.getState().past.length, 3);
});

test("coordinate and width inputs group continuous edits, cancel cleanly and cannot follow a selection change", async (t) => {
  const { store, container } = await editor(t);
  await act(async () => store.getState().actions.select("a"));
  const x = field(container, "X");
  await focus(x);
  await inputValue(x, "120");
  await inputValue(x, "150");
  assert.equal(activeGlyph(store.getState()).nodes.a.x, 150);
  assert.equal(store.getState().past.length, 0);
  await key(x, "Escape");
  assert.equal(activeGlyph(store.getState()).nodes.a.x, 100);
  await key(x, "1");
  await inputValue(x, "130");
  await blur(x);
  assert.equal(store.getState().past.length, 1);
  const width = field(container, "宽度");
  await focus(width);
  await inputValue(width, "45");
  await inputValue(width, "55");
  await blur(width);
  assert.equal(store.getState().past.length, 2);
  assert.equal(activeGlyph(store.getState()).nodes.a.width, 55);
  await focus(x);
  await inputValue(x, "140");
  await act(async () => store.getState().actions.select("b"));
  await inputValue(x, "600");
  await blur(x);
  assert.equal(activeGlyph(store.getState()).nodes.a.x, 140);
  assert.equal(activeGlyph(store.getState()).nodes.b.x, 200);
  assert.equal(store.getState().past.length, 3);
});

test("brush numeric drafts preserve blur and Escape behavior without slider history changes", async (t) => {
  const { store, container } = await editor(t, BrushTuning);
  const input = field(container, "起笔长度百分比");
  await focus(input);
  for (const text of ["1", "17", "175"]) await inputValue(input, text);
  assert.equal(store.getState().project.brush!.startBrush.length, 100);
  await key(input, "Enter");
  assert.equal(store.getState().project.brush!.startBrush.length, 175);
  assert.equal(store.getState().past.length, 1);
  await focus(input);
  await inputValue(input, "200");
  await key(input, "Escape");
  await blur(input);
  assert.equal(store.getState().project.brush!.startBrush.length, 175);
  assert.equal(store.getState().past.length, 1);
});
