import { useEffect, useRef } from "react";
import { useProjectActions, useProjectApi } from "../project/useProject";
import { activeGlyph } from "../project/projectStore";
import type { TransactionId } from "../project/projectStore";
import { selectableNodeIds } from "./nodeSelection";

const arrowKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
type Options = {
  toast: (message: string) => void;
  importing: boolean;
  shortcuts: boolean;
  setShortcuts: (open: boolean) => void;
  closeMenu: () => void;
};

export function useEditorCommands({ toast, importing, shortcuts, setShortcuts, closeMenu }: Options) {
  const api = useProjectApi();
  const actions = useProjectActions();
  const nudge = useRef<{ id: TransactionId; key: string } | null>(null);
  const finish = () => {
    if (nudge.current) actions.commitTransaction(nudge.current.id);
    nudge.current = null;
  };
  const remove = () => {
    finish();
    if (actions.removeSelection()) toast("已删除，可撤销");
    else toast("请先解锁笔画");
  };
  const duplicate = () => { finish(); actions.duplicateStroke(); };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!arrowKeys.has(e.key)) finish();
      if (importing) return;
      if (shortcuts) {
        if (e.key === "Escape") setShortcuts(false);
        return;
      }
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      const state = api.getState(), glyph = activeGlyph(state), { nodeIds, strokeId } = state.session;
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (["a", "z", "y", "d"].includes(key)) e.preventDefault();
        if (key === "a") actions.selectNodes(selectableNodeIds(glyph), null);
        if (key === "z") e.shiftKey ? actions.redo() : actions.undo();
        if (key === "y") actions.redo();
        if (key === "d") duplicate();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (nodeIds.length || strokeId) remove();
      }
      if (e.key === "Escape") { actions.select(null, null); closeMenu(); }
      if (e.key === "?") setShortcuts(true);
      if (nodeIds.length && !e.altKey && arrowKeys.has(e.key)) {
        e.preventDefault();
        const key = `${glyph.id}:${nodeIds.join(",")}`;
        if (nudge.current?.key !== key || api.getState().transaction?.id !== nudge.current.id) {
          finish();
          nudge.current = { key, id: actions.beginTransaction() };
        }
        const d = e.shiftKey ? 10 : 1;
        actions.moveSelection({ x: e.key === "ArrowRight" ? d : e.key === "ArrowLeft" ? -d : 0,
          y: e.key === "ArrowDown" ? d : e.key === "ArrowUp" ? -d : 0 }, nudge.current.id);
      }
    };
    const up = (e: KeyboardEvent) => { if (arrowKeys.has(e.key)) finish(); };
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", finish);
    window.addEventListener("pointerdown", finish, true);
    window.addEventListener("focusin", finish);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", finish);
      window.removeEventListener("pointerdown", finish, true);
      window.removeEventListener("focusin", finish);
    };
  });
  useEffect(() => () => {
    if (nudge.current) actions.commitTransaction(nudge.current.id);
  }, [actions]);
  return { remove, duplicate };
}
