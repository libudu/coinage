import JSZip from "jszip";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { lstat, readFile, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

export async function createPackageZip(distDir, archivePath) {
  const zip = new JSZip();
  async function add(relativePath) {
    const source = join(distDir, relativePath);
    const info = await lstat(source);
    if (info.isSymbolicLink()) throw new Error(`发布包不能包含符号链接：${source}`);
    if (info.isDirectory()) {
      zip.folder(relativePath);
      for (const name of (await readdir(source)).sort()) await add(`${relativePath}/${name}`);
    } else if (info.isFile()) {
      zip.file(relativePath, await readFile(source), { date: info.mtime });
    } else throw new Error(`无法打包文件：${source}`);
  }
  // 只收录运行所需产物；现有手稿及其他构建残留不进入分发包。
  for (const entry of ["client", "server", "runtime/node.exe", "runtime/LICENSE", "双击运行.bat", "使用说明.txt"])
    await add(entry);
  zip.folder("data");
  const temporary = `${archivePath}.${randomUUID()}.tmp`;
  try {
    await pipeline(zip.generateNodeStream({ streamFiles: true, compression: "DEFLATE", compressionOptions: { level: 6 } }), createWriteStream(temporary));
    await rename(temporary, archivePath);
  } finally { await rm(temporary, { force: true }); }
}
