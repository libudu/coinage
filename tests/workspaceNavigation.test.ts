import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";
import { act, createElement as h } from "react";
import { emptyGlyph, newStroke } from "../src/core/model";
import type { Project } from "../src/core/model";
import { glyphPath, outlinePath } from "../src/core/geometry";
import { isProject } from "../src/core/validation";
import { defaultBrush } from "../src/core/brush";
import { defaultGlyphEffects } from "../src/core/glyphEffects";
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
    matrixTransform(m: { a: number; d: number; e: number; f: number }) {
      return { x: this.x * m.a + m.e, y: this.y * m.d + m.f };
    }
  },
});
Object.assign(dom.window.SVGElement.prototype, {
  getScreenCTM: () => ({ inverse: () => ({ a: 1, d: 1, e: 0, f: 0 }) }),
});
Object.assign(dom.window.HTMLDialogElement.prototype, {
  showModal() {
    this.setAttribute("open", "");
  },
  close() {
    this.removeAttribute("open");
  },
});
const { createRoot } = await import("react-dom/client");
const { default: App } = await import("../src/app/App");

function manuscript(): Project {
  const glyphs = ["甲", "乙", "𠮷", "字形 04", "甲"].map((name, index) => {
    const glyph = emptyGlyph(name);
    glyph.nodes = {
      a: { id: "a", x: 100, y: 100, width: 30 + index * 10, mode: "corner" },
      b: { id: "b", x: 200, y: 200, width: 30, mode: "corner" },
    };
    glyph.strokes = [newStroke(["a", "b"], 0)];
    return glyph;
  });
  return {
    version: 1,
    activeId: glyphs[0].id,
    glyphs,
    brush: { ...defaultBrush, startTip: "horizontal" },
  };
}

