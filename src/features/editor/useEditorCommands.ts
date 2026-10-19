import { useEffect } from "react";
import { clamp } from "../../core/geometry";
import { emptyGlyph, uid } from "../../core/model";
import type { Glyph } from "../../core/model";
import type { useProject } from "../project/useProject";

type Options = {
  doc: ReturnType<typeof useProject>;
  glyph: Glyph;
  nodeId: string | null;
  strokeId: string | null;
  select: (node: string | null, stroke?: string | null) => void;
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
  nodeId,
  strokeId,
  select,
  toast,
  importing,
  shortcuts,
  setShortcuts,
  closeMenu,
  exportProject,
}: Options) {
  const { update } = doc;
  const node = nodeId ? glyph.nodes[nodeId] : undefined;
  const stroke = glyph.strokes.find((s) => s.id === strokeId);
  const remove = () => {
    if (
      stroke?.locked ||
      (node && glyph.strokes.some((s) => s.locked && s.nodes.includes(node.id)))
    ) {
      toast("请先解锁笔画");
      return;
    }
    if (node) {
      update((g) => {
        delete g.nodes[node.id];
        g.strokes = g.strokes
          .map((s) => ({ ...s, nodes: s.nodes.filter((id) => id !== node.id) }))
          .filter((s) => s.nodes.length >= 2);
        const used = new Set(g.strokes.flatMap((s) => s.nodes));
        Object.keys(g.nodes).forEach((id) => {
          if (!used.has(id)) delete g.nodes[id];
        });
      });
      select(null);
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
      doc.undo();
      select(null, null);
    },
    redo = () => {
      doc.redo();
      select(null, null);
    };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
        if (node || stroke) remove();
      }
      if (e.key === "Escape") {
        select(null, null);
        closeMenu();
      }
      if (e.key === "?") setShortcuts(true);
      if (
        node &&
        !glyph.strokes.some((s) => s.locked && s.nodes.includes(node.id)) &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        update((g) => {
          const n = g.nodes[node.id];
          n.x = clamp(
            n.x + (e.key === "ArrowRight" ? d : e.key === "ArrowLeft" ? -d : 0),
            0,
            640,
          );
          n.y = clamp(
            n.y + (e.key === "ArrowDown" ? d : e.key === "ArrowUp" ? -d : 0),
            0,
            640,
          );
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  return { remove, duplicate, undo, redo };
}
