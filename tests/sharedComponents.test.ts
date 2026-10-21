import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";
import { act, createElement as h, StrictMode, useRef, useState } from "react";
import type { ReactNode } from "react";
import { emptyGlyph, newStroke } from "../src/core/model";
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
    assert.equal(this.open, false);
    this.open = true;
  },
  close() {
    this.open = false;
  },
});
const { createRoot } = await import("react-dom/client");
const { Button } = await import("../src/shared/components/Button");
const { IconButton } = await import("../src/shared/components/controls");
const { Modal } = await import("../src/shared/components/Modal");
const { Menu } = await import("../src/shared/components/Menu");
const { ToastProvider, useToast } =
  await import("../src/shared/components/Toast");
const { ProjectProvider } = await import("../src/features/project/useProject");
const { useProjectFiles } =
  await import("../src/features/project/useProjectFiles");
const { default: App } = await import("../src/app/App");

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
async function click(element: HTMLElement) {
  await act(async () => element.click());
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

test("buttons default to non-submit and preserve refs, native attributes and handlers", async (t) => {
  let submitted = 0,
    pressed = 0;
  function Form() {
    const button = useRef<HTMLButtonElement>(null);
    return h(
      "form",
      {
        onSubmit: (event) => {
          event.preventDefault();
          submitted++;
        },
      },
      h(
        Button,
        {
          ref: button,
          name: "action",
          value: "save",
          onClick: () => {
            assert.equal(button.current?.value, "save");
            pressed++;
          },
        },
        "普通按钮",
      ),
      h(IconButton, {
        title: "确认",
        icon: "check",
        type: "submit",
        "data-test": "submit",
      }),
      h(Button, { disabled: true, onClick: () => pressed++ }, "禁用"),
    );
  }
  const { container } = await render(t, h(Form));
  const buttons = container.querySelectorAll("button");
  await click(buttons[0]);
  await click(buttons[2]);
  assert.equal(pressed, 1);
  assert.equal(submitted, 0);
  await click(buttons[1]);
  assert.equal(submitted, 1);
  assert.equal(buttons[1].dataset.test, "submit");
});

test("modal focuses its content, wraps Tab, preserves save shortcuts and restores focus in StrictMode", async (t) => {
  let saves = 0,
    leaked = 0;
  const listener = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.key === "s") saves++;
    else leaked++;
  };
  window.addEventListener("keydown", listener);
  t.after(() => window.removeEventListener("keydown", listener));
  function DialogProbe() {
    const [open, setOpen] = useState(false);
    return h(
      "div",
      null,
      h(Button, { onClick: () => setOpen(true) }, "打开"),
      open &&
        h(
          Modal,
          { onClose: () => setOpen(false), "aria-label": "测试弹窗" },
          h("input", { autoFocus: true }),
          h(Button, null, "最后一个"),
        ),
    );
  }
  const { container } = await render(t, h(StrictMode, null, h(DialogProbe)));
  const trigger = container.querySelector("button")!;
  trigger.focus();
  await click(trigger);
  const dialog = container.querySelector("dialog")!,
    input = dialog.querySelector("input")!,
    last = dialog.querySelector("button")!;
  assert.equal(dialog.open, true);
  assert.ok(document.activeElement === input, "焦点应位于预期元素");
  await key(input, "Tab", { shiftKey: true });
  assert.ok(document.activeElement === last, "焦点应位于预期元素");
  await key(last, "Tab");
  assert.ok(document.activeElement === input, "焦点应位于预期元素");
  await key(input, "Delete");
  await key(input, "z", { ctrlKey: true });
  assert.equal(leaked, 0);
  await key(input, "s", { ctrlKey: true });
  assert.equal(saves, 1);
  await key(input, "Escape");
  assert.equal(container.querySelector("dialog"), null);
  assert.ok(document.activeElement === trigger, "焦点应位于预期元素");
});

