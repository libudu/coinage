import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createPackageZip } from "./createPackageZip.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const runtime = resolve(process.env.COINAGE_NODE_PATH || process.execPath);
const info = JSON.parse(execFileSync(runtime, ["-p", "JSON.stringify({platform:process.platform,arch:process.arch,version:process.versions.node})"], { encoding: "utf8", windowsHide: true }));
const [major, minor] = info.version.split(".").map(Number);
if (info.platform !== "win32" || !(major === 20 && minor >= 19 || major === 22 && minor >= 12 || major > 22))
  throw new Error("便携包需要 Windows Node.js 20.19+ 或 22.12+，可通过 COINAGE_NODE_PATH 指定 node.exe");
const license = await readFile(join(dirname(runtime), "LICENSE"));
const dist = join(root, "dist");
await mkdir(join(dist, "runtime"), { recursive: true });
await mkdir(join(dist, "data"), { recursive: true });
try { await copyFile(runtime, join(dist, "runtime/node.exe")); }
catch (error) {
  if (error.code === "EBUSY" || error.code === "EPERM") throw new Error("无法更新包内 Node，请先关闭正在运行的 Coinage 本地服务后重新构建");
  throw error;
}
await writeFile(join(dist, "runtime/LICENSE"), license);
await copyFile(join(root, "dist-template/双击运行.bat"), join(dist, "双击运行.bat"));
await writeFile(join(dist, "使用说明.txt"), "Coinage 本地版\r\n\r\n双击「双击运行.bat」，浏览器会自动打开。请保持命令窗口开启。\r\n手稿自动保存在 data/project.json，上一次保存位于 data/project.backup.json。\r\n备份或迁移时复制整个 data 文件夹。升级时先关闭服务，再替换 client、server、runtime 和启动文件，保留 data。\r\n首次使用可从手稿菜单导入旧版导出的 JSON 手稿。清理浏览器不会删除本地文件。\r\n");
console.log(`便携包已生成：${dist}（附带 Node ${info.version} ${info.arch}，无需安装依赖）`);
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const archivePath = join(root, `Coinage v${pkg.version}.zip`);
await createPackageZip(dist, archivePath);
console.log(`分发压缩包已生成：${archivePath}（${((await stat(archivePath)).size / 1024 / 1024).toFixed(2)} MB，不含用户手稿）`);
