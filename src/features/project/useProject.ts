import { useCallback, useEffect, useRef, useState } from "react";
import { demoProject } from "../../core/demo";
import { isProject } from "../../core/validation";
import { migrateProjectBrush } from "../../core/brush";
import type { Glyph, Project } from "../../core/model";
const KEY = "coinage.studio.v1";
function initial() {
  try {
    const p: unknown = JSON.parse(localStorage.getItem(KEY) || "null");
    if (isProject(p)) return migrateProjectBrush(p);
  } catch {}
  return demoProject();
}
export function useProject() {
  const [project, setProject] = useState<Project>(initial),
    current = useRef(project),
    [saved, setSaved] = useState("saved");
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
    const save = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(current.current));
        setSaved("saved");
      } catch {
        setSaved("error");
      }
    };
    const timer = setTimeout(save, 250);
    window.addEventListener("beforeunload", save);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeunload", save);
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
    canUndo: !!history.current.past.length,
    canRedo: !!history.current.future.length,
  };
}
