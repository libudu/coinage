import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { createApp } from "../src/server/app";
import { demoProject } from "../src/core/demo";

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "coinage-test-"));
  const dataDir = join(root, "data"), clientDir = join(root, "client");
  await mkdir(clientDir);
  await writeFile(join(clientDir, "index.html"), "<h1>Coinage</h1>");
  const server = createServer(createApp({ dataDir, clientDir }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  const get = () => fetch(`${url}/api/project`);
  const put = (project: unknown, revision: string | null) => fetch(`${url}/api/project`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project, revision }),
  });
  return { root, dataDir, url, get, put };
}

test("local store initializes, persists valid projects and keeps the previous save as a backup", async (t) => {
  const { dataDir, get, put } = await fixture(t);
  assert.deepEqual(await (await get()).json(), { project: null, revision: null });
  const project = demoProject();
  const first = await put(project, null);
  assert.equal(first.status, 200);
  const { revision } = await first.json();
  project.name = "本地手稿";
  assert.equal((await put(project, revision)).status, 200);
  const stored = await (await get()).json();
  assert.equal(stored.project.name, "本地手稿");
  assert.notEqual(stored.revision, revision);
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, "project.json"), "utf8")), project);
  assert.notEqual(JSON.parse(await readFile(join(dataDir, "project.backup.json"), "utf8")).name, project.name);
  const backup = await readFile(join(dataDir, "project.backup.json"), "utf8");
  // 模拟服务已落盘、响应丢失时携带旧版本重试，以及刷新后的无修改保存。
  assert.equal((await put(project, revision)).status, 200);
  assert.equal((await put(project, stored.revision)).status, 200);
  assert.equal(await readFile(join(dataDir, "project.backup.json"), "utf8"), backup);
});

test("concurrent stale saves cannot overwrite the winning manuscript", async (t) => {
  const { get, put } = await fixture(t);
  const a = demoProject(), b = structuredClone(a);
  a.name = "页面 A"; b.name = "页面 B";
  const results = await Promise.all([put(a, null), put(b, null)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const winner = results[0].status === 200 ? a : b;
  assert.deepEqual((await (await get()).json()).project, winner);
});

test("invalid input and corrupt files never replace existing disk data", async (t) => {
  const { dataDir, get, put } = await fixture(t);
  assert.equal((await put({ version: 9 }, null)).status, 400);
  await mkdir(dataDir);
  await writeFile(join(dataDir, "project.json"), "broken");
  assert.equal((await get()).status, 500);
  assert.equal((await put(demoProject(), null)).status, 500);
  assert.equal(await readFile(join(dataDir, "project.json"), "utf8"), "broken");
});

test("server serves bundled assets but rejects cross-site API access and private paths", async (t) => {
  const { url, put } = await fixture(t);
  assert.equal(await (await fetch(url)).text(), "<h1>Coinage</h1>");
  await put(demoProject(), null);
  assert.equal((await fetch(`${url}/data/project.json`)).status, 404);
  assert.equal((await fetch(`${url}/%2e%2e%5cdata/project.json`)).status, 403);
  assert.equal((await fetch(`${url}/api/project`, { headers: { Origin: "https://example.com" } })).status, 403);
  const status = await new Promise((resolve, reject) => {
    const req = request(`${url}/api/project`, { headers: { Host: "evil.example" } }, (res) => {
      res.resume(); resolve(res.statusCode);
    });
    req.on("error", reject); req.end();
  });
  assert.equal(status, 403);
});

test("oversized requests receive an actionable error without touching disk", async (t) => {
  const { url, get } = await fixture(t);
  const result = await new Promise<{ status?: number; text: string }>((resolve, reject) => {
    const req = request(`${url}/api/project`, {
      method: "PUT", headers: { "Content-Type": "application/json", "Content-Length": 64 * 1024 * 1024 + 1 },
    }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, text }));
    });
    req.on("error", reject); req.end("{}");
  });
  assert.equal(result.status, 413);
  assert.match(JSON.parse(result.text).error, /64 MB/);
  assert.equal((await (await get()).json()).project, null);
});
