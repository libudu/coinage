import { defaultImportSettings } from "../src/core/importSettings";
import type { ImportSettings } from "../src/core/importSettings";
import { emptyGlyph, newStroke } from "../src/core/model";
import type { ProjectStore } from "../src/features/project/projectStore";
import { projectStorage } from "../src/features/project/projectStorage";
import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";
import { act, createElement as h } from "react";
import type { Glyph } from "../src/core/model";
import { defaultBrush } from "../src/core/brush";
import type { BrushDefaults } from "../src/core/brush";
import { glyphBounds, glyphPath } from "../src/core/geometry";
import { isProject } from "../src/core/validation";
import {
  rasterize,
  traceRasterWithPlacement,
} from "../src/features/tracing/trace";
import type { Raster } from "../src/features/tracing/trace";
import type { TraceOptions } from "../src/core/importSettings";

register("./support/domLoader.mjs", import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://127.0.0.1",
});
const pixels = new Uint8ClampedArray(420 * 420 * 4).fill(255);
for (let y = 180; y < 200; y++)
  for (let x = 90; x < 290; x++) pixels.set([0, 0, 0, 255], (y * 420 + x) * 4);
type Request = {
  raster: Raster;
  options: TraceOptions;
  name: string;
  brush?: BrushDefaults;
};
const workers: TestWorker[] = [];
const sourceSize = { width: 420, height: 420 };
class TestWorker {
  onmessage:
    | ((event: {
        data: ReturnType<typeof traceRasterWithPlacement> | { error: string };
      }) => void)
    | null = null;
  onerror: (() => void) | null = null;
  request!: Request;
  terminated = false;
  constructor() {
    workers.push(this);
  }
  postMessage(request: Request) {
    this.request = request;
  }
  terminate() {
    this.terminated = true;
  }
  reply() {
    const { raster, options, name, brush } = this.request;
    this.onmessage?.({
      data: traceRasterWithPlacement(raster, options, name, brush),
    });
  }
}
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
  Worker: TestWorker,
  Image: class {
    naturalWidth = sourceSize.width;
    naturalHeight = sourceSize.height;
    onload?: () => void;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  },
});
Object.assign(dom.window.HTMLDialogElement.prototype, {
  showModal() {
    this.open = true;
  },
  close() {
    this.open = false;
  },
});
const referenceDraws: { x: number; y: number }[] = [];
const imageDraws: number[][] = [];
Object.assign(dom.window.HTMLCanvasElement.prototype, {
  getContext() {
    return {
      drawImage(_source: unknown, ...args: number[]) {
        referenceDraws.push({ x: args[0], y: args[1] });
        imageDraws.push(args);
      },
      getImageData() {
        return { data: pixels };
      },
      createImageData(width: number, height: number) {
        return { data: new Uint8ClampedArray(width * height * 4) };
      },
      putImageData() {},
    };
  },
  toDataURL() {
    return "data:image/png;base64,AA==";
  },
});
const { createRoot } = await import("react-dom/client");
const { ImportDialog } = await import("../src/features/tracing/ImportDialog");
const { GlyphSidebar } = await import("../src/features/editor/GlyphSidebar");
const { ProjectProvider, useProjectApi } =
  await import("../src/features/project/useProject");
const brush: BrushDefaults = { ...defaultBrush, startTip: "horizontal" };

async function render(
  t: TestContext,
  initialSettings: ImportSettings = defaultImportSettings,
  filename = "甲.png",
) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  workers.length = 0;
  referenceDraws.length = 0;
  imageDraws.length = 0;
  const backend = { settings: { ...initialSettings }, saves: 0 };
  localStorage.clear();
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "PUT") {
        backend.settings = JSON.parse(String(init.body));
        backend.saves++;
        return new Response(JSON.stringify({ saved: true }));
      }
      return new Response(JSON.stringify(backend.settings));
    },
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container),
    imported: Glyph[] = [];
  const props = {
    source: { src: "data:image/png;base64,AA==", name: filename },
    brush,
    onClose() {},
    onImport(g: Glyph) {
      imported.push(g);
    },
  };
  await act(async () => root.render(h(ImportDialog, props)));
  t.after(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  return {
    container,
    root,
    props,
    imported,
    backend,
    path: () =>
      container.querySelector("[data-trace-artwork]")?.getAttribute("d"),
    confirm: () =>
      container.querySelector<HTMLButtonElement>(
        ".modal-footer button:last-child",
      )!,
    busy: () =>
      container.querySelector(".trace-preview svg")!.getAttribute("aria-busy"),
  };
}
async function input(
  container: Element,
  label: string,
  value: number | string,
) {
  const element = container.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    )!.set!.call(element, String(value));
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
async function tick(t: TestContext, time = 150) {
  await act(async () => t.mock.timers.tick(time));
}
async function ready(t: TestContext) {
  const result = await render(t);
  await tick(t);
  assert.equal(workers.length, 1);
  await act(async () => workers[0].reply());
  assert.equal(result.busy(), "false");
  return result;
}