async function render(t: TestContext, project = manuscript()) {
  const saved: Project[] = [];
  t.mock.method(projectStorage, "save", async (project: Project) => {
    saved.push(project);
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(h(App, { initialProject: project })));
  t.after(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  return { container, project, saved };
}

function button(container: Element, label: string) {
  const element = Array.from(container.querySelectorAll("button")).find(
    (item) =>
      item.getAttribute("aria-label") === label ||
      item.textContent?.trim() === label,
  );
  assert.ok(element, label);
  return element;
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
}
async function inputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
function library(container: Element) {
  return container.querySelector<HTMLElement>('main[aria-label="字库"]')!;
}
function editor(container: Element) {
  return container.querySelector<HTMLElement>(".workspace")!;
}
async function contextMenu(target: Element, x = 120, y = 120) {
  const event = new dom.window.MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  await act(async () => {
    target.dispatchEvent(event);
  });
  assert.equal(event.defaultPrevented, true);
}
async function editInfo(container: Element) {
  await contextMenu(editor(container).querySelector(".glyph-card.selected")!);
  await click(button(container, "编辑基本信息"));
  const dialog = container.querySelector("dialog")!;
  const inputs = dialog.querySelectorAll("input");
  return { dialog, name: inputs[0], description: inputs[1] };
}
async function confirm(dialog: HTMLDialogElement) {
  await act(async () => {
    dialog
      .querySelector("form")!
      .dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
  });
}
async function key(key: string, ctrlKey = false) {
  await act(async () => {
    document.body.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key,
        ctrlKey,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

test("new blank glyphs, character switches and entering the editor focus the canvas for shortcuts", async (t) => {
  const { container } = await render(t);
  const stage = container.querySelector<HTMLElement>(".canvas-stage")!;
  const focusedKey = async (key: string, ctrlKey = false) => {
    const event = new dom.window.KeyboardEvent("keydown", {
      key,
      ctrlKey,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      document.activeElement!.dispatchEvent(event);
    });
    return event;
  };
  const entry = button(container, "编辑 乙");
  entry.focus();
  await click(entry);
  assert.equal(document.activeElement, stage);
  assert.equal((await focusedKey("a", true)).defaultPrevented, true);
  assert.equal(stage.querySelectorAll('[data-selected="true"]').length, 2);
  const trigger = button(container, "新建字符");
  trigger.focus();
  await click(trigger);
  await click(button(container, "新建空白字符"));
  assert.equal(container.querySelector('[role="menu"]'), null);
  assert.equal(document.activeElement, stage);
  assert.equal(stage.querySelectorAll("[data-node-id]").length, 0);
  await focusedKey("p");
  assert.equal(stage.classList.contains("tool-pen"), true);
  await focusedKey("v");
  for (const name of ["𠮷", "乙"]) {
    const card = editor(container).querySelector<HTMLButtonElement>(
      `.glyph-card[aria-label="${name}"]`,
    )!;
    card.focus();
    await click(card);
    assert.equal(document.activeElement, stage);
    assert.equal(stage.querySelectorAll('[data-selected="true"]').length, 0);
    assert.equal((await focusedKey("a", true)).defaultPrevented, true);
    assert.equal(stage.querySelectorAll('[data-selected="true"]').length, 2);
  }
  await click(button(container, "字库"));
  const sameGlyph = button(container, "编辑 乙");
  sameGlyph.focus();
  await click(sameGlyph);
  assert.equal(document.activeElement, stage);
});

test("library character changes and editor character menus preserve menu and form focus", async (t) => {
  const { container } = await render(t);
  const phrase = library(container).querySelector<HTMLInputElement>("input")!;
  phrase.focus();
  await contextMenu(button(container, "编辑 乙"));
  const menu = container.querySelector('[role="menu"]')!;
  assert.ok(menu.contains(document.activeElement));
  await click(button(container, "编辑基本信息"));
  const name = container.querySelector<HTMLInputElement>("dialog input")!;
  assert.equal(document.activeElement, name);
  await inputValue(name, "测试");
  assert.equal(document.activeElement, name);
  await click(button(container, "取消"));
  assert.equal(editor(container).hidden, true);
  await click(button(container, "造字"));
  const card = editor(container).querySelector<HTMLElement>(
    '.glyph-card[aria-label="𠮷"]',
  )!;
  card.focus();
  await contextMenu(card);
  assert.ok(
    container.querySelector('[role="menu"]')!.contains(document.activeElement),
  );
  await click(button(container, "编辑基本信息"));
  const dialog = container.querySelector("dialog")!;
  assert.ok(dialog.contains(document.activeElement));
  await click(button(container, "取消"));
  assert.equal(
    document.activeElement,
    container.querySelector(".canvas-stage"),
  );
});

test("the canvas edge menu inserts at the edge midpoint after coordinate transforms, saves and supports undo/redo", async (t) => {
  const initial = manuscript();
  const glyph = initial.glyphs[0];
  glyph.nodes.b = { id: "b", x: 300, y: 100, width: 40, mode: "corner" };
  glyph.nodes.c = { id: "c", x: 300, y: 500, width: 60, mode: "corner" };
  glyph.strokes[0].nodes.push("c");
  const { container, saved } = await render(t, initial);
  await click(button(container, "编辑 甲"));
  const canvas = editor(container).querySelector<SVGSVGElement>(
    'svg[aria-label="字形编辑画布"]',
  )!;
  canvas.getScreenCTM = () =>
    ({ inverse: () => ({ a: 2, d: 2, e: 60, f: -60 }) }) as DOMMatrix;
  const stroke = canvas.querySelector("[data-stroke-id]")!;
  await contextMenu(stroke);
  assert.equal(button(container, "插入中点").disabled, false);
  await click(button(container, "插入中点"));
  assert.equal(container.querySelector(".editor-context-menu"), null);
  assert.equal(canvas.querySelectorAll("g.node-target").length, 4);
  const selected = canvas.querySelector('[data-selected="true"]')!;
  const id = selected.getAttribute("data-node-id")!;
  assert.equal(selected.querySelector("circle")!.getAttribute("cx"), "300");
  assert.equal(selected.querySelector("circle")!.getAttribute("cy"), "300");
  assert.equal(button(container, "撤销 Ctrl+Z").disabled, false);
  await key("s", true);
  const updated = saved.at(-1)!.glyphs[0];
  assert.deepEqual(updated.strokes[0].nodes, ["a", "b", id, "c"]);
  assert.equal(updated.nodes[id].width, 50);
  await click(button(container, "撤销 Ctrl+Z"));
  assert.equal(canvas.querySelectorAll("g.node-target").length, 3);
  assert.equal(button(container, "撤销 Ctrl+Z").disabled, true);
  await click(button(container, "重做 Ctrl+Shift+Z"));
  assert.equal(canvas.querySelectorAll("g.node-target").length, 4);
  await contextMenu(canvas.querySelector('[data-node-id="a"]')!);
  assert.equal(
    Array.from(container.querySelectorAll('[role="menuitem"]')).some(
      (item) => item.textContent === "插入中点",
    ),
    false,
  );
});

test("the edge menu respects locked strokes and is absent from glyph menus and pen mode", async (t) => {
  const initial = manuscript();
  initial.glyphs[0].strokes[0].locked = true;
  const { container } = await render(t, initial);
  await click(button(container, "编辑 甲"));
  await contextMenu(editor(container).querySelector("[data-stroke-id]")!);
  assert.equal(button(container, "插入中点").disabled, true);
  await click(button(container, "插入中点"));
  assert.equal(button(container, "撤销 Ctrl+Z").disabled, true);
  assert.equal(editor(container).querySelectorAll("g.node-target").length, 2);
  await key("Escape");
  await contextMenu(editor(container).querySelector(".glyph-card.selected")!);
  const hasInsert = () =>
    Array.from(container.querySelectorAll('[role="menuitem"]')).some(
      (item) => item.textContent === "插入中点",
    );
  assert.equal(hasInsert(), false);
  await key("Escape");
  await click(button(container, "钢笔 P"));
  await contextMenu(editor(container).querySelector("[data-stroke-id]")!);
  assert.equal(hasInsert(), false);
});

test("the midpoint menu preserves shared curve artwork and brush contours through saving and undo/redo", async (t) => {
  const initial = manuscript(),
    glyph = initial.glyphs[0];
  glyph.nodes.b = {
    id: "b",
    x: 300,
    y: 100,
    width: 80,
    mode: "smooth",
    handle: { x: 80, y: 30 },
    handleIn: { x: -40, y: -20 },
  };
  glyph.nodes.c = {
    id: "c",
    x: 300,
    y: 500,
    width: 120,
    mode: "smooth",
    handle: { x: 80, y: 20 },
  };
  glyph.nodes.d = { id: "d", x: 500, y: 300, width: 80, mode: "corner" };
  glyph.strokes[0].nodes = ["b", "c"];
  glyph.strokes.push(newStroke(["b", "d"], 1));
  initial.brush = {
    ...defaultBrush,
    startTip: "horizontal",
    endTip: "vertical",
  };
  const originalNodes = structuredClone(glyph.nodes);
  const originalPaths = glyph.strokes.map((s) =>
    outlinePath(glyph, s, initial.brush),
  );
  const { container, saved } = await render(t, initial);
  await click(button(container, "编辑 甲"));
  const canvas = editor(container).querySelector<SVGSVGElement>(
    'svg[aria-label="字形编辑画布"]',
  )!;
  const paths = () =>
    [...canvas.querySelectorAll("[data-stroke-id]")].map((p) =>
      p.getAttribute("d"),
    );
  assert.deepEqual(paths(), originalPaths);
  await contextMenu(canvas.querySelector("[data-stroke-id]")!);
  await click(button(container, "插入中点"));
  assert.deepEqual(paths(), originalPaths);
  const mid = canvas
    .querySelector('[data-selected="true"]')!
    .getAttribute("data-node-id")!;
  await key("s", true);
  const inserted = saved.at(-1)!;
  assert.ok(isProject(inserted));
  assert.deepEqual(inserted.glyphs[0].strokes[0].nodes, ["b", mid, "c"]);
  assert.deepEqual(inserted.glyphs[0].strokes[1].nodes, ["b", "d"]);
  for (const [id, node] of Object.entries(originalNodes))
    assert.deepEqual(inserted.glyphs[0].nodes[id], node);
  await click(button(container, "撤销 Ctrl+Z"));
  assert.equal(button(container, "撤销 Ctrl+Z").disabled, true);
  assert.equal(canvas.querySelector(`[data-node-id="${mid}"]`), null);
  assert.deepEqual(paths(), originalPaths);
  await key("s", true);
  assert.deepEqual(saved.at(-1), initial);
  await click(button(container, "重做 Ctrl+Shift+Z"));
  assert.deepEqual(paths(), originalPaths);
  await key("s", true);
  assert.deepEqual(saved.at(-1), inserted);
});

test("transforms and disconnecting shared nodes keep segment geometry valid and undoable", async (t) => {
  const initial = manuscript(),
    glyph = initial.glyphs[0];
  glyph.nodes.a.mode = "smooth";
  glyph.nodes.a.handle = { x: 60, y: 10 };
  glyph.nodes.c = { id: "c", x: 300, y: 150, width: 50, mode: "corner" };
  glyph.strokes.push(newStroke(["a", "c"], 1));
  const { container, saved } = await render(t, initial);
  await click(button(container, "编辑 甲"));
  const canvas = editor(container).querySelector<SVGSVGElement>(
    'svg[aria-label="字形编辑画布"]',
  )!;
  const target = () => canvas.querySelector("[data-stroke-id]")!;
  await contextMenu(target());
  await click(button(container, "插入中点"));
  await key("s", true);
  const inserted = saved.at(-1)!;
  await contextMenu(target());
  await click(button(container, "旋转 90°"));
  await key("s", true);
  const rotated = saved.at(-1)!;
  assert.ok(isProject(rotated));
  const originalSegment = inserted.glyphs[0].strokes[0].segments![0];
  assert.deepEqual(rotated.glyphs[0].strokes[0].segments![0].handleOut, {
    x: -originalSegment.handleOut.y,
    y: originalSegment.handleOut.x,
  });
  await click(button(container, "撤销 Ctrl+Z"));
  await key("s", true);
  assert.deepEqual(saved.at(-1), inserted);
  await contextMenu(canvas.querySelector('[data-node-id="a"]')!);
  await click(button(container, "拆开连接"));
  await key("s", true);
  const disconnected = saved.at(-1)!.glyphs[0];
  assert.ok(isProject(saved.at(-1)));
  assert.notEqual(disconnected.strokes[0].nodes[0], "a");
  assert.equal(disconnected.strokes[1].nodes[0], "a");
  assert.equal(
    disconnected.strokes[0].segments![0].from,
    disconnected.strokes[0].nodes[0],
  );
  await click(button(container, "撤销 Ctrl+Z"));
  await key("s", true);
  assert.deepEqual(saved.at(-1), inserted);
});

test("the library composes glyph artwork by character name and reserves one cell per missing Unicode character", async (t) => {
  const { container, project } = await render(t);
  assert.equal(button(container, "字库").getAttribute("aria-current"), "page");
  assert.equal(editor(container).hidden, true);
  assert.equal(
    library(container).querySelectorAll('section[aria-label="全部字符"] button')
      .length,
    5,
  );
  assert.equal(
    library(container).querySelector('[aria-label="句子预览"]'),
    null,
  );
  const input = library(container).querySelector("input")!;
  await inputValue(input, "甲丙𠮷 字形");
  const cells = library(container).querySelectorAll('[role="img"]');
  assert.equal(cells.length, 6);
  assert.equal(
    cells[0].querySelector("path")?.getAttribute("d"),
    glyphPath(project.glyphs[0], project.brush),
  );
  assert.equal(cells[1].querySelector("svg"), null);
  assert.equal(cells[1].getAttribute("aria-label"), "丙（缺字）");
  assert.equal(
    cells[2].querySelector("path")?.getAttribute("d"),
    glyphPath(project.glyphs[2], project.brush),
  );
  for (const cell of Array.from(cells).slice(3))
    assert.equal(cell.childElementCount, 0);
  await inputValue(input, "");
  assert.equal(library(container).querySelectorAll('[role="img"]').length, 0);
  assert.equal(
    library(container).querySelector('[aria-label="句子预览"]'),
    null,
  );
});

test("sentence grids default on, hide only matched cells and remember the preference on remount", async (t) => {
  dom.window.localStorage.removeItem("coinage.settings");
  t.after(() => dom.window.localStorage.removeItem("coinage.settings"));
  const { container, project, saved } = await render(t);
  const toggle = button(library(container), "显示字格");
  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  await inputValue(library(container).querySelector("input")!, "甲丙𠮷 ");
  const cells = Array.from(library(container).querySelectorAll('[role="img"]'));
  const originalPaths = cells.map((cell) =>
    cell.querySelector("path")?.getAttribute("d"),
  );
  const missingClasses = [cells[1].className, cells[3].className];
  await click(toggle);
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  assert.equal(toggle.title, "显示字格");
  for (const cell of [cells[0], cells[2]]) {
    assert.ok(cell.classList.contains("border-transparent"));
    assert.ok(cell.classList.contains("bg-transparent"));
  }
  assert.deepEqual([cells[1].className, cells[3].className], missingClasses);
  assert.deepEqual(
    cells.map((cell) => cell.querySelector("path")?.getAttribute("d")),
    originalPaths,
  );
  assert.equal(button(container, "撤销 Ctrl+Z").disabled, true);
  await key("s", true);
  assert.deepEqual(saved.at(-1), project);

  const reopened = await render(t);
  const reopenedToggle = button(library(reopened.container), "显示字格");
  assert.equal(reopenedToggle.getAttribute("aria-pressed"), "false");
  await inputValue(library(reopened.container).querySelector("input")!, "甲丙");
  const reopenedCells = library(reopened.container).querySelectorAll(
    '[role="img"]',
  );
  assert.ok(reopenedCells[0].classList.contains("border-transparent"));
  assert.equal(reopenedCells[1].className, missingClasses[0]);
  await click(reopenedToggle);
  assert.equal(reopenedToggle.getAttribute("aria-pressed"), "true");
  assert.equal(reopenedToggle.title, "隐藏字格");
  assert.equal(
    reopenedCells[0].classList.contains("border-transparent"),
    false,
  );
  assert.ok(reopenedCells[0].classList.contains("bg-transparent"));
  assert.equal(
    JSON.parse(dom.window.localStorage.getItem("coinage.settings")!)
      .showSentenceGrid,
    true,
  );
});

test("the sentence grid toggle still works when local settings cannot be saved", async (t) => {
  t.mock.method(dom.window.Storage.prototype, "setItem", () => {
    throw new Error("blocked");
  });
  const { container } = await render(t);
  await inputValue(library(container).querySelector("input")!, "甲");
  const toggle = button(library(container), "显示字格");
  await click(toggle);
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  assert.ok(
    library(container)
      .querySelector('[role="img"]')!
      .classList.contains("border-transparent"),
  );
});

test("library cards open the selected glyph and navigation preserves the editor view and preview text", async (t) => {
  const { container } = await render(t);
  await inputValue(library(container).querySelector("input")!, "甲乙");
  await click(button(container, "编辑 乙"));
  assert.equal(editor(container).hidden, false);
  assert.equal(library(container).parentElement!.hidden, true);
  assert.equal(button(container, "造字").getAttribute("aria-current"), "page");
  assert.equal(
    editor(container).querySelector(".glyph-card.selected strong")?.textContent,
    "乙",
  );
  assert.ok(editor(container).querySelector(".layers-section"));
  const canvas = editor(container).querySelector("svg");
  const styles = button(container, "样式");
  assert.equal(styles.disabled, false);
  await click(styles);
  assert.equal(styles.getAttribute("aria-current"), "page");
  assert.equal(editor(container).hidden, true);
  assert.equal(library(container).parentElement!.hidden, true);
  const stylePage = container.querySelector<HTMLElement>(
    'main[aria-label="样式"]',
  )!;
  assert.equal(stylePage.parentElement!.hidden, false);
  assert.ok(stylePage.querySelector('[aria-label="乙预览"] path'));
  await click(button(container, "字库"));
  assert.equal(library(container).querySelector("input")!.value, "甲乙");
  await click(button(container, "造字"));
  assert.equal(editor(container).querySelector("svg"), canvas);
  assert.equal(
    editor(container).querySelector(".glyph-card.selected strong")?.textContent,
    "乙",
  );
});

test("appearance controls update global color and save while editor shortcuts stay isolated", async (t) => {
  const { container, project, saved } = await render(t);
  await click(button(container, "编辑 乙"));
  await key("a", true);
  const before = editor(container)
    .querySelector(".glyph-card.selected path")!
    .getAttribute("d");
  assert.equal(
    editor(container).querySelector('input[aria-label="笔画颜色"]'),
    null,
  );
  assert.equal(editor(container).textContent?.includes("外观"), false);
  await click(button(container, "样式"));
  const stylePage = container.querySelector<HTMLElement>(
    'main[aria-label="样式"]',
  )!;
  const preview = stylePage.querySelector("path")!;
  assert.equal(
    preview.getAttribute("d"),
    glyphPath(project.glyphs[1], project.brush),
  );
  await click(button(stylePage, "使用颜色 #4562a6"));
  assert.equal(preview.getAttribute("fill"), "#4562a6");
  await inputValue(
    stylePage.querySelector('input[aria-label="笔画颜色"]')!,
    "#123456",
  );
  assert.equal(preview.getAttribute("fill"), "#123456");
  assert.ok(stylePage.textContent?.includes("#123456"));
  for (const [value, ctrl] of [
    ["Delete", false],
    ["ArrowRight", false],
    ["z", true],
    ["p", false],
  ] as const)
    await key(value, ctrl);
  assert.equal(preview.getAttribute("fill"), "#123456");
  assert.equal(
    editor(container)
      .querySelector(".glyph-card.selected path")!
      .getAttribute("d"),
    before,
  );
  await key("s", true);
  assert.equal(saved.at(-1)?.style?.color, "#123456");
  assert.deepEqual(saved.at(-1)?.glyphs, project.glyphs);
  assert.deepEqual(saved.at(-1)?.glyphs[0], project.glyphs[0]);
  await click(button(container, "造字"));
  assert.equal(
    editor(container)
      .querySelector(".glyph-card.selected path")!
      .getAttribute("fill"),
    "#123456",
  );
  await click(button(editor(container), "甲"));
  await click(button(container, "样式"));
  assert.ok(stylePage.querySelector('[aria-label="甲预览"]'));
  assert.equal(preview.getAttribute("fill"), "#123456");
  assert.equal(
    stylePage.querySelector<HTMLInputElement>('input[aria-label="笔画颜色"]')!
      .value,
    "#123456",
  );
});

test("effects preserve separate parameters, save slider transactions and appear only in style and sentence previews", async (t) => {
  const { container, project, saved } = await render(t);
  await click(button(container, "编辑 乙"));
  await click(button(container, "样式"));
  const stylePage = container.querySelector<HTMLElement>(
    'main[aria-label="样式"]',
  )!;
  await click(button(stylePage, "燃烧"));
  await click(button(stylePage, "幽蓝"));
  const slider = stylePage.querySelector<HTMLInputElement>(
    'input[aria-label="火势"]',
  )!;
  await act(async () => slider.focus());
  await inputValue(slider, "95");
  await act(async () => slider.blur());
  await click(button(stylePage, "符文"));
  await click(button(stylePage, "紫晶奥术"));
  for (const [label, value] of [["流光方向", "270"]] as const) {
    const range = stylePage.querySelector<HTMLInputElement>(
      `input[type="range"][aria-label="${label}"]`,
    )!;
    await act(async () => range.focus());
    await inputValue(range, value);
    await act(async () => range.blur());
  }
  await click(button(stylePage, "燃烧"));
  assert.equal(
    stylePage.querySelector<HTMLInputElement>('input[aria-label="火势"]')!
      .value,
    "95",
  );
  assert.equal(button(stylePage, "幽蓝").getAttribute("aria-pressed"), "true");
  const direction = stylePage.querySelector<HTMLInputElement>(
    'input[type="range"][aria-label="火焰方向"]',
  )!;
  await act(async () => direction.focus());
  await inputValue(direction, "90");
  await act(async () => direction.blur());
  await click(button(stylePage, "符文"));
  assert.equal(
    stylePage.querySelector<HTMLInputElement>('input[aria-label="符文光色"]')!
      .value,
    "#bd87ff",
  );
  await key("s", true);
  const effect = saved.at(-1)!.style!.effects;
  assert.equal(effect.type, "rune");
  assert.deepEqual(effect.fire, {
    ...defaultGlyphEffects.fire,
    palette: "azure",
    intensity: 95,
    direction: 90,
  });
  assert.equal(effect.rune.color, "#bd87ff");
  assert.equal(effect.rune.direction, 270);
  assert.deepEqual(saved.at(-1)!.glyphs[1].nodes, project.glyphs[1].nodes);
  assert.deepEqual(saved.at(-1)!.glyphs, project.glyphs);
  await click(button(container, "字库"));
  await inputValue(library(container).querySelector("input")!, "乙甲乙");
  const sentence = library(container).querySelector('[aria-label="句子预览"]')!;
  assert.equal(
    sentence.querySelectorAll(`[data-effect-glyph="${project.glyphs[1].id}"]`)
      .length,
    2,
  );
  assert.ok(sentence.closest(".glyph-effects-preview"));
  assert.equal(sentence.classList.contains("bg-[#101722]"), false);
  assert.equal(sentence.querySelectorAll("[data-effect-glyph]").length, 3);
  assert.equal(
    library(container)
      .querySelector('[aria-label="全部字符"]')!
      .querySelector("[data-effect-glyph]"),
    null,
  );
  assert.equal(editor(container).querySelector(".glyph-effects-preview"), null);
  await click(button(container, "样式"));
  await click(button(container, "造字"));
  await click(button(editor(container), "甲"));
  await click(button(container, "样式"));
  assert.equal(
    stylePage.querySelector<HTMLInputElement>(
      'input[type="range"][aria-label="流光方向"]',
    )!.value,
    "270",
  );
  await click(button(stylePage, "无"));
  assert.equal(stylePage.querySelector('input[aria-label="辉光强度"]'), null);
  await key("s", true);
  assert.equal(saved.at(-1)!.style!.effects.type, "none");
});

test("library keyboard events cannot undo or delete editor content, and edits refresh the sentence preview", async (t) => {
  const { container } = await render(t);
  await inputValue(library(container).querySelector("input")!, "甲");
  const preview = () =>
    library(container).querySelector('[role="img"] path')!.getAttribute("d");
  const before = preview();
  await click(button(container, "编辑 甲"));
  await act(async () => {
    document.body.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "a",
        ctrlKey: true,
        bubbles: true,
      }),
    );
  });
  assert.ok(editor(container).querySelector('input[aria-label="笔画粗细"]'));
  await act(async () => {
    document.body.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
      }),
    );
  });
  await click(button(container, "字库"));
  const after = preview();
  assert.notEqual(after, before);
  for (const event of [
    new dom.window.KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
    new dom.window.KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
    }),
    new dom.window.KeyboardEvent("keydown", { key: "p", bubbles: true }),
  ])
    await act(async () => {
      document.body.dispatchEvent(event);
    });
  assert.equal(preview(), after);
  await click(button(container, "造字"));
  await act(async () => {
    document.body.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "z",
        ctrlKey: true,
        bubbles: true,
      }),
    );
  });
  assert.equal(preview(), before);
});

