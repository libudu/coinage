import { test } from "node:test";
import assert from "node:assert/strict";
import { createProjectStore } from "../src/features/project/projectStore";
import { startProjectAutosave } from "../src/features/project/projectAutosave";
import { ProjectStorage } from "../src/features/project/projectStorage";
import { demoProject } from "../src/core/demo";
import type { Project } from "../src/core/model";

const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

test("startup saves the initial project; session-only actions never trigger persistence", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const store = createProjectStore(demoProject()), calls: Project[] = [];
  const autosave = startProjectAutosave(store, { save: async (p) => { calls.push(p); } });
  t.after(() => autosave.dispose());
  assert.equal(autosave.hasUnsavedChanges(), true);
  t.mock.timers.tick(3000);
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(store.getState().saved, "saved");
  assert.equal(autosave.hasUnsavedChanges(), false);
  const { selectNodes, setTool, setShowReference } = store.getState().actions;
  selectNodes([]);
  setTool("pen");
  setShowReference(true);
  t.mock.timers.tick(10000);
  await settle();
  assert.equal(calls.length, 1);
});

test("gesture previews do not save; commit schedules one snapshot after three seconds and undo/redo save", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const store = createProjectStore(demoProject()), calls: Project[] = [];
  const autosave = startProjectAutosave(store, { save: async (p) => { calls.push(p); } });
  t.after(() => autosave.dispose());
  await autosave.flush();
  const { beginTransaction, update, commitTransaction, undo, redo } = store.getState().actions;
  const id = beginTransaction();
  for (let i = 0; i < 10; i++) {
    update((_, p) => { p.glyphs[0].name = `预览 ${i}`; }, id);
    t.mock.timers.tick(1000);
    await settle();
  }
  assert.equal(calls.length, 1);
  assert.equal(autosave.hasUnsavedChanges(), true);
  commitTransaction(id);
  t.mock.timers.tick(2999);
  await settle();
  assert.equal(calls.length, 1);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].glyphs[0].name, "预览 9");
  undo();
  await autosave.flush();
  assert.equal(calls[2].glyphs[0].name, calls[0].glyphs[0].name);
  redo();
  await autosave.flush();
  assert.equal(calls[3].glyphs[0].name, "预览 9");
});

test("cancelled previews become clean without another save, including a round-trip gesture", async (t) => {
  const store = createProjectStore(demoProject()), calls: Project[] = [];
  const autosave = startProjectAutosave(store, { save: async (p) => { calls.push(p); } });
  t.after(() => autosave.dispose());
  await autosave.flush();
  const { beginTransaction, update, cancelTransaction, commitTransaction } = store.getState().actions;
  const original = store.getState().project.glyphs[0].name, first = beginTransaction();
  update((_, p) => { p.glyphs[0].name = "临时修改"; }, first);
  cancelTransaction(first);
  assert.equal(autosave.hasUnsavedChanges(), false);
  assert.equal(store.getState().saved, "saved");
  const second = beginTransaction();
  update((_, p) => { p.glyphs[0].name = "临时修改"; }, second);
  update((_, p) => { p.glyphs[0].name = original; }, second);
  commitTransaction(second);
  await autosave.flush();
  assert.equal(calls.length, 1);
});

test("rapid committed edits coalesce and visibility flush commits a pending gesture", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const store = createProjectStore(demoProject()), calls: Project[] = [];
  const autosave = startProjectAutosave(store, { save: async (p) => { calls.push(p); } });
  t.after(() => autosave.dispose());
  const { update, beginTransaction } = store.getState().actions;
  for (const name of ["一", "二", "三"]) {
    update((_, p) => { p.glyphs[0].name = name; });
    t.mock.timers.tick(100);
  }
  t.mock.timers.tick(2700);
  await settle();
  assert.deepEqual(calls.map((p) => p.glyphs[0].name), ["三"]);
  const id = beginTransaction();
  update((_, p) => { p.glyphs[0].name = "失焦前的修改"; }, id);
  await autosave.flush();
  assert.equal(store.getState().transaction, null);
  assert.equal(calls.at(-1)?.glyphs[0].name, "失焦前的修改");
  assert.equal(autosave.hasUnsavedChanges(), false);
});

