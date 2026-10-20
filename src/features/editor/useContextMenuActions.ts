import { distance } from "../../core/geometry";
import { uid } from "../../core/model";
import type { Point } from "../../core/model";
import { useToast } from "../../shared/components/Toast";
import {
  useActiveGlyph,
  useProject,
  useProjectActions,
} from "../project/useProject";
import { selectionLocked } from "./nodeSelection";

export function useContextMenuActions() {
  const toast = useToast();
  const glyph = useActiveGlyph();
  const nodeIds = useProject((s) => s.session.nodeIds);
  const nodeId = nodeIds.at(-1) ?? null;
  const strokeId = useProject((s) => s.session.strokeId);
  const { update, select, duplicateGlyph } = useProjectActions();
  const node = nodeId ? glyph.nodes[nodeId] : undefined;
  const multiple = nodeIds.length > 1;
  const stroke = glyph.strokes.find((s) => s.id === strokeId);
  const nodeLocked = (id: string) =>
    glyph.strokes.some((s) => s.locked && s.nodes.includes(id));
  const locked = nodeIds.length
    ? selectionLocked(glyph, nodeIds)
    : !!stroke?.locked;
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
      g.strokes.forEach((s) => {
        if (!s.segments || !s.nodes.some((id) => ids.includes(id))) return;
        const vector = (p: Point): Point =>
          kind === "flip" ? { x: -p.x, y: p.y } : { x: -p.y, y: p.x };
        s.segments = s.segments.map((segment) => ({
          ...segment,
          handleOut: ids.includes(segment.from)
            ? vector(segment.handleOut)
            : segment.handleOut,
          handleIn: ids.includes(segment.to)
            ? vector(segment.handleIn)
            : segment.handleIn,
          ...(!s.nodes.every((id) => ids.includes(id))
            ? { sampling: undefined }
            : {}),
        }));
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
      const target = g.strokes.find((s) => s.id === stroke.id)!;
      if (target.segments)
        target.segments = target.segments.map((segment) => ({
          ...segment,
          from: segment.from === node.id ? id : segment.from,
          to: segment.to === node.id ? id : segment.to,
        }));
    });
    select(id, stroke.id);
    toast("已拆开当前笔画的连接");
  };
  return {
    glyph,
    nodeIds,
    node,
    multiple,
    stroke,
    nodeLocked,
    locked,
    transform,
    merge,
    disconnect,
    update,
    select,
    duplicateGlyph,
  };
}
