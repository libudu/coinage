import assert from "node:assert/strict";
import { test } from "node:test";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { BrowserProjectStorage } from "../src/features/project/browserProjectStorage";
import {
  loadBrowserImportSettings,
  saveBrowserImportSettings,
} from "../src/features/tracing/browserTraceSettings";
import { defaultImportSettings } from "../src/core/importSettings";
import { withBrowserRecord } from "../src/shared/utils/browserDatabase";

test("浏览器手稿与原图持久化，重新连接后恢复", async () => {
  const factory = new IDBFactory();
  const storage = new BrowserProjectStorage(factory);
  const project = await storage.load();
  project.glyphs[0].name = "浏览器手稿";
  // 原图可能超过 localStorage 配额，手稿存入 IndexedDB。
  project.glyphs[0].reference =
    "data:image/png;base64," + "a".repeat(6 * 1024 * 1024);
  await storage.save(project);
  assert.deepEqual(await new BrowserProjectStorage(factory).load(), project);
});

test("浏览器保存串行完成，其他页面的旧版本不能覆盖新手稿", async () => {
  const factory = new IDBFactory();
  const first = new BrowserProjectStorage(factory);
  const second = new BrowserProjectStorage(factory);
  const project = await first.load();
  await second.load();
  const updated = structuredClone(project);
  updated.glyphs[0].name = "最新";
  await Promise.all([first.save(project), first.save(updated)]);
  await assert.rejects(second.save(project), /其他页面修改/);
  assert.deepEqual(await new BrowserProjectStorage(factory).load(), updated);
});

test("无效浏览器手稿读取失败，不用示例覆盖", async () => {
  const factory = new IDBFactory();
  const invalid = { revision: "broken", project: { glyphs: [] } };
  await withBrowserRecord(
    "project",
    "readwrite",
    (_value, store) => {
      store.put(invalid, "project");
    },
    factory,
  );
  const storage = new BrowserProjectStorage(factory);
  await assert.rejects(storage.load(), /浏览器手稿格式不正确/);
  await assert.rejects(storage.save({} as never), /请先读取/);
  assert.deepEqual(
    await withBrowserRecord("project", "readonly", (value) => value, factory),
    invalid,
  );
});

test("多页面冲突后即使撤销回旧快照也不能报告保存成功", async () => {
  const factory = new IDBFactory();
  const first = new BrowserProjectStorage(factory);
  const initial = await first.load();
  await first.save(initial);
  const second = new BrowserProjectStorage(factory);
  const original = await second.load();
  const newer = structuredClone(initial);
  newer.glyphs[0].name = "其他页面修改";
  await first.save(newer);
  const edit = structuredClone(original);
  edit.glyphs[0].name = "当前页面修改";
  await assert.rejects(second.save(edit), /其他页面修改/);
  await assert.rejects(second.save(original), /其他页面修改/);
  assert.deepEqual(await second.load(), newer);
  await second.save(newer);
});

test("读取后的无变化保存不修改 revision，也不影响另一个页面继续保存", async () => {
  const factory = new IDBFactory();
  const first = new BrowserProjectStorage(factory);
  await first.save(await first.load());
  const second = new BrowserProjectStorage(factory);
  const project = await second.load();
  const before = await withBrowserRecord(
    "project",
    "readonly",
    (value) => value,
    factory,
  );
  await first.save(await first.load());
  assert.deepEqual(
    await withBrowserRecord("project", "readonly", (value) => value, factory),
    before,
  );
  project.glyphs[0].name = "继续编辑";
  await second.save(project);
  assert.deepEqual(await new BrowserProjectStorage(factory).load(), project);
});

test("浏览器写入失败保留原手稿，重试可以成功", async (t) => {
  const factory = new IDBFactory();
  const storage = new BrowserProjectStorage(factory);
  const project = await storage.load();
  await storage.save(project);
  const updated = structuredClone(project);
  updated.glyphs[0].name = "重试成功";
  const put = t.mock.method(IDBObjectStore.prototype, "put", () => {
    throw new DOMException("空间不足", "QuotaExceededError");
  });
  await assert.rejects(storage.save(updated), /空间不足/);
  put.mock.restore();
  assert.deepEqual(await new BrowserProjectStorage(factory).load(), project);
  await storage.save(updated);
  assert.deepEqual(await new BrowserProjectStorage(factory).load(), updated);
});

test("浏览器导入参数独立保存并校验，不影响手稿", async () => {
  const factory = new IDBFactory();
  assert.deepEqual(
    await loadBrowserImportSettings(factory),
    defaultImportSettings,
  );
  const settings = {
    ...defaultImportSettings,
    width: 42,
    filenamePattern: "{name}_{desc}",
  };
  await saveBrowserImportSettings(settings, factory);
  const storage = new BrowserProjectStorage(factory);
  const project = await storage.load();
  await storage.save(project);
  assert.deepEqual(await loadBrowserImportSettings(factory), settings);
  await assert.rejects(
    saveBrowserImportSettings({ ...settings, width: -1 }, factory),
    /格式不正确/,
  );
  assert.deepEqual(await loadBrowserImportSettings(factory), settings);
  await withBrowserRecord(
    "import-settings",
    "readwrite",
    (_value, store) => {
      store.put({ broken: true }, "import-settings");
    },
    factory,
  );
  await assert.rejects(loadBrowserImportSettings(factory), /配置格式不正确/);
  assert.deepEqual(await new BrowserProjectStorage(factory).load(), project);
});

test("浏览器存储不可用时明确报错", async () => {
  await assert.rejects(
    new BrowserProjectStorage().load(),
    /无法打开浏览器存储/,
  );
});
