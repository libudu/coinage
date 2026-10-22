import { demoProject } from "../../core/demo";
import type { Project } from "../../core/model";
import { isProject } from "../../core/validation";
import { createProjectPatch } from "../../core/projectPatch";
import { withBrowserRecord } from "../../shared/utils/browserDatabase";

type SavedProject = { revision: string; project: Project };

function readProject(value: unknown): SavedProject | undefined {
  if (value === undefined) return undefined;
  const saved = value as Partial<SavedProject> | null;
  if (!saved || typeof saved.revision !== "string" || !isProject(saved.project))
    throw new Error("浏览器手稿格式不正确，未覆盖已有数据");
  return saved as SavedProject;
}

export class BrowserProjectStorage {
  private revision: string | undefined;
  private loaded = false;
  private conflict = false;
  private persisted: Project | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private factory?: IDBFactory) {}

  async load(): Promise<Project> {
    const saved = await withBrowserRecord(
      "project",
      "readonly",
      readProject,
      this.factory,
    );
    this.revision = saved?.revision;
    this.persisted = saved?.project ?? null;
    this.loaded = true;
    this.conflict = false;
    return saved ? structuredClone(saved.project) : demoProject();
  }

  save(project: Project): Promise<void> {
    const save = this.queue.then(async () => {
      if (!this.loaded) throw new Error("请先读取浏览器手稿");
      if (this.conflict)
        throw new Error("手稿已在其他页面修改，请导出当前手稿后刷新");
      if (!isProject(project)) throw new Error("手稿格式不正确");
      if (this.persisted && !createProjectPatch(this.persisted, project).length)
        return;
      const revision = crypto.randomUUID();
      await withBrowserRecord(
        "project",
        "readwrite",
        (value, store) => {
          const saved = readProject(value);
          if (saved?.revision !== this.revision) {
            this.conflict = true;
            throw new Error("手稿已在其他页面修改，请导出当前手稿后刷新");
          }
          store.put({ revision, project }, "project");
        },
        this.factory,
      );
      this.revision = revision;
      this.persisted = project;
    });
    this.queue = save.catch(() => {});
    return save;
  }
}
