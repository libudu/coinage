import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { clamp, distance } from "../../core/geometry";
import { uid } from "../../core/model";
import type { Point } from "../../core/model";
import { Icon } from "../../shared/components/Icon";
import type { IconName } from "../../shared/components/Icon";
import { useActiveGlyph, useProject, useProjectActions } from "../project/useProject";
import { selectionLocked } from "./nodeSelection";

type Props = {
  remove: () => void;
  duplicate: () => void;
  editGlyphInfo: () => void;
  toast: (s: string) => void;
  position: Point;
  onClose: () => void;
};

type MenuAction = {
  label: string;
  icon: IconName;
  action: () => void;
  disabled?: boolean;
  danger?: boolean;
};

export function EditorContextMenu({
  remove, duplicate, editGlyphInfo, toast, position, onClose,
}: Props) {
  const glyph = useActiveGlyph();
  const nodeIds = useProject((s) => s.session.nodeIds);
  const nodeId = nodeIds.at(-1) ?? null;
  const strokeId = useProject((s) => s.session.strokeId);
  const { update, select } = useProjectActions();
  const menu = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(position);
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const place = () => {
      const { width, height } = element.getBoundingClientRect();
      setOffset({
        x: clamp(position.x, 8, Math.max(8, window.innerWidth - width - 8)),
        y: clamp(position.y, 8, Math.max(8, window.innerHeight - height - 8)),
      });
    };
    place();
    element.focus();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [position]);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", closeOutside);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
    };
  }, [onClose]);
  const node = nodeId ? glyph.nodes[nodeId] : undefined;
  const multiple = nodeIds.length > 1;
  const stroke = glyph.strokes.find((s) => s.id === strokeId);
  const nodeLocked = (id: string) =>
    glyph.strokes.some((s) => s.locked && s.nodes.includes(id));
  const locked = nodeIds.length ? selectionLocked(glyph, nodeIds) : !!stroke?.locked;
  const transform = (kind: "flip" | "rotate") => {
    const ids = multiple ? nodeIds : stroke?.nodes;
    if (!ids?.length || selectionLocked(glyph, ids)) return;
    update((g) => {
      const nodes = [...new Set(ids)].map((id) => g.nodes[id]),
        cx =
          (Math.min(...nodes.map((n) => n.x)) +
            Math.max(...nodes.map((n) => n.x))) /
          2,
        cy =
          (Math.min(...nodes.map((n) => n.y)) +
            Math.max(...nodes.map((n) => n.y))) /
          2;
      nodes.forEach((n) => {
        const x = n.x - cx,
          y = n.y - cy;
        n.x = cx + (kind === "flip" ? -x : -y);
        n.y = cy + (kind === "flip" ? y : x);
        if (n.handle)
          n.handle =
            kind === "flip"
              ? { x: -n.handle.x, y: n.handle.y }
              : { x: -n.handle.y, y: n.handle.x };
        if (n.handleIn)
          n.handleIn =
            kind === "flip"
              ? { x: -n.handleIn.x, y: n.handleIn.y }
              : { x: -n.handleIn.y, y: n.handleIn.x };
      });
      const dx =
        Math.min(...nodes.map((n) => n.x)) < 0
          ? -Math.min(...nodes.map((n) => n.x))
          : Math.max(...nodes.map((n) => n.x)) > 640
            ? 640 - Math.max(...nodes.map((n) => n.x))
            : 0;
      const dy =
        Math.min(...nodes.map((n) => n.y)) < 0
          ? -Math.min(...nodes.map((n) => n.y))
          : Math.max(...nodes.map((n) => n.y)) > 640
            ? 640 - Math.max(...nodes.map((n) => n.y))
            : 0;
      nodes.forEach((n) => {
        n.x += dx;
        n.y += dy;
      });
    });
  };
  const merge = () => {
    if (!node || locked) return;
    const nearest = Object.values(glyph.nodes)
      .filter((n) => n.id !== node.id && !nodeLocked(n.id))
      .sort((a, b) => distance(a, node) - distance(b, node))[0];
    if (!nearest || distance(nearest, node) > 36) {
      toast("请把节点移动到目标节点附近（36 px 内）");
      return;
    }
    update((g) => {
      g.strokes = g.strokes
        .map((s) => ({
          ...s,
          nodes: s.nodes
            .map((id) => (id === node.id ? nearest.id : id))
            .filter((id, i, ids) => i === 0 || id !== ids[i - 1]),
        }))
        .filter((s) => s.nodes.length >= 2);
      delete g.nodes[node.id];
    });
    select(nearest.id);
    toast("节点已合并");
  };
  const disconnect = () => {
    if (!node || !stroke || locked) return;
    const id = uid();
    update((g) => {
      g.nodes[id] = { ...g.nodes[node.id], id };
      g.strokes.find((s) => s.id === stroke.id)!.nodes = stroke.nodes.map(
        (n) => (n === node.id ? id : n),
      );
    });
    select(id, stroke.id);
    toast("已拆开当前笔画的连接");
  };
  const items: MenuAction[] = [];
  if (stroke || multiple) {
    const transformLocked = locked || (!multiple && !!stroke?.nodes.some(nodeLocked));
    if (!multiple) items.push({ label: "复制笔画", icon: "copy", action: duplicate });
    items.push(
      { label: "水平翻转", icon: "reflect", action: () => transform("flip"), disabled: transformLocked },
      { label: "旋转 90°", icon: "rotate", action: () => transform("rotate"), disabled: transformLocked },
    );
  }
  if (node) {
    items.push(
      { label: multiple ? "删除所选节点" : "删除节点", icon: "trash", action: remove, disabled: locked, danger: true },
    );
    if (!multiple) items.push(
      { label: "合并邻近节点", icon: "branch", action: merge, disabled: locked },
      { label: "拆开连接", icon: "node", action: disconnect,
        disabled: locked || !stroke || glyph.strokes.filter((s) => s.nodes.includes(node.id)).length < 2 },
    );
  } else if (stroke) {
    items.push({ label: "删除笔画", icon: "trash", action: remove, disabled: locked, danger: true });
  } else {
    items.push(
      { label: "编辑基本信息", icon: "pen", action: editGlyphInfo },
      { label: "复制字符", icon: "copy", action: () => {
        const copy = structuredClone(glyph);
        copy.id = uid();
        copy.name += " 副本";
        update((_, p) => {
          p.glyphs.push(copy);
          p.activeId = copy.id;
        });
      } },
      { label: "删除字符", icon: "trash", action: remove, danger: true },
    );
  }
  return (
    <div
      ref={menu}
      className="editor-context-menu fixed z-[60] w-[min(184px,_calc(100vw_-_16px))] max-h-[calc(100dvh_-_16px)]
        overflow-auto p-[5px] bg-[var(--panel)] border [border-style:solid] border-[#dce3d3] rounded-[7px]
        shadow-[0_8px_28px_#203d2226,_0_2px_6px_#203d2212] outline-none overscroll-contain [&>button]:flex
        [&>button]:items-center [&>button]:gap-[9px] [&>button]:w-full [&>button]:h-[32px] [&>button]:py-0
        [&>button]:px-[9px] [&>button]:rounded-[4px] [&>button]:text-left [&>button]:text-[12px]
        [&>button]:text-[#53674b] [&>button:hover:not(:disabled)]:bg-[#edf3e4] [&>button:hover:not(:disabled)]:outline-offset-[-2px] [&>button:focus-visible]:bg-[#edf3e4] [&>button:focus-visible]:outline-offset-[-2px] [&>button.danger]:text-[#a44c3a]!"
      role="menu"
      aria-label={node ? "节点操作" : stroke ? "笔画操作" : "字符操作"}
      tabIndex={-1}
      style={{ left: offset.x, top: offset.y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || e.key === "Tab") {
          if (e.key === "Escape") e.preventDefault();
          onClose();
        } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1
            : index < 0 ? (e.key === "ArrowUp" ? buttons.length - 1 : 0)
            : (index + (e.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      }}
      onKeyUp={(e) => e.stopPropagation()}
      onBlur={(e) => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) onClose();
      }}
    >
      {items.map((item) => (
        <button key={item.label} role="menuitem" disabled={item.disabled}
          className={item.danger ? "danger" : undefined}
          onClick={() => {
            item.action();
            onClose();
          }}>
          <Icon name={item.icon} size={16} />
          {item.label}
        </button>
      ))}
    </div>
  );
}