test("continuous commits save the latest snapshot every three seconds without postponing the window", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const store = createProjectStore(demoProject()), calls: string[] = [];
  const autosave = startProjectAutosave(store, { save: async (p) => { calls.push(p.glyphs[0].name); } });
  t.after(() => autosave.dispose());
  await autosave.flush();
  calls.length = 0;
  for (let i = 0; i < 6; i++) {
    store.getState().actions.update((_, p) => { p.glyphs[0].name = `修改 ${i}`; });
    t.mock.timers.tick(1000);
    await settle();
    assert.equal(calls.length, Math.floor((i + 1) / 3));
  }
  assert.deepEqual(calls, ["修改 2", "修改 5"]);
  t.mock.timers.tick(6000);
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(autosave.hasUnsavedChanges(), false);
});

test("new commits during an automatic request keep their three-second window instead of draining immediately", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const store = createProjectStore(demoProject()), calls: string[] = [];
  let release!: () => void;
  const autosave = startProjectAutosave(store, { save: async (p) => {
    calls.push(p.glyphs[0].name);
    if (calls.length === 2) await new Promise<void>((done) => { release = done; });
  } });
  t.after(() => autosave.dispose());
  await autosave.flush();
  store.getState().actions.update((_, p) => { p.glyphs[0].name = "保存中的版本"; });
  t.mock.timers.tick(3000);
  await settle();
  store.getState().actions.update((_, p) => { p.glyphs[0].name = "请求期间的新版本"; });
  t.mock.timers.tick(1000);
  release();
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(store.getState().saved, "saving");
  t.mock.timers.tick(1999);
  await settle();
  assert.equal(calls.length, 2);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(calls.length, 3);
  assert.equal(calls[2], "请求期间的新版本");
  assert.equal(store.getState().saved, "saved");
});

test("an expired window waits for a slow request then saves the latest commit without overlap", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const store = createProjectStore(demoProject()), calls: string[] = [];
  let release!: () => void;
  const autosave = startProjectAutosave(store, { save: async (p) => {
    calls.push(p.glyphs[0].name);
    if (calls.length === 2) await new Promise<void>((done) => { release = done; });
  } });
  t.after(() => autosave.dispose());
  await autosave.flush();
  store.getState().actions.update((_, p) => { p.glyphs[0].name = "慢请求"; });
  t.mock.timers.tick(3000);
  store.getState().actions.update((_, p) => { p.glyphs[0].name = "等待中的修改"; });
  t.mock.timers.tick(3000);
  await settle();
  assert.equal(calls.length, 2);
  store.getState().actions.update((_, p) => { p.glyphs[0].name = "最新修改"; });
  t.mock.timers.tick(1000);
  release();
  await settle();
  assert.equal(calls.length, 3);
  assert.equal(calls[2], "最新修改");
  store.getState().actions.update((_, p) => { p.glyphs[0].name = "下一轮"; });
  t.mock.timers.tick(2999);
  await settle();
  assert.equal(calls.length, 3);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(calls[3], "下一轮");
  assert.equal(store.getState().saved, "saved");
});

test("old save acknowledgements cannot mark a newer document or a live preview as saved", async (t) => {
  const store = createProjectStore(demoProject());
  const resolve: (() => void)[] = [];
  const autosave = startProjectAutosave(store, { save: () => new Promise<void>((done) => resolve.push(done)) });
  t.after(() => autosave.dispose());
  const first = autosave.flush();
  store.getState().actions.update((_, p) => { p.glyphs[0].name = "新修改"; });
  resolve[0]();
  await settle();
  assert.equal(store.getState().saved, "saving");
  assert.equal(autosave.hasUnsavedChanges(), true);
  const second = autosave.flush();
  const id = store.getState().actions.beginTransaction();
  store.getState().actions.update((_, p) => { p.glyphs[0].name = "仍在拖动"; }, id);
  resolve[1]();
  await Promise.all([first, second]);
  assert.equal(store.getState().saved, "saving");
  store.getState().actions.cancelTransaction(id);
  assert.equal(store.getState().saved, "saved");
});

test("network errors stay visible and retry the latest committed snapshot", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const store = createProjectStore(demoProject());
  let attempts = 0;
  const autosave = startProjectAutosave(store, { save: async () => {
    if (++attempts === 1) throw new Error("连接失败");
  } });
  t.after(() => autosave.dispose());
  await autosave.flush();
  assert.equal(store.getState().saved, "error");
  assert.equal(store.getState().saveError, "连接失败");
  assert.equal(autosave.hasUnsavedChanges(), true);
  t.mock.timers.tick(5000);
  await settle();
  assert.equal(attempts, 2);
  assert.equal(store.getState().saved, "saved");
  assert.equal(store.getState().saveError, "");
});