test("filename metadata is previewed below the artboard, updates without retracing and is used by import", async (t) => {
  const { container, root, props, backend, imported, path, confirm } =
    await render(t, defaultImportSettings, "狼族语_0002s_0038_朋友.png");
  const pattern = () =>
    container.querySelector<HTMLInputElement>(
      'input[aria-label="文件名模板"]',
    )!;
  const name = () =>
    container.querySelector("[data-filename-name]")!.textContent;
  const description = () =>
    container.querySelector("[data-filename-description]")!.textContent;
  assert.equal(pattern().value, "{desc*}_{name}");
  assert.equal(pattern().closest(".trace-preview"), null);
  assert.equal(
    pattern().parentElement!.previousElementSibling,
    container.querySelector(".trace-preview"),
  );
  assert.equal(name(), "朋友");
  assert.equal(description(), "狼族语_0002s_0038");
  await tick(t);
  await act(async () => workers[0].reply());
  const contour = path(),
    draws = imageDraws.length;
  await act(async () => confirm().click());
  assert.equal(imported[0].name, "朋友");
  assert.equal(imported[0].description, "狼族语_0002s_0038");
  await input(container, "文件名模板", "狼族语_{desc*}_{name}");
  assert.equal(description(), "0002s_0038");
  assert.equal(backend.settings.filenamePattern, "狼族语_{desc*}_{name}");
  await input(container, "文件名模板", "{desc}_{name}");
  assert.equal(name(), "0002s_0038_朋友");
  assert.equal(description(), "狼族语");
  await input(container, "文件名模板", "{name*}_{desc}");
  assert.equal(name(), "狼族语_0002s_0038");
  assert.equal(description(), "朋友");
  await input(container, "文件名模板", "{name}_{desc}");
  assert.equal(name(), "狼族语");
  assert.equal(description(), "0002s_0038_朋友");
  await act(async () => confirm().click());
  assert.equal(imported[1].name, name());
  assert.equal(imported[1].description, description());
  assert.equal(glyphPath(imported[1], brush), contour);
  assert.equal(path(), contour);
  await tick(t);
  assert.equal(workers.length, 1);
  assert.equal(imageDraws.length, draws + 2);
  await act(async () => root.render(null));
  await act(async () => root.render(h(ImportDialog, props)));
  assert.equal(pattern().value, "{name}_{desc}");
  assert.equal(name(), "狼族语");
  const reset = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "恢复默认",
  )!;
  await act(async () => reset.click());
  assert.equal(pattern().value, "{desc*}_{name}");
  assert.equal(name(), "朋友");
  assert.equal(description(), "狼族语_0002s_0038");
});

test("unmatched, invalid and blank filename templates show exactly the fallback metadata that will be imported", async (t) => {
  const { container, imported, confirm } = await ready(t);
  for (const pattern of [
    "{desc*}_{name}",
    "{bad}",
    "{name}{desc}",
    "{desc**}_{name}",
    "{name*}-{desc}",
    "",
  ]) {
    await input(container, "文件名模板", pattern);
    assert.equal(
      container.querySelector("[data-filename-name]")!.textContent,
      "甲",
    );
    assert.equal(
      container.querySelector("[data-filename-description]")!.textContent,
      "—",
    );
    assert.equal(
      container
        .querySelector('[aria-label="文件名模板"]')!
        .getAttribute("aria-invalid"),
      String(Boolean(pattern)),
    );
    assert.equal(confirm().disabled, false);
    await act(async () => confirm().click());
    assert.equal(imported.at(-1)!.name, "甲");
    assert.equal(imported.at(-1)!.description, "");
  }
  assert.equal(workers.length, 1);
});