test("modal only dismisses backdrop gestures that both start and finish outside its bounds", async (t) => {
  let closes = 0;
  const { container } = await render(
    t,
    h(
      Modal,
      { onClose: () => closes++, "aria-label": "遮罩测试" },
      h("p", null, "内容"),
    ),
  );
  const dialog = container.querySelector("dialog")!;
  t.mock.method(dialog, "getBoundingClientRect", () => ({
    left: 100,
    top: 100,
    right: 400,
    bottom: 300,
    width: 300,
    height: 200,
    x: 100,
    y: 100,
    toJSON() {},
  }));
  async function gesture(
    start: Element,
    x: number,
    y: number,
    endX: number,
    endY: number,
  ) {
    await act(async () => {
      start.dispatchEvent(
        new dom.window.MouseEvent("pointerdown", {
          bubbles: true,
          clientX: x,
          clientY: y,
        }),
      );
      dialog.dispatchEvent(
        new dom.window.MouseEvent("click", {
          bubbles: true,
          clientX: endX,
          clientY: endY,
        }),
      );
    });
  }
  await gesture(dialog, 120, 120, 120, 120);
  assert.equal(closes, 0);
  await gesture(dialog.querySelector("p")!, 120, 120, 0, 0);
  assert.equal(closes, 0);
  await gesture(dialog, 0, 0, 0, 0);
  assert.equal(closes, 1);
  await act(async () => {
    dialog.dispatchEvent(new dom.window.Event("cancel", { cancelable: true }));
  });
  assert.equal(closes, 2);
});

test("menus navigate enabled actions, isolate edit keys, allow Tab and save, and restore trigger focus", async (t) => {
  let calls = 0,
    leaked = 0,
    saves = 0;
  const listener = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.key === "s") saves++;
    else leaked++;
  };
  window.addEventListener("keydown", listener);
  t.after(() => window.removeEventListener("keydown", listener));
  const { container } = await render(
    t,
    h(Menu, {
      label: "操作",
      trigger: (props) => h(Button, props, "打开"),
      items: [
        { label: "第一项", action: () => calls++ },
        { label: "禁用项", disabled: true, action: () => calls++ },
        { label: "最后一项", action: () => calls++ },
      ],
    }),
  );
  const trigger = container.querySelector("button")!;
  trigger.focus();
  await key(trigger, "ArrowDown");
  const items =
    container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
  assert.ok(document.activeElement === items[0], "焦点应位于预期元素");
  await key(items[0], "ArrowDown");
  assert.ok(document.activeElement === items[2], "焦点应位于预期元素");
  await key(items[2], "Home");
  assert.ok(document.activeElement === items[0], "焦点应位于预期元素");
  await key(items[0], "End");
  assert.ok(document.activeElement === items[2], "焦点应位于预期元素");
  await key(items[2], "z", { ctrlKey: true });
  await key(items[2], "Delete");
  assert.equal(leaked, 0);
  assert.equal(calls, 0);
  await key(items[2], "s", { ctrlKey: true });
  assert.equal(saves, 1);
  const tab = await key(items[2], "Tab");
  assert.equal(tab.defaultPrevented, false);
  assert.equal(container.querySelector('[role="menu"]'), null);
  assert.ok(document.activeElement === trigger, "焦点应位于预期元素");
  await key(trigger, "ArrowUp");
  assert.equal(document.activeElement?.textContent, "最后一项");
  await key(document.activeElement!, "Escape");
  assert.ok(document.activeElement === trigger, "焦点应位于预期元素");
  await click(trigger);
  await click(container.querySelector('[role="menuitem"]')!);
  assert.equal(calls, 1);
  assert.equal(container.querySelector('[role="menu"]'), null);
});

