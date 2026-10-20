import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { createApp } from "../src/server/app";
import { demoProject } from "../src/core/demo";
import { createProjectPatch } from "../src/core/projectPatch";
import { ProjectStorage } from "../src/features/project/projectStorage";
import { defaultImportSettings } from "../src/core/importSettings";

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "coinage-test-"));
  const dataDir = join(root, "data"),
    clientDir = join(root, "client");
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
  const put = (project: unknown, revision: string | null) =>
    fetch(`${url}/api/project`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project, revision }),
    });
  const patch = (
    changes: unknown,
    revision: string | null,
    requestId = crypto.randomUUID(),
  ) =>
    fetch(`${url}/api/project`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes, revision, requestId }),
    });
  return { root, dataDir, url, get, put, patch };
}

test("local store initializes, persists valid projects and keeps the previous save as a backup", async (t) => {
  const { dataDir, get, put } = await fixture(t);
  assert.deepEqual(await (await get()).json(), {
    project: null,
    revision: null,
  });
  const project = demoProject();
  const first = await put(project, null);
  assert.equal(first.status, 200);
  const { revision } = await first.json();
  project.glyphs[0].name = "本地手稿";
  assert.equal((await put(project, revision)).status, 200);
  const stored = await (await get()).json();
  assert.equal(stored.project.glyphs[0].name, "本地手稿");
  assert.notEqual(stored.revision, revision);
  assert.deepEqual(
    JSON.parse(await readFile(join(dataDir, "project.json"), "utf8")),
    project,
  );
  assert.notEqual(
    JSON.parse(await readFile(join(dataDir, "project.backup.json"), "utf8"))
      .glyphs[0].name,
    project.glyphs[0].name,
  );
  const backup = await readFile(join(dataDir, "project.backup.json"), "utf8");
  // 模拟服务已落盘、响应丢失时携带旧版本重试，以及刷新后的无修改保存。
  assert.equal((await put(project, revision)).status, 200);
  assert.equal((await put(project, stored.revision)).status, 200);
  assert.equal(
    await readFile(join(dataDir, "project.backup.json"), "utf8"),
    backup,
  );
});

test("import settings persist independently, survive server restart and reject invalid or cross-site writes", async (t) => {
  const { dataDir, url, get, put } = await fixture(t);
  const settingsUrl = `${url}/api/import-settings`;
  assert.deepEqual(
    await (await fetch(settingsUrl)).json(),
    defaultImportSettings,
  );
  const settings = {
    ...defaultImportSettings,
    width: 73,
    crop: 10,
    offsetX: -40,
    offsetY: 35,
  };
  const save = (value: unknown, headers = {}) =>
    fetch(settingsUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(value),
    });
  assert.equal((await save(settings)).status, 200);
  assert.deepEqual(await (await fetch(settingsUrl)).json(), settings);
  assert.deepEqual(
    JSON.parse(await readFile(join(dataDir, "import-settings.json"), "utf8")),
    settings,
  );
  assert.equal((await (await get()).json()).project, null);
  await put(demoProject(), null);
  const manuscript = await readFile(join(dataDir, "project.json"), "utf8");
  for (const invalid of [
    { ...settings, crop: 46 },
    { ...settings, offsetX: 101 },
    { ...settings, offsetY: -101 },
    { ...settings, width: "40" },
    { ...settings, extra: true },
    {},
  ])
    assert.equal((await save(invalid)).status, 400);
  assert.equal(
    (await save(settings, { Origin: "https://example.com" })).status,
    403,
  );
  assert.deepEqual(await (await fetch(settingsUrl)).json(), settings);
  assert.equal(
    await readFile(join(dataDir, "project.json"), "utf8"),
    manuscript,
  );
  const restarted = createServer(createApp({ dataDir }));
  await new Promise<void>((resolve) =>
    restarted.listen(0, "127.0.0.1", resolve),
  );
  try {
    const port = (restarted.address() as { port: number }).port;
    assert.deepEqual(
      await (
        await fetch(`http://127.0.0.1:${port}/api/import-settings`)
      ).json(),
      settings,
    );
  } finally {
    restarted.closeAllConnections();
    await new Promise<void>((resolve) => restarted.close(() => resolve()));
  }
});