test("square cropping uses one centered region and preserves the complete rectangular source at zero", async (t) => {
  const previous = { ...sourceSize };
  t.after(() => Object.assign(sourceSize, previous));
  for (const [width, height] of [
    [420, 210],
    [210, 420],
  ]) {
    Object.assign(sourceSize, { width, height });
    for (const crop of [0, 10, 45]) {
      await rasterize("data:image/png;base64,AA==", crop);
      const [x, y, w, h, dx, dy, dw, dh] = imageDraws.at(-1)!;
      assert.equal(w, h);
      assert.equal(w, 420 * (1 - (crop * 2) / 100));
      assert.equal(x + w / 2, width / 2);
      assert.equal(y + h / 2, height / 2);
      assert.deepEqual([dx, dy, dw, dh], [30, 30, 360, 360]);
      if (crop === 0) {
        assert.ok(x <= 0 && y <= 0);
        assert.ok(x + w >= width && y + h >= height);
      }
    }
  }
});

test("dragging import width updates the contour immediately without restarting recognition and imports that preview", async (t) => {
  const { container, path, busy, confirm, imported } = await ready(t);
  assert.equal(
    container.querySelector<HTMLInputElement>('input[aria-label="笔画粗细"]')!
      .value,
    "24",
  );
  assert.equal(container.querySelector('input[type="checkbox"]'), null);
  assert.equal(
    container.querySelector<HTMLInputElement>('input[aria-label="边缘裁剪"]')!
      .value,
    "0",
  );
  assert.ok(!container.textContent!.includes("只提取彩色"));
  const original = path();
  for (const width of [1, 95, 200, 24]) {
    await input(container, "笔画粗细", width);
    assert.equal(busy(), "false");
    assert.equal(confirm().disabled, false);
    assert.equal(workers.length, 1);
    if (width !== 24) assert.notEqual(path(), original);
    else assert.equal(path(), original);
  }
  await input(container, "笔画粗细", 76);
  const visible = path();
  await act(async () => confirm().click());
  assert.equal(imported.length, 1);
  assert.ok(
    Object.values(imported[0].nodes).every((node) => node.width === 76),
  );
  assert.equal(glyphPath(imported[0], brush), visible);
  assert.equal(
    isProject({
      version: 1,
      activeId: imported[0].id,
      glyphs: imported,
      brush,
    }),
    true,
  );
  const bounds = glyphBounds(imported[0], brush)!;
  assert.ok(Math.abs((bounds.minX + bounds.maxX) / 2 - 320) < 1e-8);
  const request = workers[0].request;
  const expected = traceRasterWithPlacement(
    request.raster,
    { ...request.options, width: 76 },
    request.name,
    brush,
  );
  for (const axis of ["x", "y"] as const)
    assert.ok(
      Math.abs(referenceDraws.at(-1)![axis] - expected.referenceOffset[axis]) <
        1e-8,
    );
  const expectedNodes = Object.values(expected.glyph.nodes);
  Object.values(imported[0].nodes).forEach((node, index) => {
    assert.ok(Math.abs(node.x - expectedNodes[index].x) < 1e-8);
    assert.ok(Math.abs(node.y - expectedNodes[index].y) < 1e-8);
  });
  await tick(t, 1000);
  assert.equal(workers.length, 1);
});

test("width changes during pending recognition keep its worker and use the latest width on completion", async (t) => {
  const { container, busy, confirm, imported } = await render(t);
  await tick(t);
  const worker = workers[0];
  await input(container, "笔画粗细", 112);
  await tick(t);
  assert.equal(workers.length, 1);
  assert.equal(worker.terminated, false);
  assert.equal(busy(), "true");
  assert.equal(confirm().disabled, true);
  await act(async () => worker.reply());
  assert.equal(busy(), "false");
  await act(async () => confirm().click());
  assert.ok(
    Object.values(imported[0].nodes).every((node) => node.width === 112),
  );
});

test("restore defaults resets every import setting, refreshes recognition and persists the defaults for reopening", async (t) => {
  const { container, root, props, backend, confirm, busy } = await render(t, {
    threshold: 190,
    simplify: 5,
    noise: 35,
    polarity: "light",
    width: 75,
    crop: 15,
    offsetX: -45,
    offsetY: 60,
    filenamePattern: "{name}_{desc}",
  });
  await tick(t);
  const previous = workers[0];
  const reset = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === "恢复默认",
  )!;
  assert.ok(reset);
  await act(async () => reset.click());
  assert.equal(previous.terminated, true);
  assert.equal(busy(), "true");
  assert.equal(confirm().disabled, true);
  assert.deepEqual(backend.settings, defaultImportSettings);
  assert.equal(
    container.querySelector<HTMLInputElement>('input[aria-label="文件名模板"]')!
      .value,
    "{desc*}_{name}",
  );
  for (const [label, key] of [
    ["识别阈值", "threshold"],
    ["路径简化", "simplify"],
    ["去除杂点", "noise"],
    ["笔画粗细", "width"],
    ["边缘裁剪", "crop"],
    ["X 偏移", "offsetX"],
    ["Y 偏移", "offsetY"],
  ] as const)
    assert.equal(
      container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
        .value,
      String(defaultImportSettings[key]),
    );
  assert.equal(
    container
      .querySelector('button[aria-label="深色"]')!
      .getAttribute("aria-pressed"),
    "true",
  );
  await tick(t);
  assert.equal(workers.length, 2);
  await act(async () => workers[1].reply());
  assert.equal(confirm().disabled, false);
  await act(async () => root.render(null));
  await act(async () => root.render(h(ImportDialog, props)));
  assert.equal(
    container.querySelector<HTMLInputElement>('input[aria-label="笔画粗细"]')!
      .value,
    "24",
  );
  assert.deepEqual(backend.settings, defaultImportSettings);
});