test("menu actions can open a modal without a closing menu stealing its focus", async (t) => {
  function Probe() {
    const [open, setOpen] = useState(false);
    return h(
      "div",
      null,
      h(Menu, {
        label: "操作",
        trigger: (props) => h(Button, props, "打开"),
        items: [{ label: "编辑", action: () => setOpen(true) }],
      }),
      open &&
        h(
          Modal,
          { "aria-label": "编辑", onClose: () => setOpen(false) },
          h("input", { autoFocus: true }),
        ),
    );
  }
  const { container } = await render(t, h(Probe));
  const trigger = container.querySelector("button")!;
  trigger.focus();
  await key(trigger, "ArrowDown");
  await click(container.querySelector('[role="menuitem"]')!);
  assert.ok(
    document.activeElement === container.querySelector("input"),
    "焦点应位于预期元素",
  );
  await key(document.activeElement!, "Escape");
  assert.ok(document.activeElement === trigger, "焦点应位于预期元素");
});

test("context menus stay open through StrictMode effect replay and restore their opener on Escape", async (t) => {
  let closes = 0;
  function Probe() {
    const [open, setOpen] = useState(false);
    return h(
      "div",
      null,
      h(Button, { onClick: () => setOpen(true) }, "右键入口"),
      open &&
        h(Menu, {
          label: "右键操作",
          position: { x: 100, y: 100 },
          onClose: () => {
            closes++;
            setOpen(false);
          },
          items: [{ label: "操作", action: () => {} }],
        }),
    );
  }
  const { container } = await render(t, h(StrictMode, null, h(Probe)));
  const trigger = container.querySelector("button")!;
  trigger.focus();
  await click(trigger);
  const menu = container.querySelector('[role="menu"]')!;
  assert.ok(menu);
  assert.ok(menu.contains(document.activeElement));
  await key(menu, "ArrowDown");
  assert.equal(document.activeElement?.textContent, "操作");
  await key(document.activeElement!, "Escape");
  assert.equal(container.querySelector('[role="menu"]'), null);
  assert.ok(document.activeElement === trigger);
  assert.equal(closes, 1);
});

test("identical toast messages restart their duration, errors have alert semantics, and providers are isolated", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  function Probe() {
    const toast = useToast();
    return h(
      "div",
      null,
      h(
        Button,
        { onClick: () => toast("重复提示", { tone: "success" }) },
        "提示",
      ),
      h(
        Button,
        { onClick: () => toast("读取失败", { tone: "error" }) },
        "错误",
      ),
    );
  }
  const { container } = await render(
    t,
    h(
      "div",
      null,
      h(ToastProvider, null, h(Probe)),
      h(ToastProvider, null, h(Probe)),
    ),
  );
  const buttons = container.querySelectorAll("button");
  await click(buttons[0]);
  const first = container.querySelector(".toast");
  await act(async () => t.mock.timers.tick(3000));
  await click(buttons[0]);
  assert.ok(container.querySelector(".toast") !== first);
  await act(async () => t.mock.timers.tick(200));
  assert.equal(container.querySelectorAll(".toast").length, 1);
  await click(buttons[3]);
  assert.equal(container.querySelectorAll(".toast").length, 2);
  assert.equal(
    container.querySelector('.toast[role="alert"]')?.textContent,
    "读取失败",
  );
  await act(async () => t.mock.timers.tick(3000));
  assert.equal(container.querySelectorAll(".toast").length, 1);
  await act(async () => t.mock.timers.tick(200));
  assert.equal(container.querySelectorAll(".toast").length, 0);
});

