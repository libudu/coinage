import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import JSZip from "jszip";
import { createPackageZip } from "../scripts/createPackageZip.mjs";

test("release ZIP includes the runtime and Chinese launcher while excluding personal data and unrelated files", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "coinage-zip-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dist = join(root, "dist"), archive = join(root, "Coinage v0.0.0.zip");
  const files = {
    "client/index.html": "<title>Coinage</title>",
    "client/assets/app.js": "console.log('Coinage')",
    "server/index.mjs": "server",
    "runtime/node.exe": "node-binary",
    "runtime/LICENSE": "node-license",
    "双击运行.bat": "@echo off\r\nruntime\\node.exe server\\index.mjs\r\n",
    "使用说明.txt": "双击运行即可使用",
    "data/project.json": "private manuscript",
    "data/project.backup.json": "private backup",
    "unused/stale.html": "stale build",
    "runtime/old.log": "stale runtime file",
    "index.html": "old build",
  };
  for (const [name, content] of Object.entries(files)) {
    await mkdir(dirname(join(dist, name)), { recursive: true });
    await writeFile(join(dist, name), content);
  }
  await createPackageZip(dist, archive);
  const zip = await JSZip.loadAsync(await readFile(archive), { checkCRC32: true });
  const actual = Object.values(zip.files).filter((entry) => !entry.dir).map((entry) => entry.name).sort();
  assert.deepEqual(actual, ["client/index.html", "client/assets/app.js", "server/index.mjs", "runtime/node.exe", "runtime/LICENSE", "双击运行.bat", "使用说明.txt"].sort());
  assert.ok(zip.files["data/"].dir);
  assert.equal(await zip.file("双击运行.bat")!.async("string"), files["双击运行.bat"]);
  assert.equal(await readFile(join(dist, "data/project.json"), "utf8"), "private manuscript");
  // 再次构建替换同版本 ZIP，清除旧条目，同时保留磁盘上的用户数据。
  zip.file("obsolete.txt", "old");
  await writeFile(archive, await zip.generateAsync({ type: "nodebuffer" }));
  await createPackageZip(dist, archive);
  assert.equal((await JSZip.loadAsync(await readFile(archive))).file("obsolete.txt"), null);
  assert.equal((await readdir(root)).filter((name) => name.endsWith(".tmp")).length, 0);
});
