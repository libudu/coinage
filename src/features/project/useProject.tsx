import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useStore } from "zustand";
import type { Project } from "../../core/model";
import { activeGlyph, createProjectStore } from "./projectStore";
import type { ProjectState, ProjectStore, TransactionId } from "./projectStore";
import { startProjectAutosave } from "./projectAutosave";
import { projectStorage } from "./projectStorage";

const ProjectContext = createContext<ProjectStore | null>(null);
export function ProjectProvider({ initialProject, children }: { initialProject: Project; children: ReactNode }) {
  const [store] = useState(() => createProjectStore(initialProject));
  useEffect(() => {
    const autosave = startProjectAutosave(store, projectStorage);
    const flush = () => { if (document.visibilityState === "hidden") void autosave.flush(); };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!autosave.hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      autosave.dispose();
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [store]);
  return <ProjectContext.Provider value={store}>{children}</ProjectContext.Provider>;
}
export function useProjectApi() {
  const store = useContext(ProjectContext);
  if (!store) throw new Error("编辑器必须位于 ProjectProvider 内");
  return store;
}
export function useProject<T>(selector: (state: ProjectState) => T): T {
  return useStore(useProjectApi(), selector);
}
export const useProjectActions = () => useProject((s) => s.actions);
export const useActiveGlyph = () => useProject(activeGlyph);

// 控件只持有事务 token，不保存历史快照。字符切换、撤销或隐藏页面保存后，
// 旧控件的清理操作不能结束其他控件正在进行的编辑。
export function useEditTransaction(onFinish?: () => void) {
  const api = useProjectApi();
  const { beginTransaction, commitTransaction, cancelTransaction } = useProjectActions();
  const transaction = useRef<TransactionId | null>(null);
  const cleanup = useRef(onFinish);
  cleanup.current = onFinish;
  const begin = useCallback(() => {
    if (!transaction.current || api.getState().transaction?.id !== transaction.current)
      transaction.current = beginTransaction();
    return transaction.current;
  }, [api, beginTransaction]);
  const finish = useCallback((cancel = false) => {
    const id = transaction.current;
    transaction.current = null;
    cleanup.current?.();
    if (!id) return;
    if (cancel) cancelTransaction(id);
    else commitTransaction(id);
  }, [commitTransaction, cancelTransaction]);
  useEffect(() => {
    const blur = () => finish();
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("blur", blur); finish(); };
  }, [finish]);
  const isActive = useCallback(() => !!transaction.current
    && api.getState().transaction?.id === transaction.current, [api]);
  return { transaction, begin, finish, isActive };
}