test("basic information updates titles, subtitles, phrase matching and persistence without undo history", async (t) => {
  const { container, saved } = await render(t);
  await click(button(container, "编辑 甲"));
  const info = await editInfo(container);
  assert.equal(info.dialog.querySelector("h2")!.textContent, "编辑基本信息");
  assert.deepEqual(
    Array.from(
      info.dialog.querySelectorAll("label"),
      (label) => label.textContent,
    ),
    ["对应汉语", "描述"],
  );
  await inputValue(info.name, "  甲乙  ");
  await inputValue(info.description, "  测试描述  ");
  await confirm(info.dialog);
  assert.equal(container.querySelector("dialog"), null);
  assert.equal(
    editor(container).querySelector(".glyph-card.selected strong")?.textContent,
    "甲乙",
  );
  assert.equal(
    editor(container).querySelector(".glyph-card.selected small")?.textContent,
    "测试描述",
  );
  assert.ok(
    editor(container)
      .querySelector(".artboard-label")
      ?.textContent?.includes("测试描述"),
  );
  await key("s", true);
  assert.equal(saved.at(-1)?.glyphs[0].name, "甲乙");
  assert.equal(saved.at(-1)?.glyphs[0].description, "测试描述");
  await click(button(container, "字库"));
  assert.ok(button(container, "编辑 甲乙").textContent?.includes("测试描述"));
  await inputValue(library(container).querySelector("input")!, "甲乙丙乙");
  const cells = library(container).querySelectorAll('[role="img"]');
  assert.equal(cells.length, 3);
  assert.equal(cells[0].getAttribute("aria-label"), "甲乙");
  assert.ok(cells[0].querySelector("path"));
  assert.equal(cells[1].getAttribute("aria-label"), "丙（缺字）");
  await click(button(container, "造字"));
  await key("z", true);
  assert.equal(
    editor(container).querySelector(".glyph-card.selected strong")?.textContent,
    "甲乙",
  );
  assert.equal(
    editor(container).querySelector(".glyph-card.selected small")?.textContent,
    "测试描述",
  );
  assert.equal(button(container, "撤销 Ctrl+Z").disabled, true);
  await key("z", true);
  assert.equal(
    editor(container).querySelector(".glyph-card.selected strong")?.textContent,
    "甲乙",
  );
  await key("y", true);
  assert.equal(
    editor(container).querySelector(".glyph-card.selected small")?.textContent,
    "测试描述",
  );
});

