import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";

const root = fileURLToPath(new URL("../", import.meta.url));
const dataDir = resolve(root, "data");
const port = Number(process.env.COINAGE_PORT ?? 47831);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("COINAGE_PORT 必须是 1–65535 的整数");
const url = `http://127.0.0.1:${port}`;
function openBrowser() {
  if (process.argv.includes("--no-open")) return;
  const [command, args] = process.platform === "win32"
    ? ["rundll32.exe", ["url.dll,FileProtocolHandler", url]]
    : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => console.log(`请在浏览器打开 ${url}`));
  child.unref();
}
const server = createServer(createApp({ dataDir, clientDir: resolve(root, "client") }));
server.on("error", async (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
      const existing = await response.json();
      if (existing.app === "coinage" && existing.instance === createHash("sha256").update(dataDir).digest("hex")) {
        console.log(`Coinage 已在运行：${url}`);
        openBrowser();
        return;
      }
    } catch {}
  }
  console.error(`启动失败：${error.code === "EADDRINUSE" ? "端口被其他程序占用，可设置 COINAGE_PORT 后重试" : error.message}`);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Coinage：${url}\n手稿目录：${dataDir}\n请保持此窗口开启，关闭窗口将停止服务。`);
  openBrowser();
});