test("recognition settings still retrace, reject obsolete results and preserve live width changes", async (t) => {
  const { container, path, busy, confirm, imported } = await ready(t);
  await input(container, "识别阈值", 170);
  assert.equal(busy(), "true");
  assert.equal(confirm().disabled, true);
  await tick(t);
  const obsolete = workers[1];
  await input(container, "识别阈值", 180);
  const waiting = path();
  await act(async () => obsolete.reply());
  assert.equal(path(), waiting);
  assert.equal(busy(), "true");
  await input(container, "笔画粗细", 88);
  assert.notEqual(path(), waiting);
  assert.equal(confirm().disabled, true);
  await tick(t);
  assert.equal(workers.length, 3);
  assert.equal(workers[2].request.options.threshold, 180);
  await act(async () => workers[2].reply());
  assert.equal(busy(), "false");
  await act(async () => confirm().click());
  assert.ok(
    Object.values(imported[0].nodes).every((node) => node.width === 88),
  );
});

test("import shares the editor grid, crops the source, shifts artwork and reference live, and remembers backend settings", async (t) => {
  const settings = {
    ...defaultImportSettings,
    crop: 10,
  };
  const { container, root, props, backend, busy, confirm, imported, path } =
    await render(t, settings);
  assert.ok(container.querySelector("[data-artboard-grid]"));
  assert.equal(container.querySelectorAll('input[type="number"]').length, 0);
  const cropSlider = container.querySelectorAll('input[aria-label="边缘裁剪"]');
  assert.equal(cropSlider.length, 1);
  assert.equal((cropSlider[0] as HTMLInputElement).type, "range");
  for (const label of ["X 偏移", "Y 偏移"]) {
    const slider = container.querySelector<HTMLInputElement>(
      `input[aria-label="${label}"]`,
    )!;
    assert.equal(slider.type, "range");
    assert.equal(slider.min, "-100");
    assert.equal(slider.max, "100");
  }
  assert.deepEqual(imageDraws[0].slice(0, 4), [42, 42, 336, 336]);
  assert.equal(backend.saves, 0);
  await tick(t);
  await act(async () => workers[0].reply());
  const originalPath = path();
  const reference = container.querySelector(".trace-preview image")!;
  const originalX = Number(reference.getAttribute("x")),
    originalY = Number(reference.getAttribute("y"));
  await input(container, "X 偏移", 45);
  await input(container, "Y 偏移", -30);
  assert.equal(busy(), "false");
  assert.equal(workers.length, 1);
  assert.notEqual(path(), originalPath);
  assert.ok(
    Math.abs(Number(reference.getAttribute("x")) - originalX - 45) < 1e-8,
  );
  assert.ok(
    Math.abs(Number(reference.getAttribute("y")) - originalY + 30) < 1e-8,
  );
  await act(async () => confirm().click());
  const bounds = glyphBounds(imported[0], brush)!;
  assert.ok(Math.abs((bounds.minX + bounds.maxX) / 2 - 365) < 1e-8);
  assert.ok(Math.abs((bounds.minY + bounds.maxY) / 2 - 290) < 1e-8);
  assert.equal(
    isProject({
      version: 1,
      activeId: imported[0].id,
      glyphs: imported,
      brush,
    }),
    true,
  );
  await input(container, "边缘裁剪", 12);
  assert.equal(busy(), "true");
  assert.equal(confirm().disabled, true);
  await tick(t);
  assert.equal(workers.length, 2);
  await act(async () => workers[1].reply());
  assert.deepEqual(backend.settings, {
    ...settings,
    crop: 12,
    offsetX: 45,
    offsetY: -30,
  });
  await act(async () => root.render(null));
  await act(async () => root.render(h(ImportDialog, props)));
  for (const [label, value] of [
    ["边缘裁剪", 12],
    ["X 偏移", 45],
    ["Y 偏移", -30],
  ] as const) {
    assert.equal(
      container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
        .value,
      String(value),
    );
  }
});

