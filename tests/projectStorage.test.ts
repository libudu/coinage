import { test } from "node:test";
import assert from "node:assert/strict";
import { ProjectStorage } from "../src/features/project/projectStorage";
import { demoProject } from "../src/core/demo";
import { applyProjectPatch } from "../src/core/projectPatch";
import type { ProjectPatch } from "../src/core/projectPatch";
import { isProject } from "../src/core/validation";

test("the default fetch implementation is invoked without a storage instance receiver", async (t) => {
  t.mock.method(globalThis, "fetch", function (this: unknown) {
    assert.equal(this, undefined);
    return Promise.resolve(Response.json({ project: demoProject(), revision: "disk" }));
  });
  assert.equal((await new ProjectStorage().load()).version, 1);
});

test("missing files initialize a new project without reading or writing browser manuscripts", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: () => { assert.fail("不应从浏览器读取手稿"); },
    setItem: () => { throw new Error("手稿不能再写入浏览器存储"); },
  } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });
  let saved: unknown;
  const empty = new ProjectStorage(async (_, options) => {
    if (options?.method === "GET") return Response.json({ project: null, revision: null });
    saved = JSON.parse(options?.body as string).project;
    assert.equal(options?.method, "PUT");
    return Response.json({ revision: "created" });
  });
  const project = await empty.load();
  assert.ok(isProject(project));
  assert.ok(!Object.hasOwn(project, "name"));
  await empty.save(project);
  assert.deepEqual(saved, project);
  const disk = demoProject(); disk.glyphs[0].name = "文件优先";
  const existing = new ProjectStorage(async () => Response.json({ project: disk, revision: "disk" }));
  assert.deepEqual(await existing.load(), disk);
});

test("failed server startup load rejects instead of silently loading demo data", async () => {
  const storage = new ProjectStorage(async () => { throw new Error("服务不可用"); });
  await assert.rejects(storage.load(), /连接本地服务失败/);
});

test("autosave serializes requests using the latest acknowledged revision", async () => {
  const calls: { changes: ProjectPatch; revision: string | null }[] = [];
  const disk = demoProject();
  const storage = new ProjectStorage(async (_, options) => {
    if (options?.method === "GET") return Response.json({ project: disk, revision: "r0" });
    assert.equal(options?.method, "PATCH");
    calls.push(JSON.parse(options?.body as string));
    await new Promise((resolve) => setTimeout(resolve, 10));
    return Response.json({ revision: `r${calls.length}` });
  });
  const project = await storage.load();
  const first = structuredClone(project), last = structuredClone(project);
  first.glyphs[0].name = "first"; last.glyphs[0].name = "last";
  await Promise.all([storage.save(first), storage.save(last), storage.save(project)]);
  assert.deepEqual(calls.map((c) => [c.changes[0].op === "set" && c.changes[0].value, c.revision]),
    [["first", "r0"], ["last", "r1"], [project.glyphs[0].name, "r2"]]);
  let restored = disk;
  for (const call of calls) restored = applyProjectPatch(restored, call.changes);
  assert.deepEqual(restored, project);
});

test("save retries after a network error, but a conflict blocks subsequent overwrites", async () => {
  let requests = 0;
  const storage = new ProjectStorage(async () => {
    requests++;
    if (requests === 1) throw new Error("断线");
    return Response.json({ error: "其他页面已修改" }, { status: 409 });
  });
  await assert.rejects(storage.save(demoProject()), /连接本地服务失败/);
  await assert.rejects(storage.save(demoProject()), /其他页面/);
  await assert.rejects(storage.save(demoProject()), /其他页面/);
  assert.equal(requests, 2);
});

test("unchanged loaded projects send no request and node edits omit unchanged original images", async () => {
  const disk = demoProject();
  disk.glyphs[0].reference = `data:image/png;base64,${"A".repeat(200000)}`;
  const writes: { method?: string; body: string }[] = [];
  const storage = new ProjectStorage(async (_, options) => {
    if (options?.method === "GET") return Response.json({ project: disk, revision: "r0" });
    writes.push({ method: options?.method, body: options?.body as string });
    return Response.json({ revision: "r1" });
  });
  const project = await storage.load();
  await storage.save(structuredClone(project));
  assert.equal(writes.length, 0);
  const next = structuredClone(project);
  Object.values(next.glyphs[0].nodes)[0].x += 1;
  await storage.save(next);
  assert.equal(writes[0].method, "PATCH");
  assert.ok(writes[0].body.length < 400);
  assert.ok(!writes[0].body.includes("data:image"));
  assert.deepEqual(applyProjectPatch(disk, JSON.parse(writes[0].body).changes), next);
  await storage.save(structuredClone(next));
  assert.equal(writes.length, 1);
});

test("a lost patch response retries the exact request before saving a newer snapshot or undo", async () => {
  const original = demoProject();
  let disk = structuredClone(original);
  const requests: { changes: ProjectPatch; revision: string; requestId: string }[] = [];
  const storage = new ProjectStorage(async (_, options) => {
    if (options?.method === "GET") return Response.json({ project: disk, revision: "r0" });
    const payload = JSON.parse(options?.body as string);
    requests.push(payload);
    if (requests.length === 1) {
      disk = applyProjectPatch(disk, payload.changes);
      throw new Error("响应丢失");
    }
    if (requests.length === 2) {
      assert.deepEqual(payload, requests[0]);
      return Response.json({ revision: "r1" });
    }
    assert.equal(payload.revision, "r1");
    disk = applyProjectPatch(disk, payload.changes);
    return Response.json({ revision: "r2" });
  });
  const project = await storage.load(), edit = structuredClone(project);
  edit.glyphs[0].name = "响应丢失的修改";
  await assert.rejects(storage.save(edit), /连接本地服务失败/);
  await storage.save(project);
  assert.equal(requests.length, 3);
  assert.notEqual(requests[2].requestId, requests[0].requestId);
  assert.deepEqual(disk, original);
});

test("invalid success responses retain the pending patch and definitive rejection allows a corrected edit", async () => {
  const original = demoProject(), payloads: unknown[] = [];
  let attempts = 0;
  const storage = new ProjectStorage(async (_, options) => {
    if (options?.method === "GET") return Response.json({ project: original, revision: "r0" });
    payloads.push(JSON.parse(options?.body as string));
    if (++attempts === 1) return Response.json({});
    if (attempts === 2) return Response.json({ error: "内容无效" }, { status: 400 });
    return Response.json({ revision: "r1" });
  });
  const project = await storage.load(), edit = structuredClone(project);
  edit.glyphs[0].name = "第一次修改";
  await assert.rejects(storage.save(edit), /响应不正确/);
  await assert.rejects(storage.save(project), /内容无效/);
  assert.deepEqual(payloads[0], payloads[1]);
  const corrected = structuredClone(project);
  corrected.glyphs[0].color = "#123456";
  await storage.save(corrected);
  assert.deepEqual(applyProjectPatch(original, (payloads[2] as { changes: ProjectPatch }).changes), corrected);
});