test("the coordinator preserves API revisions and stops overwrites after a conflict", async (t) => {
  const payloads: { revision: string }[] = [];
  const storage = new ProjectStorage(async (_, options) => {
    if (options?.method === "GET") return Response.json({ project: demoProject(), revision: "r0" });
    payloads.push(JSON.parse(options?.body as string));
    if (payloads.length === 1) return Response.json({ revision: "r1" });
    return Response.json({ error: "手稿已在其他页面修改" }, { status: 409 });
  });
  const store = createProjectStore(await storage.load());
  const autosave = startProjectAutosave(store, storage);
  t.after(() => autosave.dispose());
  await autosave.flush();
  assert.equal(payloads.length, 0);
  store.getState().actions.update((g) => { g.name = "第一次修改"; });
  await autosave.flush();
  store.getState().actions.update((_, p) => { p.glyphs[0].name = "保留未保存内容"; });
  await autosave.flush();
  assert.deepEqual(payloads.map((p) => p.revision), ["r0", "r1"]);
  assert.equal(store.getState().saved, "error");
  assert.match(store.getState().saveError, /其他页面/);
  await autosave.flush();
  assert.equal(payloads.length, 2);
  assert.equal(store.getState().project.glyphs[0].name, "保留未保存内容");
});

test("duplicate flushes do not enqueue the same snapshot and disposal cancels scheduled work", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const store = createProjectStore(demoProject());
  let requests = 0, resolve!: () => void;
  const autosave = startProjectAutosave(store, { save: () => {
    requests++;
    return new Promise<void>((done) => { resolve = done; });
  } });
  const pending = autosave.flush();
  const duplicate = autosave.flush();
  await settle();
  assert.equal(requests, 1);
  store.getState().actions.update((_, p) => { p.glyphs[0].name = "不再保存"; });
  autosave.dispose();
  const state = store.getState();
  resolve();
  await Promise.all([pending, duplicate]);
  t.mock.timers.tick(10000);
  assert.equal(requests, 1);
  assert.equal(store.getState(), state);
});

test("undo to a previously saved object is written again after an older in-flight edit", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const store = createProjectStore(demoProject()), calls: Project[] = [];
  let release!: () => void;
  const autosave = startProjectAutosave(store, { save: async (p) => {
    calls.push(p);
    if (calls.length === 2) await new Promise<void>((done) => { release = done; });
  } });
  t.after(() => autosave.dispose());
  await autosave.flush();
  const before = store.getState().project;
  store.getState().actions.update((_, p) => { p.glyphs[0].name = "正在写入"; });
  const pending = autosave.flush();
  store.getState().actions.undo();
  t.mock.timers.tick(250);
  await settle();
  assert.equal(calls.length, 2);
  release();
  await pending;
  assert.equal(calls.length, 3);
  assert.equal(calls[2], before);
  assert.equal(autosave.hasUnsavedChanges(), false);
  assert.equal(store.getState().saved, "saved");
});

test("edits made while a save runs drain only the latest commit, with no parallel requests", async (t) => {
  const store = createProjectStore(demoProject()), calls: string[] = [];
  let release!: () => void;
  const autosave = startProjectAutosave(store, { save: async (p) => {
    calls.push(p.glyphs[0].name);
    if (calls.length === 1) await new Promise<void>((done) => { release = done; });
  } });
  t.after(() => autosave.dispose());
  const pending = autosave.flush();
  for (const name of ["中间版本", "最新版本"]) store.getState().actions.update((_, p) => { p.glyphs[0].name = name; });
  const flush = autosave.flush();
  assert.equal(calls.length, 1);
  release();
  await Promise.all([pending, flush]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1], "最新版本");
  assert.equal(autosave.hasUnsavedChanges(), false);
});