test("concurrent stale saves cannot overwrite the winning manuscript", async (t) => {
  const { get, put } = await fixture(t);
  const a = demoProject(),
    b = structuredClone(a);
  a.glyphs[0].name = "页面 A";
  b.glyphs[0].name = "页面 B";
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
  assert.equal(
    (
      await fetch(`${url}/api/project`, {
        headers: { Origin: "https://example.com" },
      })
    ).status,
    403,
  );
  const status = await new Promise((resolve, reject) => {
    const req = request(
      `${url}/api/project`,
      { headers: { Host: "evil.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(status, 403);
});

test("oversized requests receive an actionable error without touching disk", async (t) => {
  const { url, get } = await fixture(t);
  const result = await new Promise<{ status?: number; text: string }>(
    (resolve, reject) => {
      const req = request(
        `${url}/api/project`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": 64 * 1024 * 1024 + 1,
          },
        },
        (res) => {
          let text = "";
          res.on("data", (chunk) => {
            text += chunk;
          });
          res.on("end", () => resolve({ status: res.statusCode, text }));
        },
      );
      req.on("error", reject);
      req.end("{}");
    },
  );
  assert.equal(result.status, 413);
  assert.match(JSON.parse(result.text).error, /64 MB/);
  assert.equal((await (await get()).json()).project, null);
});

test("PATCH merges only changed fields, preserves originals and backs up the previous full document", async (t) => {
  const { dataDir, get, put, patch } = await fixture(t);
  const original = demoProject();
  original.glyphs[0].reference = `data:image/png;base64,${"A".repeat(100000)}`;
  assert.equal((await patch([], null)).status, 409);
  const { revision } = await (await put(original, null)).json();
  const next = structuredClone(original);
  Object.values(next.glyphs[0].nodes)[0].x += 1;
  next.glyphs[0].referenceOpacity = 55;
  const changes = createProjectPatch(original, next);
  assert.ok(!JSON.stringify(changes).includes("data:image"));
  const response = await patch(changes, revision);
  assert.equal(response.status, 200);
  assert.notEqual((await response.json()).revision, revision);
  assert.deepEqual((await (await get()).json()).project, next);
  assert.deepEqual(
    JSON.parse(await readFile(join(dataDir, "project.backup.json"), "utf8")),
    original,
  );
});

test("concurrent PATCH requests retain revision conflicts and retries never rotate the backup", async (t) => {
  const { dataDir, get, put, patch } = await fixture(t);
  const original = demoProject();
  const { revision } = await (await put(original, null)).json();
  const a = structuredClone(original),
    b = structuredClone(original);
  a.glyphs[0].color = "#123456";
  b.glyphs[0].color = "#654321";
  const changes = [
    createProjectPatch(original, a),
    createProjectPatch(original, b),
  ];
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  const results = await Promise.all(
    changes.map((change, i) => patch(change, revision, ids[i])),
  );
  assert.deepEqual(
    results.map((response) => response.status).sort(),
    [200, 409],
  );
  const winner = results[0].status === 200 ? 0 : 1;
  const backup = await readFile(join(dataDir, "project.backup.json"), "utf8");
  assert.equal(
    (await patch(changes[winner], revision, ids[winner])).status,
    200,
  );
  assert.equal(
    await readFile(join(dataDir, "project.backup.json"), "utf8"),
    backup,
  );
  assert.equal((await patch(changes[winner], revision)).status, 409);
  assert.equal(
    (await patch(changes[1 - winner], revision, ids[winner])).status,
    409,
  );
  assert.deepEqual((await (await get()).json()).project, winner === 0 ? a : b);
});

test("invalid patches and inherited node references never change the file or backup", async (t) => {
  const { dataDir, get, put, patch } = await fixture(t);
  const original = demoProject();
  const { revision } = await (await put(original, null)).json();
  const next = structuredClone(original);
  next.glyphs[0].color = "#123456";
  const { revision: current } = await (
    await patch(createProjectPatch(original, next), revision)
  ).json();
  const file = await readFile(join(dataDir, "project.json"), "utf8");
  const backup = await readFile(join(dataDir, "project.backup.json"), "utf8");
  const glyph = next.glyphs[0];
  const invalid = [
    null,
    [{ op: "set", path: [], value: original }],
    [{ op: "set", path: ["__proto__", "polluted"], value: true }],
    [
      {
        op: "set",
        path: ["glyphs", glyph.id, "nodes", "missing", "x"],
        value: 1,
      },
    ],
    [
      {
        op: "set",
        path: ["glyphs", glyph.id, "strokes", glyph.strokes[0].id, "nodes"],
        value: ["constructor", "toString"],
      },
    ],
    [
      {
        op: "remove",
        path: ["glyphs", glyph.id, "nodes", glyph.strokes[0].nodes[0]],
      },
    ],
  ];
  for (const changes of invalid)
    assert.equal((await patch(changes, current)).status, 400);
  assert.equal(await readFile(join(dataDir, "project.json"), "utf8"), file);
  assert.equal(
    await readFile(join(dataDir, "project.backup.json"), "utf8"),
    backup,
  );
  assert.deepEqual((await (await get()).json()).project, next);
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});

test("real storage retries a lost PATCH response before sending later edits without original images", async (t) => {
  const { url, get, put } = await fixture(t);
  const original = demoProject();
  original.glyphs[0].reference = "data:image/png;base64,AAAA";
  await put(original, null);
  const bodies: string[] = [];
  const storage = new ProjectStorage(async (input, options) => {
    const response = await fetch(new URL(input as string, url), options);
    if (options?.method === "PATCH") {
      bodies.push(options.body as string);
      if (bodies.length === 1) {
        assert.equal(response.status, 200);
        await response.arrayBuffer();
        throw new Error("模拟响应丢失");
      }
    }
    return response;
  });
  const project = await storage.load(),
    edit = structuredClone(project);
  Object.values(edit.glyphs[0].nodes)[0].x += 1;
  await assert.rejects(storage.save(edit), /连接本地服务失败/);
  const latest = structuredClone(edit);
  latest.glyphs[0].color = "#123456";
  await storage.save(latest);
  assert.equal(bodies.length, 3);
  assert.equal(bodies[0], bodies[1]);
  assert.ok(bodies.every((text) => !text.includes("data:image")));
  assert.deepEqual((await (await get()).json()).project, latest);
});

test("a small patch cannot grow the merged project beyond 64 MB", async (t) => {
  const { dataDir, get, patch } = await fixture(t);
  const original = demoProject();
  original.glyphs[0].reference = "data:image/png;base64,";
  const padding = "A".repeat(
    64 * 1024 * 1024 - Buffer.byteLength(JSON.stringify(original)) - 16,
  );
  original.glyphs[0].reference += padding;
  await mkdir(dataDir);
  await writeFile(join(dataDir, "project.json"), JSON.stringify(original));
  const { revision } = await (await get()).json();
  const response = await patch(
    [
      {
        op: "set",
        path: ["glyphs", original.glyphs[0].id, "name"],
        value: "A".repeat(100),
      },
    ],
    revision,
  );
  assert.equal(response.status, 413);
  assert.equal((await (await get()).json()).revision, revision);
});