test("failed settings reads never overwrite backend defaults and retry restores the saved values", async (t) => {
  const { container, root, props, backend } = await render(t);
  await act(async () => root.render(null));
  let fail = true;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) => {
      assert.notEqual(init?.method, "PUT");
      if (fail) throw new Error("offline");
      return new Response(
        JSON.stringify({ ...defaultImportSettings, offsetX: 67 }),
      );
    },
  );
  await act(async () => root.render(h(ImportDialog, props)));
  assert.equal(
    container.querySelector<HTMLFieldSetElement>("fieldset")!.disabled,
    true,
  );
  assert.match(
    container.querySelector('[role="alert"]')!.textContent!,
    /读取导入配置失败/,
  );
  fail = false;
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[role="alert"] button')!
      .click(),
  );
  assert.equal(
    container.querySelector<HTMLFieldSetElement>("fieldset")!.disabled,
    false,
  );
  assert.equal(
    container.querySelector<HTMLInputElement>('input[aria-label="X 偏移"]')!
      .value,
    "67",
  );
  assert.equal(backend.saves, 0);
});

test("failed backend saves expose a retry that persists the latest crop and offset values", async (t) => {
  const { container } = await ready(t);
  let fail = true;
  const saves: ImportSettings[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) => {
      assert.equal(init?.method, "PUT");
      saves.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: fail ? 500 : 200 });
    },
  );
  await input(container, "边缘裁剪", 14);
  await input(container, "X 偏移", 26);
  assert.match(
    container.querySelector('[role="alert"]')!.textContent!,
    /保存导入配置失败/,
  );
  fail = false;
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[role="alert"] button')!
      .click(),
  );
  assert.equal(container.querySelector('[role="alert"]'), null);
  assert.equal(saves.at(-1)!.crop, 14);
  assert.equal(saves.at(-1)!.offsetX, 26);
});

test("new blank and imported glyphs scroll only the character list to reveal their selected cards", async (t) => {
  t.mock.method(projectStorage, "save", async () => {});
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  t.after(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  t.mock.method(
    dom.window.HTMLElement.prototype,
    "getBoundingClientRect",
    function (this: HTMLElement) {
      if (this.classList.contains("glyph-list"))
        return { top: 0, bottom: 200 } as DOMRect;
      if (this.classList.contains("glyph-card")) {
        const list = this.parentElement!;
        const top =
          Array.from(list.children).indexOf(this) * 90 - list.scrollTop;
        return { top, bottom: top + 83 } as DOMRect;
      }
      return { top: 0, bottom: 0 } as DOMRect;
    },
  );
  const size = Object.getOwnPropertyDescriptor(
    dom.window.Element.prototype,
    "clientHeight",
  )!;
  Object.defineProperty(dom.window.Element.prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.classList.contains("glyph-list") ? 200 : 0;
    },
  });
  t.after(() =>
    Object.defineProperty(dom.window.Element.prototype, "clientHeight", size),
  );
  const glyphs = Array.from({ length: 12 }, (_, i) => emptyGlyph(`字 ${i}`));
  let store!: ProjectStore;
  function Probe() {
    store = useProjectApi();
    return h(GlyphSidebar, { openGlyphContextMenu() {}, importGlyph() {} });
  }
  await act(async () =>
    root.render(
      h(ProjectProvider, {
        initialProject: { version: 1, glyphs, activeId: glyphs[0].id, brush },
        children: h(Probe),
      }),
    ),
  );
  const list = container.querySelector<HTMLElement>(".glyph-list")!;
  const imported = emptyGlyph("导入字符");
  imported.nodes = {
    a: { id: "a", x: 100, y: 100, width: 40, mode: "corner" },
    b: { id: "b", x: 200, y: 200, width: 40, mode: "corner" },
  };
  imported.strokes = [newStroke(["a", "b"], 0)];
  for (const glyph of [undefined, imported]) {
    list.scrollTop = 0;
    await act(async () => store.getState().actions.addGlyph(glyph));
    assert.ok(list.scrollTop > 800);
    const selected = container.querySelector(".glyph-card.selected")!;
    assert.equal(selected, list.lastElementChild);
    const rect = selected.getBoundingClientRect();
    assert.ok(rect.top >= 0 && rect.bottom <= 200);
  }
});