test("both basic information fields can be empty, with no history for cancellation or an unchanged confirmation", async (t) => {
  const { container, saved } = await render(t);
  await click(button(container, "编辑 乙"));
  let info = await editInfo(container);
  await confirm(info.dialog);
  assert.equal(button(container, "撤销 Ctrl+Z").disabled, true);
  info = await editInfo(container);
  await inputValue(info.name, "取消的汉语");
  await inputValue(info.description, "取消的描述");
  await click(button(info.dialog, "取消"));
  assert.equal(
    editor(container).querySelector(".glyph-card.selected strong")?.textContent,
    "乙",
  );
  assert.equal(button(container, "撤销 Ctrl+Z").disabled, true);
  info = await editInfo(container);
  await inputValue(info.name, "");
  await inputValue(info.description, "仅描述");
  await confirm(info.dialog);
  assert.equal(
    editor(container).querySelector(".glyph-card.selected strong"),
    null,
  );
  assert.equal(
    editor(container).querySelector(".glyph-card.selected small")?.textContent,
    "仅描述",
  );
  await click(button(container, "字库"));
  await inputValue(library(container).querySelector("input")!, "乙");
  assert.equal(library(container).querySelector('[role="img"] path'), null);
  await click(button(container, "编辑 字符 02"));
  info = await editInfo(container);
  assert.equal(info.name.value, "");
  assert.equal(info.description.value, "仅描述");
  await inputValue(info.description, "");
  assert.equal(button(info.dialog, "确认").disabled, false);
  await confirm(info.dialog);
  assert.equal(
    editor(container).querySelector(".glyph-card.selected strong"),
    null,
  );
  assert.equal(
    editor(container).querySelector(".glyph-card.selected small"),
    null,
  );
  await key("s", true);
  assert.equal(saved.at(-1)?.glyphs[1].name, "");
  assert.equal(saved.at(-1)?.glyphs[1].description, "");
});