test("PNG feedback waits for encoding and handles null blobs and canvas failures", async (t) => {
  t.mock.method(projectStorage, "save", async () => {});
  let image: { onload: () => void; onerror: () => void; src: string };
  class FakeImage {
    onload = () => {};
    onerror = () => {};
    src = "";
    constructor() {
      image = this;
    }
  }
  const oldImage = globalThis.Image;
  Object.assign(globalThis, { Image: FakeImage });
  t.after(() => {
    globalThis.Image = oldImage;
  });
  const revoked: string[] = [];
  t.mock.method(URL, "createObjectURL", () => "blob:test");
  t.mock.method(URL, "revokeObjectURL", (url) => revoked.push(url));
  t.mock.method(dom.window.HTMLCanvasElement.prototype, "getContext", () => ({
    drawImage() {},
  }));
  let complete!: BlobCallback;
  t.mock.method(
    dom.window.HTMLCanvasElement.prototype,
    "toBlob",
    (callback: BlobCallback) => {
      complete = callback;
    },
  );
  let downloads = 0;
  t.mock.method(
    dom.window.HTMLAnchorElement.prototype,
    "click",
    () => downloads++,
  );
  function Probe() {
    const { savePng } = useProjectFiles();
    return h(Button, { onClick: savePng }, "PNG");
  }
  const glyph = emptyGlyph("甲");
  const { container } = await render(
    t,
    h(ProjectProvider, {
      initialProject: { version: 1, activeId: glyph.id, glyphs: [glyph] },
      children: h(ToastProvider, null, h(Probe)),
    }),
  );
  const trigger = container.querySelector("button")!;
  await click(trigger);
  await act(async () => image.onload());
  assert.equal(container.querySelector(".toast"), null);
  assert.equal(downloads, 0);
  await act(async () => complete(null));
  assert.equal(
    container.querySelector('.toast[role="alert"]')?.textContent,
    "PNG 导出失败",
  );
  await click(trigger);
  await act(async () => image.onload());
  await act(async () => complete(new Blob(["png"])));
  assert.equal(downloads, 1);
  assert.equal(
    container.querySelector('.toast[role="status"]')?.textContent,
    "PNG 已导出",
  );
  t.mock.method(
    dom.window.HTMLCanvasElement.prototype,
    "getContext",
    () => null,
  );
  await click(trigger);
  await act(async () => image.onload());
  assert.equal(
    container.querySelector('.toast[role="alert"]')?.textContent,
    "PNG 导出失败",
  );
  assert.equal(downloads, 1);
  assert.ok(revoked.length >= 3);
});

test("workspace export menus block canvas undo and Tab preview, while modal save still reaches autosave", async (t) => {
  // 固定自动保存窗口，避免并行测试耗时改变 Ctrl+S 前的保存次数。
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let saves = 0;
  t.mock.method(projectStorage, "save", async () => {
    saves++;
  });
  const glyph = emptyGlyph("甲");
  glyph.nodes = {
    a: { id: "a", x: 100, y: 100, width: 30, mode: "corner" },
    b: { id: "b", x: 200, y: 200, width: 30, mode: "corner" },
  };
  glyph.strokes = [newStroke(["a", "b"], 0)];
  const { container } = await render(
    t,
    h(App, {
      initialProject: { version: 1, activeId: glyph.id, glyphs: [glyph] },
    }),
  );
  const button = (label: string) => {
    const result = [...container.querySelectorAll("button")].find(
      (item) =>
        item.getAttribute("aria-label") === label ||
        item.textContent?.trim() === label,
    );
    assert.ok(result, label);
    return result;
  };
  await click(button("造字"));
  const artwork = () =>
    container.querySelector("[data-stroke-id]")?.getAttribute("d");
  const original = artwork();
  await key(document.body, "a", { ctrlKey: true });
  await key(document.body, "ArrowRight");
  await key(document.body, "Escape");
  const edited = artwork();
  assert.notEqual(edited, original);
  const trigger = button("更多导出格式");
  trigger.focus();
  await click(trigger);
  await key(trigger, "z", { ctrlKey: true });
  assert.equal(artwork(), edited);
  await key(trigger, "ArrowDown");
  const tab = await key(document.activeElement!, "Tab");
  assert.equal(tab.defaultPrevented, false);
  assert.equal(artwork(), edited);
  assert.equal(container.querySelector(".export-dropdown"), null);
  assert.equal(button("预览").classList.contains("active"), false);
  await key(document.body, "z", { ctrlKey: true });
  assert.equal(artwork(), original);
  const shortcuts = button("快捷键");
  shortcuts.focus();
  await click(shortcuts);
  const dialog = container.querySelector("dialog")!;
  assert.ok(dialog.contains(document.activeElement));
  await key(document.activeElement!, "s", { ctrlKey: true });
  assert.equal(saves, 1);
  await key(document.activeElement!, "Escape");
  assert.equal(container.querySelector("dialog"), null);
  assert.ok(document.activeElement === shortcuts);
});

