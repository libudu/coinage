import { demoProject } from "../../core/demo";
import { isProject } from "../../core/validation";
import { createProjectPatch } from "../../core/projectPatch";
import type { Project } from "../../core/model";
import { isWebVersion } from "../../shared/utils/runtime";
import { BrowserProjectStorage } from "./browserProjectStorage";

export class ProjectStorage {
  private revision: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private conflict = false;
  private persisted: Project | null = null;
  private pending: {
    method: "PUT" | "PATCH";
    data: unknown;
    project: Project;
  } | null = null;

  constructor(private request: typeof fetch = (...args) => fetch(...args)) {}

  private async api(method: "GET" | "PUT" | "PATCH", data?: unknown) {
    let response: Response;
    try {
      response = await this.request("/api/project", {
        method,
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
        ...(data === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            }),
      });
    } catch {
      throw new Error("连接本地服务失败，请确认启动窗口仍在运行");
    }
    const value = await response.json().catch(() => {
      throw new Error("本地服务响应不正确");
    });
    if (!response.ok) {
      if (response.status === 409) this.conflict = true;
      throw new StorageError(
        value.error || "本地保存失败，请导出手稿",
        response.status,
      );
    }
    return value;
  }

  async load(): Promise<Project> {
    const value = await this.api("GET");
    if (
      !(value.revision === null || typeof value.revision === "string") ||
      !(value.project === null || isProject(value.project))
    )
      throw new Error("本地手稿格式不正确");
    this.revision = value.revision;
    this.persisted = value.project;
    this.conflict = false;
    this.pending = null;
    return value.project ? structuredClone(value.project) : demoProject();
  }

  save(project: Project): Promise<void> {
    const save = this.queue.then(async () => {
      if (this.conflict)
        throw new Error("手稿已在其他页面修改，请导出当前手稿后刷新");
      // 响应丢失时先重试原请求，确认磁盘基线后，再计算最新编辑的增量。
      if (this.pending) await this.writePending();
      if (this.persisted) {
        const changes = createProjectPatch(this.persisted, project);
        if (!changes.length) return;
        this.pending = {
          method: "PATCH",
          project,
          data: {
            changes,
            revision: this.revision,
            requestId: crypto.randomUUID(),
          },
        };
      } else {
        // 首次创建文件没有基线，发送完整手稿；后续只提交变化字段。
        this.pending = {
          method: "PUT",
          project,
          data: { project, revision: this.revision },
        };
      }
      await this.writePending();
    });
    this.queue = save.catch(() => {});
    return save;
  }

  private async writePending() {
    const pending = this.pending!;
    try {
      const value = await this.api(pending.method, pending.data);
      if (typeof value.revision !== "string")
        throw new Error("本地保存响应不正确");
      this.revision = value.revision;
      this.persisted = pending.project;
      this.pending = null;
    } catch (error) {
      // 明确拒绝的内容可以被下一次修改替换；无法确认落盘结果时须保留原请求。
      if (
        error instanceof StorageError &&
        error.status >= 400 &&
        error.status < 500
      )
        this.pending = null;
      throw error;
    }
  }
}

class StorageError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const projectStorage = isWebVersion
  ? new BrowserProjectStorage()
  : new ProjectStorage();
