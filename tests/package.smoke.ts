import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import JSZip from "jszip";
import { setTimeout } from "node:timers/promises";
import { demoProject } from "../src/core/demo";

test("release ZIP extracts to a standalone portable app that persists data and handles occupied ports", { timeout: 30000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "Coinage 便携验证 "));
  const children: ChildProcess[] = [];
  t.after(async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill(); await exited; }
    }
    await rm(root, { recursive: true, force: true });
  });
  const pkg = JSON.parse(await readFile(resolve("package.json"), "utf8"));
  const zip = await JSZip.loadAsync(await readFile(resolve(`Coinage v${pkg.version}.zip`)), { checkCRC32: true });
  for (const entry of Object.values(zip.files)) {
    assert.ok(!entry.name.includes("..") && !entry.name.startsWith("/"));
    const target = join(root, entry.name);
    if (entry.dir) await mkdir(target, { recursive: true });
    else { await mkdir(dirname(target), { recursive: true }); await writeFile(target, await entry.async("nodebuffer")); }
  }
  assert.deepEqual(await readdir(join(root, "data")), []);
  assert.match(await readFile(join(root, "双击运行.bat"), "utf8"), /runtime\\node\.exe/);
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const url = `http://127.0.0.1:${port}`;
  function launch() {
    const child = spawn(join(root, "runtime/node.exe"), [join(root, "server/index.mjs"), "--no-open"], {
      cwd: tmpdir(), env: { ...process.env, COINAGE_PORT: String(port) }, windowsHide: true,
    });
    children.push(child);
    let output = "";
    child.stdout!.on("data", (chunk) => { output += chunk; });
    child.stderr!.on("data", (chunk) => { output += chunk; });
    return { child, output: () => output };
  }
  async function ready() {
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(`${url}/api/health`)).ok) return; } catch {}
      await setTimeout(50);
    }
    throw new Error("便携服务未启动");
  }
  const first = launch();
  await ready();
  assert.match(await (await fetch(url)).text(), /Coinage/);
  const project = demoProject(); project.name = "便携保存验证";
  assert.equal((await fetch(`${url}/api/project`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project, revision: null }),
  })).status, 200);
  assert.equal(JSON.parse(await readFile(join(root, "data/project.json"), "utf8")).name, project.name);
  const duplicate = launch();
  assert.deepEqual(await once(duplicate.child, "exit"), [0, null]);
  assert.match(duplicate.output(), /已在运行/);
  const stopped = once(first.child, "exit"); first.child.kill(); await stopped;
  const restarted = launch();
  await ready();
  assert.deepEqual((await (await fetch(`${url}/api/project`)).json()).project, project);
  const stoppedAgain = once(restarted.child, "exit"); restarted.child.kill(); await stoppedAgain;
  const unrelated = createServer((_, res) => res.end("other app"));
  await new Promise<void>((resolve) => unrelated.listen(port, "127.0.0.1", resolve));
  try {
    const blocked = launch();
    assert.deepEqual(await once(blocked.child, "exit"), [1, null]);
    assert.match(blocked.output(), /端口被其他程序占用/);
  } finally { unrelated.closeAllConnections(); await new Promise<void>((resolve) => unrelated.close(() => resolve())); }
});