test("duplicate flushes share a failed attempt and respect the retry delay", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const store = createProjectStore(demoProject());
  let attempts = 0, reject!: (error: Error) => void;
  const autosave = startProjectAutosave(store, { save: () => {
    attempts++;
    return new Promise<void>((_, fail) => { reject = fail; });
  } });
  t.after(() => autosave.dispose());
  const first = autosave.flush(), second = autosave.flush(), third = autosave.flush();
  reject(new Error("服务断开"));
  await settle();
  assert.equal(attempts, 1);
  await Promise.all([first, second, third]);
  t.mock.timers.tick(4999);
  await settle();
  assert.equal(attempts, 1);
  t.mock.timers.tick(1);
  assert.equal(attempts, 2);
  reject(new Error("仍未连接"));
  await settle();
});

test("failed persistence remains visible during preview, cancellation and navigation", async (t) => {
  const store = createProjectStore(demoProject());
  const autosave = startProjectAutosave(store, { save: async () => { throw new Error("保存不可用"); } });
  t.after(() => autosave.dispose());
  await autosave.flush();
  const actions = store.getState().actions, id = actions.beginTransaction();
  actions.update((_, p) => { p.glyphs[0].name = "预览"; }, id);
  assert.equal(store.getState().saved, "error");
  actions.cancelTransaction(id);
  assert.equal(store.getState().saved, "error");
  actions.switchGlyph(store.getState().project.glyphs[1].id);
  assert.equal(store.getState().saved, "error");
  assert.equal(store.getState().saveError, "保存不可用");
});

test("undo after a conflicting or ambiguous write never claims the old snapshot is saved", async (t) => {
  const store = createProjectStore(demoProject());
  let attempts = 0;
  const autosave = startProjectAutosave(store, { save: async () => {
    if (++attempts > 1) throw new Error("手稿已在其他页面修改");
  } });
  t.after(() => autosave.dispose());
  await autosave.flush();
  const before = store.getState().project;
  store.getState().actions.update((_, p) => { p.glyphs[0].name = "失败的修改"; });
  await autosave.flush();
  store.getState().actions.undo();
  assert.equal(store.getState().project, before);
  assert.equal(autosave.hasUnsavedChanges(), true);
  assert.equal(store.getState().saved, "error");
  await autosave.flush();
  assert.equal(attempts, 3);
  assert.equal(store.getState().saved, "error");
});

test("a disposed coordinator cannot commit a later control's live gesture", async () => {
  const store = createProjectStore(demoProject());
  const autosave = startProjectAutosave(store, { save: async () => {} });
  autosave.dispose();
  const id = store.getState().actions.beginTransaction();
  store.getState().actions.update((_, p) => { p.glyphs[0].name = "未提交"; }, id);
  const before = store.getState();
  await autosave.flush();
  assert.equal(store.getState(), before);
});

test("commits during a failure keep the backoff and retry only the newest document", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const store = createProjectStore(demoProject()), calls: string[] = [];
  const autosave = startProjectAutosave(store, { save: async (p) => {
    calls.push(p.glyphs[0].name);
    if (calls.length === 1) throw new Error("暂时断线");
  } });
  t.after(() => autosave.dispose());
  await autosave.flush();
  for (const name of ["修改一", "修改二", "最新修改"]) {
    store.getState().actions.update((_, p) => { p.glyphs[0].name = name; });
    t.mock.timers.tick(500);
    await settle();
    assert.equal(store.getState().saved, "error");
  }
  assert.equal(calls.length, 1);
  t.mock.timers.tick(3500);
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(calls[1], "最新修改");
  assert.equal(store.getState().saved, "saved");
});

test("flushing an already saved document never briefly dirties it or warns on exit", async (t) => {
  const store = createProjectStore(demoProject());
  const autosave = startProjectAutosave(store, { save: async () => {} });
  t.after(() => autosave.dispose());
  await autosave.flush();
  const before = store.getState();
  const flush = autosave.flush();
  assert.equal(autosave.hasUnsavedChanges(), false);
  assert.equal(store.getState(), before);
  await flush;
});

test("a flush in the failure completion microtask cannot cancel the scheduled retry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const store = createProjectStore(demoProject());
  let attempts = 0, reject!: (error: Error) => void;
  const autosave = startProjectAutosave(store, { save: () => {
    attempts++;
    return new Promise<void>((_, fail) => { reject = fail; });
  } });
  t.after(() => autosave.dispose());
  const first = autosave.flush();
  reject(new Error("连接失败"));
  queueMicrotask(() => { void autosave.flush(); });
  await first;
  t.mock.timers.tick(5000);
  assert.equal(attempts, 2);
  reject(new Error("再次失败"));
  await settle();
});
