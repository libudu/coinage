import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";
import { act, createElement as h } from "react";
import { emptyGlyph, newStroke } from "../src/core/model";
import type { Project } from "../src/core/model";
import { glyphPath } from "../src/core/geometry";
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
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
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

async function render(t: TestContext) {
  const saved: Project[] = [];
  t.mock.method(projectStorage, "save", async (project: Project) => {
    saved.push(project);
  });
  const container = document.createElement("div"),
    project = manuscript();
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
async function contextMenu(target: Element) {
  const event = new dom.window.MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: 120,
    clientY: 120,
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
  assert.ok(reopenedCells[0].classList.contains("bg-[#fcfdf9]"));
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

test("library cards open the selected glyph, preserve the editor view and preview text, and effects stay disabled", async (t) => {
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
  const effects = button(container, "特效");
  assert.equal(effects.disabled, true);
  await click(effects);
  assert.equal(editor(container).hidden, false);
  await click(button(container, "字库"));
  assert.equal(library(container).querySelector("input")!.value, "甲乙");
  await click(button(container, "造字"));
  assert.equal(editor(container).querySelector("svg"), canvas);
  assert.equal(
    editor(container).querySelector(".glyph-card.selected strong")?.textContent,
    "乙",
  );
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
