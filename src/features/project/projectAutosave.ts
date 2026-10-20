import type { Project } from "../../core/model";
import type { ProjectStore } from "./projectStore";

type Storage = { save: (project: Project) => Promise<void> };

// 每个编辑器使用独立的保存协调器，请求串行化和版本校验仍由 ProjectStorage 负责。
export function startProjectAutosave(store: ProjectStore, storage: Storage,
  { delay = 250, retryDelay = 5000 } = {}) {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let persisted: Project | null = null;
  let lastError = "";
  let retryScheduled = false;
  let running: Promise<void> | null = null;
  const syncStatus = () => {
    if (disposed) return;
    const state = store.getState();
    const saved = lastError ? "error" : persisted === state.project && !running ? "saved" : "saving";
    if (saved !== state.saved || lastError !== state.saveError)
      store.setState({ saved, saveError: lastError });
  };
  const save = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    // 并发的 flush 调用共享同一轮保存结果，包括失败结果，
    // 避免一次失败触发多次立即重试。
    if (running) return running;
    clearTimeout(timer);
    retryScheduled = false;
    if (persisted === store.getState().committedProject) {
      syncStatus();
      return Promise.resolve();
    }
    const task = (async () => {
      while (!disposed) {
        const project = store.getState().committedProject;
        if (persisted === project) return;
        try {
          await storage.save(project);
          persisted = project;
          lastError = "";
        } catch (error) {
          // 发生版本冲突或响应丢失后，无法确认磁盘中的内容。
          // 即使撤销回曾保存成功的对象，也不能据此认定当前手稿已保存。
          persisted = null;
          lastError = error instanceof Error ? error.message : "本地保存失败，请导出手稿";
          if (disposed) return;
          clearTimeout(timer);
          retryScheduled = true;
          timer = setTimeout(() => void save(), retryDelay);
          return;
        }
      }
    })();
    const drain = task.finally(() => {
      running = null;
      syncStatus();
      // 本轮保存结束到此微任务执行之间，仍可能产生新的提交。
      if (!disposed && !lastError && persisted !== store.getState().committedProject) schedule();
    });
    running = drain;
    syncStatus();
    return drain;
  };
  const schedule = () => {
    syncStatus();
    // 新提交只更新重试时要保存的内容，不缩短重试间隔。
    // 隐藏页面时显式调用 flush，仍可立即重试。
    if (retryScheduled) return;
    clearTimeout(timer);
    timer = setTimeout(() => void save(), delay);
  };
  const unsubscribe = store.subscribe((state, previous) => {
    if (state.committedProject !== previous.committedProject) schedule();
    else if (state.project !== previous.project) syncStatus();
  });
  schedule();
  return {
    flush() {
      if (disposed) return Promise.resolve();
      store.getState().actions.commitTransaction();
      return save();
    },
    hasUnsavedChanges: () => persisted !== store.getState().project || !!running,
    dispose() { disposed = true; clearTimeout(timer); unsubscribe(); },
  };
}
