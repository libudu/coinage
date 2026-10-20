import { useCallback, useEffect, useRef, useState } from "react";
import { projectStorage } from "./projectStorage";
import type { Glyph, Project } from "../../core/model";
export function useProject(initialProject: Project) {
  const [project, setProject] = useState<Project>(initialProject),
    current = useRef(project),
    [saved, setSaved] = useState("saving"),
    [saveError, setSaveError] = useState("");
  const persisted = useRef<Project | null>(null);
  const pendingSaves = useRef(0);
  const history = useRef<{ past: Project[]; future: Project[] }>({
      past: [],
      future: [],
    }),
    [, refresh] = useState(0);
  const remember = useCallback((p: Project) => {
    history.current.past = [...history.current.past.slice(-59), p];
    history.current.future = [];
    refresh((n) => n + 1);
  }, []);
  const replace = useCallback(
    (p: Project, record = true) => {
      if (record) remember(current.current);
      current.current = p;
      setProject(p);
    },
    [remember],
  );
  const update = useCallback(
    (fn: (g: Glyph, p: Project) => void, record = true) => {
      const p = structuredClone(current.current);
      fn(p.glyphs.find((g) => g.id === p.activeId) || p.glyphs[0], p);
      replace(p, record);
    },
    [replace],
  );
  const undo = useCallback(() => {
    const p = history.current.past.pop();
    if (p) {
      history.current.future.push(current.current);
      replace(p, false);
    }
  }, [replace]);
  const redo = useCallback(() => {
    const p = history.current.future.pop();
    if (p) {
      history.current.past.push(current.current);
      replace(p, false);
    }
  }, [replace]);
  useEffect(() => {
    setSaved("saving");
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let running = false;
    const save = async () => {
      if (running) return;
      running = true;
      pendingSaves.current++;
      try {
        await projectStorage.save(project);
        persisted.current = project;
        if (!disposed) { setSaved("saved"); setSaveError(""); }
      } catch (error) {
        if (!disposed) {
          setSaved("error");
          setSaveError(error instanceof Error ? error.message : "本地保存失败，请导出手稿");
          timer = setTimeout(() => void save(), 5000);
        }
      } finally { running = false; pendingSaves.current--; }
    };
    const flush = () => {
      if (document.visibilityState === "hidden") { clearTimeout(timer); void save(); }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (persisted.current === current.current && pendingSaves.current === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    timer = setTimeout(() => void save(), 250);
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [project]);
  return {
    project,
    current,
    update,
    replace,
    remember,
    undo,
    redo,
    saved,
    saveError,
    canUndo: !!history.current.past.length,
    canRedo: !!history.current.future.length,
  };
}