test("releasing Space inside a modal or menu clears temporary canvas panning", async (t) => {
  t.mock.method(projectStorage, "save", async () => {});
  const glyph = emptyGlyph("甲");
  const { container } = await render(
    t,
    h(App, {
      initialProject: { version: 1, activeId: glyph.id, glyphs: [glyph] },
    }),
  );
  const button = (label: string) => {
    const result =
      container.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      ) ??
      [...container.querySelectorAll("button")].find(
        (element) => element.textContent?.trim() === label,
      );
    assert.ok(result, label);
    return result;
  };
  await click(button("造字"));
  const stage = container.querySelector(".canvas-stage")!;
  for (const label of ["快捷键", "更多导出格式"]) {
    await key(document.body, " ", { code: "Space" });
    assert.equal(stage.classList.contains("space-pan"), true);
    const trigger = button(label);
    trigger.focus();
    await click(trigger);
    const target = container.querySelector("dialog button") ?? trigger;
    await act(async () => {
      target.dispatchEvent(
        new dom.window.KeyboardEvent("keyup", {
          key: " ",
          code: "Space",
          bubbles: true,
        }),
      );
    });
    assert.equal(stage.classList.contains("space-pan"), false, label);
    await key(target, "Escape");
  }
});

test("focused buttons keep native Space and Tab behavior while canvas Tab still toggles preview", async (t) => {
  t.mock.method(projectStorage, "save", async () => {});
  const glyph = emptyGlyph("甲");
  const { container } = await render(
    t,
    h(App, {
      initialProject: { version: 1, activeId: glyph.id, glyphs: [glyph] },
    }),
  );
  const editor = [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "造字",
  )!;
  await click(editor);
  const preview = container.querySelector<HTMLButtonElement>(".view-button")!;
  const stage = container.querySelector(".canvas-stage")!;
  preview.focus();
  const space = await key(preview, " ", { code: "Space" });
  assert.equal(space.defaultPrevented, false);
  assert.equal(stage.classList.contains("space-pan"), false);
  const tab = await key(preview, "Tab");
  assert.equal(tab.defaultPrevented, false);
  assert.equal(preview.classList.contains("active"), false);
  const summary = container.querySelector("summary")!;
  const expand = await key(summary, " ", { code: "Space" });
  assert.equal(expand.defaultPrevented, false);
  assert.equal(stage.classList.contains("space-pan"), false);
  await key(document.body, "Tab");
  assert.equal(preview.classList.contains("active"), true);
});

test("IME cancellation does not dismiss the modal or trigger background shortcuts", async (t) => {
  let closes = 0,
    leaked = 0;
  const listener = () => leaked++;
  window.addEventListener("keydown", listener);
  t.after(() => window.removeEventListener("keydown", listener));
  const { container } = await render(
    t,
    h(
      Modal,
      { "aria-label": "中文输入", onClose: () => closes++ },
      h("input", { autoFocus: true }),
    ),
  );
  const input = container.querySelector("input")!;
  await key(input, "Escape", { isComposing: true });
  await key(input, "Escape", { keyCode: 229 });
  assert.equal(closes, 0);
  assert.equal(leaked, 0);
  await key(input, "Escape");
  assert.equal(closes, 1);
});

test("an expiring toast cannot dismiss a newer notification queued in the same batch", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  function Probe() {
    const toast = useToast();
    return h(Button, { onClick: () => toast("新提示") }, "提示");
  }
  const { container } = await render(t, h(ToastProvider, null, h(Probe)));
  const trigger = container.querySelector("button")!;
  await click(trigger);
  await act(async () => t.mock.timers.tick(3000));
  await act(async () => {
    trigger.click();
    t.mock.timers.tick(200);
  });
  assert.equal(container.querySelector(".toast")?.textContent, "新提示");
  await act(async () => t.mock.timers.tick(3200));
  assert.equal(container.querySelector(".toast"), null);
});
