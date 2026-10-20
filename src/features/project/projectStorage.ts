import { demoProject } from "../../core/demo";
import { isProject } from "../../core/validation";
import { migrateProjectBrush } from "../../core/brush";
import type { Project } from "../../core/model";

const KEY = "coinage.studio.v1";

function browserProject(): Project | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || "null");
    if (isProject(value)) return migrateProjectBrush(value);
  } catch {}
  return null;
}

export class ProjectStorage {
  private revision: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private conflict = false;

  constructor(private request: typeof fetch = (...args) => fetch(...args)) {}

  private async api(method: "GET" | "PUT", data?: unknown) {
    let response: Response;
    try {
      response = await this.request("/api/project", {
        method, cache: "no-store", signal: AbortSignal.timeout(15000),
        ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
      });
    } catch { throw new Error("连接本地服务失败，请确认启动窗口仍在运行"); }
    const value = await response.json().catch(() => { throw new Error("本地服务响应不正确"); });
    if (!response.ok) {
      if (response.status === 409) this.conflict = true;
      throw new Error(value.error || "本地保存失败，请导出手稿");
    }
    return value;
  }

  async load(): Promise<Project> {
    const value = await this.api("GET");
    if (!(value.revision === null || typeof value.revision === "string") ||
      !(value.project === null || isProject(value.project))) throw new Error("本地手稿格式不正确");
    this.revision = value.revision;
    // 文件优先；只有首次运行才读取当前来源下的旧浏览器手稿。
    return value.project ? migrateProjectBrush(value.project) : browserProject() ?? demoProject();
  }

  save(project: Project): Promise<void> {
    const save = this.queue.then(async () => {
      if (this.conflict) throw new Error("手稿已在其他页面修改，请导出当前手稿后刷新");
      const value = await this.api("PUT", { project, revision: this.revision });
      if (typeof value.revision !== "string") throw new Error("本地保存响应不正确");
      this.revision = value.revision;
    });
    this.queue = save.catch(() => {});
    return save;
  }
}

export const projectStorage = new ProjectStorage();