test("library context menus edit the right-clicked glyph without entering the editor", async (t) => {
  const { container, saved, project } = await render(t);
  await inputValue(library(container).querySelector("input")!, "乙戊");
  await contextMenu(button(container, "编辑 乙"));
  const menu = container.querySelector<HTMLElement>(
    '[role="menu"][aria-label="字符操作"]',
  )!;
  assert.ok(menu);
  assert.equal(menu.closest("[hidden]"), null);
  assert.deepEqual(
    Array.from(menu.querySelectorAll("button"), (item) =>
      item.textContent?.trim(),
    ),
    ["编辑基本信息", "复制字符", "删除字符"],
  );
  assert.equal(editor(container).hidden, true);
  // 右键字符必须清理造字页遗留的节点选择，始终显示整字操作。
  assert.equal(
    editor(container).querySelector(".glyph-card.selected strong")?.textContent,
    "乙",
  );
  await act(async () => {
    menu.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  assert.equal(container.querySelector(".editor-context-menu"), null);
  await contextMenu(button(container, "编辑 乙"));
  await click(button(container, "编辑基本信息"));
  const dialog = container.querySelector("dialog")!;
  const [name, description] = dialog.querySelectorAll("input");
  assert.equal(name.value, "乙");
  await inputValue(name, "戊");
  await inputValue(description, "字库说明");
  await confirm(dialog);
  assert.equal(editor(container).hidden, true);
  assert.equal(button(container, "字库").getAttribute("aria-current"), "page");
  assert.ok(button(container, "编辑 戊").textContent?.includes("字库说明"));
  const cells = library(container).querySelectorAll('[role="img"]');
  assert.equal(cells[0].querySelector("path"), null);
  assert.ok(cells[1].querySelector("path"));
  await key("s", true);
  assert.equal(saved.at(-1)?.glyphs[1].name, "戊");
  assert.equal(saved.at(-1)?.glyphs[1].description, "字库说明");
  assert.deepEqual(saved.at(-1)?.glyphs[0], project.glyphs[0]);
  await contextMenu(button(container, "编辑 戊"));
  await click(button(container, "造字"));
  assert.equal(container.querySelector(".editor-context-menu"), null);
});

test("library copy and confirmed deletion persist without undo history; cancelling preserves the glyph", async (t) => {
  const { container, saved, project } = await render(t);
  const cards = () =>
    library(container).querySelectorAll(
      'section[aria-label="全部字符"] button',
    );
  await contextMenu(button(container, "编辑 𠮷"));
  await click(button(container, "编辑基本信息"));
  const dialog = container.querySelector("dialog")!;
  await inputValue(dialog.querySelectorAll("input")[1], "保留说明");
  await confirm(dialog);
  await contextMenu(button(container, "编辑 𠮷"));
  await click(button(container, "复制字符"));
  assert.equal(container.querySelector(".editor-context-menu"), null);
  assert.equal(editor(container).hidden, true);
  assert.equal(cards().length, 6);
  assert.ok(
    button(container, "编辑 𠮷 副本").textContent?.includes("保留说明"),
  );
  await key("s", true);
  const source = saved.at(-1)!.glyphs[2],
    copy = saved.at(-1)!.glyphs[5];
  assert.notEqual(copy.id, source.id);
  assert.deepEqual(copy.nodes, source.nodes);
  assert.deepEqual(copy.strokes, source.strokes);
  assert.equal(copy.description, source.description);
  await contextMenu(button(container, "编辑 乙"));
  await click(button(container, "删除字符"));
  assert.equal(editor(container).hidden, true);
  assert.equal(cards().length, 6);
  let deletion = container.querySelector<HTMLDialogElement>(
    '[role="alertdialog"]',
  )!;
  assert.ok(deletion.textContent?.includes("确定删除「乙」"));
  await click(button(deletion, "取消"));
  assert.equal(cards().length, 6);
  assert.equal(container.querySelector("dialog"), null);
  await contextMenu(button(container, "编辑 乙"));
  await click(button(container, "删除字符"));
  deletion = container.querySelector<HTMLDialogElement>(
    '[role="alertdialog"]',
  )!;
  await click(button(deletion, "删除"));
  assert.equal(container.querySelector("dialog"), null);
  assert.equal(cards().length, 5);
  assert.ok(button(container, "编辑 𠮷 副本"));
  await key("s", true);
  assert.equal(
    saved.at(-1)!.glyphs.some((glyph) => glyph.id === project.glyphs[1].id),
    false,
  );
  assert.ok(saved.at(-1)!.glyphs.some((glyph) => glyph.id === copy.id));
  await click(button(container, "造字"));
  assert.equal(button(container, "撤销 Ctrl+Z").disabled, true);
  await key("z", true);
  assert.equal(cards().length, 5);
  assert.equal(
    Array.from(cards()).some(
      (card) => card.getAttribute("aria-label") === "编辑 乙",
    ),
    false,
  );
  assert.ok(button(container, "编辑 𠮷 副本"));
  await key("y", true);
  assert.equal(cards().length, 5);
});

test("editor undo skips glyph management and deletion dialogs isolate shortcuts and support dismissal", async (t) => {
  const { container, saved } = await render(t);
  await inputValue(library(container).querySelector("input")!, "乙");
  await click(button(container, "编辑 乙"));
  const preview = () =>
    library(container).querySelector('[role="img"] path')!.getAttribute("d");
  const before = preview();
  await key("a", true);
  await key("ArrowRight");
  const info = await editInfo(container);
  const after = preview();
  assert.notEqual(before, after);
  await inputValue(info.description, "保持信息");
  await confirm(info.dialog);
  await contextMenu(editor(container).querySelector(".glyph-card.selected")!);
  await click(button(container, "复制字符"));
  await key("z", true);
  assert.equal(preview(), before);
  assert.ok(button(container, "编辑 乙 副本"));
  assert.ok(button(container, "编辑 乙").textContent?.includes("保持信息"));
  await contextMenu(editor(container).querySelector(".glyph-card.selected")!);
  await click(button(container, "删除字符"));
  const deletion = container.querySelector<HTMLDialogElement>(
    '[role="alertdialog"]',
  )!;
  await key("y", true);
  await key("Delete");
  assert.equal(preview(), before);
  assert.ok(button(container, "编辑 乙 副本"));
  await act(async () => {
    deletion.dispatchEvent(
      new dom.window.Event("cancel", { cancelable: true }),
    );
  });
  assert.equal(container.querySelector("dialog"), null);
  await key("y", true);
  assert.equal(preview(), after);
  await contextMenu(editor(container).querySelector(".glyph-card.selected")!);
  await click(button(container, "删除字符"));
  await click(button(container.querySelector('[role="alertdialog"]')!, "删除"));
  await key("z", true);
  assert.equal(preview(), before);
  assert.equal(
    Array.from(library(container).querySelectorAll("button")).some(
      (b) => b.getAttribute("aria-label") === "编辑 乙 副本",
    ),
    false,
  );
  await key("s", true);
  assert.equal(saved.at(-1)!.glyphs[1].description, "保持信息");
});
