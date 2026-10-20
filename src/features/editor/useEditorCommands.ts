import { useEffect, useRef } from "react";
import { clamp } from "../../core/geometry";
import { emptyGlyph, uid } from "../../core/model";
import type { Glyph } from "../../core/model";
import type { useProject } from "../project/useProject";
import { removeNodes, selectableNodeIds, selectionLocked, translateNodes } from "./nodeSelection";

const arrowKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

type Options = {
  doc: ReturnType<typeof useProject>;
  glyph: Glyph;
  nodeIds: string[];
  strokeId: string | null;
  select: (node: string | null, stroke?: string | null) => void;
  selectNodes: (nodes: string[], stroke?: string | null) => void;
  toast: (message: string) => void;
  importing: boolean;
  shortcuts: boolean;
  setShortcuts: (open: boolean) => void;
  closeMenu: () => void;
  exportProject: () => void;
};

export function useEditorCommands({
  doc,
  glyph,
  nodeIds,
  strokeId,
  select,
  selectNodes,
  toast,
  importing,
  shortcuts,
  setShortcuts,
  closeMenu,
  exportProject,
}: Options) {
  const { update } = doc;
  const nudge = useRef<string | null>(null);
  const stroke = glyph.strokes.find((s) => s.id === strokeId);
  const remove = () => {
    nudge.current = null;
    if (nodeIds.length ? selectionLocked(glyph, nodeIds) : stroke?.locked) {
      toast("请先解锁笔画");
      return;
    }
    if (nodeIds.length) {
      update((g) => removeNodes(g, nodeIds));
      select(null, null);
    } else if (stroke) {
      update((g) => {
        g.strokes = g.strokes.filter((s) => s.id !== stroke.id);
        const used = new Set(g.strokes.flatMap((s) => s.nodes));
        Object.keys(g.nodes).forEach((id) => {
          if (!used.has(id)) delete g.nodes[id];
        });
      });
      select(null, null);
    } else {
      update((_, p) => {
        p.glyphs = p.glyphs.filter((g) => g.id !== glyph.id);
        if (!p.glyphs.length) p.glyphs.push(emptyGlyph());
        p.activeId = p.glyphs[0].id;
      });
      select(null, null);
    }
    toast("已删除，可撤销");
  };
  const duplicate = () => {
    nudge.current = null;
    if (!stroke) return;
    const sid = uid();
    update((g) => {
      const mapping = new Map<string, string>(),
        ids = stroke.nodes.map((old) => {
          if (mapping.has(old)) return mapping.get(old)!;
          const id = uid();
          mapping.set(old, id);
          const n = g.nodes[old];
          g.nodes[id] = {
            ...n,
            id,
            x: clamp(n.x + 24, 0, 640),
            y: clamp(n.y + 24, 0, 640),
          };
          return id;
        });
      g.strokes.push({
        ...stroke,
        id: sid,
        name: `${stroke.name} 副本`,
        nodes: ids,
        locked: false,
      });
    });
    select(null, sid);
  };
  const undo = () => {
      nudge.current = null;
      doc.undo();
      select(null, null);
    },
    redo = () => {
      nudge.current = null;
      doc.redo();
      select(null, null);
    };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!arrowKeys.has(e.key)) nudge.current = null;
      if (importing) return;
      if (shortcuts) {
        if (e.key === "Escape") setShortcuts(false);
        return;
      }
      if (
        (e.target as HTMLElement).closest(
          "input, textarea, select, [contenteditable]",
        )
      )
        return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "a") {
          e.preventDefault();
          selectNodes(selectableNodeIds(glyph), null);
        }
        if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          e.shiftKey ? redo() : undo();
        }
        if (e.key.toLowerCase() === "y") {
          e.preventDefault();
          redo();
        }
        if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          exportProject();
        }
        if (e.key.toLowerCase() === "d") {
          e.preventDefault();
          duplicate();
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (nodeIds.length || stroke) remove();
      }
      if (e.key === "Escape") {
        select(null, null);
        closeMenu();
      }
      if (e.key === "?") setShortcuts(true);
      if (nodeIds.length && !e.altKey && arrowKeys.has(e.key)) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const offset = {
          x: e.key === "ArrowRight" ? d : e.key === "ArrowLeft" ? -d : 0,
          y: e.key === "ArrowDown" ? d : e.key === "ArrowUp" ? -d : 0,
        };
        const current = doc.current.current;
        const active = current.glyphs.find((g) => g.id === current.activeId)!;
        const next = structuredClone(active);
        if (!translateNodes(next, nodeIds, offset)) return;
        const gesture = `${glyph.id}:${nodeIds.join(",")}`;
        update((g) => {
          translateNodes(g, nodeIds, offset);
        }, nudge.current !== gesture);
        nudge.current = gesture;
      }
    };
    const finish = () => { nudge.current = null; };
    const up = (e: KeyboardEvent) => {
      if (arrowKeys.has(e.key)) finish();
    };
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
  return { remove, duplicate, undo, redo };
}
