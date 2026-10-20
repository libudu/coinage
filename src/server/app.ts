import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { isProject } from "../core/validation";

const MAX_BODY = 64 * 1024 * 1024;
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon",
};

class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "Content-Type": mime[".json"], "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function body(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  if (Number(req.headers["content-length"]) > MAX_BODY) {
    req.resume();
    throw new RequestError(413, "手稿超过 64 MB，请减少原图后重试");
  }
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > MAX_BODY) {
      req.resume();
      throw new RequestError(413, "手稿超过 64 MB，请减少原图后重试");
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new RequestError(400, "无效的 JSON"); }
}

export function createApp(options: { dataDir: string; clientDir?: string }) {
  const dataDir = resolve(options.dataDir);
  const file = join(dataDir, "project.json");
  const instance = createHash("sha256").update(dataDir).digest("hex");
  // 同一进程内串行比较版本并写入，避免多个标签页静默覆盖手稿。
  let writes: Promise<unknown> = Promise.resolve();
  async function read() {
    let text: string;
    try { text = await readFile(file, "utf8"); }
    catch (error) { if (missing(error)) return { project: null, revision: null }; throw error; }
    let project: unknown;
    try { project = JSON.parse(text); }
    catch { throw new Error("本地手稿格式损坏，请检查 data/project.json 或恢复 project.backup.json"); }
    if (!isProject(project)) throw new Error("本地手稿格式损坏，请检查 data/project.json 或恢复 project.backup.json");
    return { project, revision: createHash("sha256").update(text).digest("hex") };
  }

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    try {
      const host = req.headers.host ?? "";
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) throw new RequestError(403, "仅支持本机访问");
      if (req.headers.origin && req.headers.origin !== `http://${host}`) throw new RequestError(403, "不允许跨站访问");
      const url = new URL(req.url ?? "/", `http://${host}`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (url.pathname === "/api/health" && req.method === "GET") {
        json(res, 200, { app: "coinage", instance });
      } else if (url.pathname === "/api/project" && req.method === "GET") {
        await writes;
        json(res, 200, await read());
      } else if (url.pathname === "/api/project" && req.method === "PUT") {
        if (!req.headers["content-type"]?.startsWith("application/json")) throw new RequestError(415, "需要 JSON 格式");
        const value = await body(req) as { project?: unknown; revision?: unknown } | null;
        if (!value || !isProject(value.project) || !(value.revision === null || typeof value.revision === "string"))
          throw new RequestError(400, "手稿格式不正确");
        const text = JSON.stringify(value.project);
        const write = writes.then(async () => {
          const previous = await read();
          // 刷新后的相同内容和响应丢失后的重试不轮换备份，也不产生冲突。
          if (previous.project && JSON.stringify(previous.project) === text) return previous.revision!;
          if (previous.revision !== value.revision) throw new RequestError(409, "手稿已在其他页面修改，请导出当前手稿后刷新");
          await mkdir(dataDir, { recursive: true });
          const temp = join(dataDir, `project.${randomUUID()}.tmp`);
          try {
            await writeFile(temp, text, { encoding: "utf8", flush: true });
            if (previous.project) {
              const backup = `${temp}.backup`;
              try {
                await writeFile(backup, JSON.stringify(previous.project), { encoding: "utf8", flush: true });
                await rename(backup, join(dataDir, "project.backup.json"));
              } finally { await rm(backup, { force: true }); }
            }
            await rename(temp, file);
          } finally { await rm(temp, { force: true }); }
          return createHash("sha256").update(text).digest("hex");
        });
        writes = write.catch(() => {});
        json(res, 200, { revision: await write });
      } else if (url.pathname.startsWith("/api/")) {
        json(res, 404, { error: "接口不存在" });
      } else if (options.clientDir && (req.method === "GET" || req.method === "HEAD")) {
        const root = resolve(options.clientDir);
        const target = resolve(root, `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`);
        const rel = relative(root, target);
        if (rel.startsWith("..") || isAbsolute(rel)) throw new RequestError(403, "路径不可访问");
        let info;
        try { info = await stat(target); }
        catch (error) { if (missing(error)) throw new RequestError(404, "文件不存在"); throw error; }
        if (!info.isFile()) throw new RequestError(404, "文件不存在");
        res.writeHead(200, { "Content-Type": mime[extname(target)] ?? "application/octet-stream", "Content-Length": info.size, "Cache-Control": "no-cache" });
        if (req.method === "HEAD") res.end();
        else createReadStream(target).on("error", () => res.destroy()).pipe(res);
      } else json(res, 404, { error: "文件不存在" });
    } catch (error) {
      const status = error instanceof RequestError ? error.status : 500;
      if (status === 500) console.error("本地存储错误：", error);
      if (!res.headersSent) json(res, status, { error: error instanceof Error ? error.message : "本地存储失败" });
      else res.destroy();
    }
  };
}
