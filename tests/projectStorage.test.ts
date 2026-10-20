import { test } from "node:test";
import assert from "node:assert/strict";
import { ProjectStorage } from "../src/features/project/projectStorage";
import { demoProject } from "../src/core/demo";

test("the default fetch implementation is invoked without a storage instance receiver", async (t) => {
  t.mock.method(globalThis, "fetch", function (this: unknown) {
    assert.equal(this, undefined);
    return Promise.resolve(Response.json({ project: demoProject(), revision: "disk" }));
  });
  assert.equal((await new ProjectStorage().load()).version, 1);
});

test("legacy browser manuscripts migrate only when disk is empty and new saves use the server", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const legacy = demoProject(); legacy.name = "旧浏览器手稿";
  const values = new Map([["coinage.studio.v1", JSON.stringify(legacy)]]);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
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
    return Response.json({ revision: "migrated" });
  });
  const migrated = await empty.load();
  assert.equal(migrated.name, legacy.name);
  await empty.save(migrated);
  assert.deepEqual(saved, migrated);
  const disk = demoProject(); disk.name = "文件优先";
  const existing = new ProjectStorage(async () => Response.json({ project: disk, revision: "disk" }));
  assert.equal((await existing.load()).name, disk.name);
  assert.equal(JSON.parse(values.get("coinage.studio.v1")!).name, legacy.name);
});

test("failed server startup load rejects instead of silently loading demo data", async () => {
  const storage = new ProjectStorage(async () => { throw new Error("服务不可用"); });
  await assert.rejects(storage.load(), /连接本地服务失败/);
});

test("autosave serializes requests using the latest acknowledged revision", async () => {
  const calls: { project: { name: string }; revision: string | null }[] = [];
  const storage = new ProjectStorage(async (_, options) => {
    if (options?.method === "GET") return Response.json({ project: demoProject(), revision: "r0" });
    calls.push(JSON.parse(options?.body as string));
    await new Promise((resolve) => setTimeout(resolve, 10));
    return Response.json({ revision: `r${calls.length}` });
  });
  const project = await storage.load();
  await Promise.all([storage.save({ ...project, name: "first" }), storage.save({ ...project, name: "last" }), storage.save(project)]);
  assert.deepEqual(calls.map((c) => [c.project.name, c.revision]), [["first", "r0"], ["last", "r1"], [project.name, "r2"]]);
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
