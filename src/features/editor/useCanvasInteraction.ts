import { useEffect, useRef, useState } from "react";
import type {
  Dispatch,
  MouseEvent,
  PointerEvent as PE,
  RefObject,
  SetStateAction,
} from "react";
import { clamp, distance, strokeControls } from "../../core/geometry";
import { newStroke, uid } from "../../core/model";
import type { Point, Project, Stroke } from "../../core/model";
import { reconcileStrokeGeometry } from "../../core/strokeEditing";
import type { Notify } from "../../shared/components/Toast";
import {
  selectableNodeIds,
  selectionLocked,
  translateNodes,
} from "./nodeSelection";
import {
  useActiveGlyph,
  useProject,
  useProjectActions,
  useProjectApi,
} from "../project/useProject";
import type { TransactionId } from "../project/projectStore";

type Drag = {
  kind: "node" | "branch" | "handle" | "stroke" | "pan" | "marquee";
  id?: string;
  nodeIds?: string[];
  deselectOnClick?: boolean;
  start: Point;
  origin?: Point;
  before: Project;
  moved: boolean;
  pointerId: number;
  transaction?: TransactionId;
  branch?: { sourceId: string; strokeId: string };
  pan?: Point;
  sign?: number;
  selection?: { nodeIds: string[]; strokeId: string | null; additive: boolean };
  clientStart?: Point;
  selecting?: boolean;
};

type Options = {
  toast: Notify;
  space: boolean;
  preview: boolean;
  nodesVisible?: boolean;
  modalOpen?: boolean;
  pan: Point;
  setPan: Dispatch<SetStateAction<Point>>;
  stage: RefObject<HTMLDivElement | null>;
  svg: RefObject<SVGSVGElement | null>;
};

export function useCanvasInteraction({
  toast,
  space,
  preview,
  nodesVisible = true,
  modalOpen = false,
  pan,
  setPan,
  stage,
  svg,
}: Options) {
  const api = useProjectApi();
  const glyph = useActiveGlyph();
  const nodeIds = useProject((s) => s.session.nodeIds);
  const strokeId = useProject((s) => s.session.strokeId);
  const tool = useProject((s) => s.session.tool);
  const {
    update,
    select,
    selectNodes,
    beginTransaction,
    commitTransaction,
    cancelTransaction,
  } = useProjectActions();
  const drag = useRef<Drag | null>(null);
  const [marquee, setMarquee] = useState<{ start: Point; end: Point } | null>(
    null,
  );
  const clearDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "marquee") setMarquee(null);
    if (d && stage.current?.hasPointerCapture(d.pointerId))
      stage.current.releasePointerCapture(d.pointerId);
  };
  useEffect(() => {
    const finish = () => {
      if (drag.current?.transaction)
        commitTransaction(drag.current.transaction);
      clearDrag();
    };
    window.addEventListener("blur", finish);
    return () => {
      window.removeEventListener("blur", finish);
      finish();
    };
  }, [commitTransaction]);
  useEffect(() => {
    if (drag.current?.kind === "marquee") clearDrag();
  }, [glyph.id, tool, preview, nodesVisible, modalOpen]);
  useEffect(
    () =>
      api.subscribe((state, previous) => {
        const d = drag.current;
        if (
          d?.kind === "marquee" &&
          (state.project !== d.before ||
            state.session.tool !== previous.session.tool ||
            (!d.selecting &&
              (state.session.nodeIds !== previous.session.nodeIds ||
                state.session.strokeId !== previous.session.strokeId)))
        )
          clearDrag();
      }),
    [api],
  );
  const penTail = useRef<string | null>(null);
  const penStroke = useRef<string | null>(null);
  const stroke = glyph.strokes.find((s) => s.id === strokeId);
  const nodeLocked = (id: string) =>
    glyph.strokes.some((s) => s.locked && s.nodes.includes(id));
  const strokeForNode = (id: string | undefined) =>
    id
      ? ((stroke?.visible && stroke.nodes.includes(id)
          ? stroke
          : glyph.strokes.find((s) => s.visible && s.nodes.includes(id))
        )?.id ?? null)
      : null;

  const finishPen = () => {
    penTail.current = null;
    penStroke.current = null;
  };
  useEffect(() => {
    finishPen();
  }, [glyph.id, tool]);
  const point = (
    e: { clientX: number; clientY: number },
    bounded = true,
  ): Point => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return bounded
      ? { x: clamp(p.x, 0, 640), y: clamp(p.y, 0, 640) }
      : { x: p.x, y: p.y };
  };
  const start = (e: PE, kind: Drag["kind"], id?: string, sign?: number) => {
    let movingIds: string[] | undefined;
    let deselectOnClick = false;
    if (
      drag.current ||
      e.isPrimary === false ||
      (e.button !== 0 && e.button !== 1)
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    if (space || tool === "hand" || e.button === 1) kind = "pan";
    if (kind === "pan") {
      drag.current = {
        kind,
        pointerId: e.pointerId,
        start: { x: e.clientX, y: e.clientY },
        before: api.getState().project,
        moved: false,
        pan,
      };
      stage.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (id && ["node", "handle", "branch"].includes(kind) && nodeLocked(id)) {
      toast("请先解锁连接的笔画");
      return;
    }
    if (kind === "node" && id) {
      const sid = strokeForNode(id);
      if (tool === "select" && !e.altKey) {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          // 松开指针时再取消选中，使按住 Shift 拖动仍可约束移动方向。
          deselectOnClick = nodeIds.includes(id);
          movingIds = deselectOnClick ? nodeIds : [...nodeIds, id];
        } else movingIds = nodeIds.includes(id) ? nodeIds : [id];
        selectNodes(movingIds, sid);
      } else select(id, sid);
      if (tool === "pen") {
        const tail = penTail.current;
        if (tail && tail !== id && glyph.nodes[tail]) {
          const existing = glyph.strokes.find(
              (s) =>
                s.id === penStroke.current &&
                !s.locked &&
                s.nodes[s.nodes.length - 1] === tail,
            ),
            sid = existing?.id || uid(),
            targetId = id;
          update((g) => {
            if (existing)
              g.strokes.find((s) => s.id === sid)!.nodes.push(targetId);
            else
              g.strokes.push({
                ...newStroke([tail, targetId], g.strokes.length),
                id: sid,
              });
          });
          penStroke.current = sid;
          select(targetId, sid);
        } else penStroke.current = null;
        penTail.current = id;
        return;
      }
      if (tool === "branch" || e.altKey) kind = "branch";
    }
    const before = api.getState().project,
      p = point(e),
      origin = id ? glyph.nodes[id] : undefined;
    let branch: Drag["branch"];
    if (kind === "branch" && id) {
      // 先预留 ID，实际移动后再创建几何数据。
      // 仅按下而未移动时，失焦或隐藏页面保存不能产生零长度笔画。
      branch = { sourceId: id, strokeId: uid() };
      id = uid();
    }
    if (kind === "stroke" && id) {
      const s = glyph.strokes.find((s) => s.id === id)!;
      select(null, id);
      if (s.locked || s.nodes.some(nodeLocked)) return;
    }
    if (kind === "node" && id) movingIds ??= [id];
    if (movingIds && selectionLocked(glyph, movingIds)) {
      toast("请先解锁连接的笔画");
      return;
    }
    const transaction = beginTransaction();
    drag.current = {
      transaction,
      branch,
      pointerId: e.pointerId,
      kind,
      id,
      nodeIds: movingIds,
      deselectOnClick,
      sign,
      start: p,
      origin,
      before,
      moved: false,
    };
    stage.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: PE) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (d.transaction && api.getState().transaction?.id !== d.transaction) {
      drag.current = null;
      return;
    }
    if (d.kind === "pan") {
      setPan({
        x: d.pan!.x + e.clientX - d.start.x,
        y: d.pan!.y + e.clientY - d.start.y,
      });
      return;
    }
    if (d.kind === "marquee") {
      if (distance({ x: e.clientX, y: e.clientY }, d.clientStart!) > 3)
        d.moved = true;
      if (!d.moved) return;
      const p = point(e, false);
      const ids = selectableNodeIds(glyph).filter((id) => {
        const n = glyph.nodes[id];
        return (
          n.x >= Math.min(d.start.x, p.x) &&
          n.x <= Math.max(d.start.x, p.x) &&
          n.y >= Math.min(d.start.y, p.y) &&
          n.y <= Math.max(d.start.y, p.y)
        );
      });
      const selected = [
        ...new Set([
          ...(d.selection!.additive ? d.selection!.nodeIds : []),
          ...ids,
        ]),
      ];
      setMarquee({ start: d.start, end: p });
      // 框选自身的实时高亮保留手势，其他来源的选区切换会结束旧手势。
      d.selecting = true;
      selectNodes(selected, strokeForNode(selected.at(-1)));
      d.selecting = false;
      return;
    }
    let p = point(e);
    const anchor = d.kind === "node" ? d.start : d.origin;
    if (e.shiftKey && anchor && ["node", "branch"].includes(d.kind)) {
      const dx = p.x - anchor.x,
        dy = p.y - anchor.y,
        a = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4,
        len = Math.hypot(dx, dy);
      p = {
        x: clamp(anchor.x + Math.cos(a) * len, 0, 640),
        y: clamp(anchor.y + Math.sin(a) * len, 0, 640),
      };
    }
    if (distance(p, d.start) > 1) d.moved = true;
    if (!d.moved) return;
    if (d.kind === "node")
      update((g) => {
        const old = d.before.glyphs.find((g) => g.id === glyph.id)!;
        translateNodes(
          g,
          d.nodeIds!,
          { x: p.x - d.start.x, y: p.y - d.start.y },
          old,
        );
      }, d.transaction);
    if (d.kind === "branch") {
      const created = !!api
        .getState()
        .project.glyphs.find((g) => g.id === glyph.id)?.nodes[d.id!];
      const atOrigin = distance(p, d.origin!) <= 1;
      update((g) => {
        if (atOrigin) {
          if (g.nodes[d.id!]) {
            delete g.nodes[d.id!];
            g.strokes = g.strokes.filter((s) => s.id !== d.branch!.strokeId);
          }
          return;
        }
        if (!g.nodes[d.id!]) {
          g.nodes[d.id!] = {
            ...g.nodes[d.branch!.sourceId],
            id: d.id!,
            handle: undefined,
            handleIn: undefined,
          };
          g.strokes.push({
            ...newStroke([d.branch!.sourceId, d.id!], g.strokes.length),
            id: d.branch!.strokeId,
          });
        }
        Object.assign(g.nodes[d.id!], p);
      }, d.transaction);
      if (atOrigin && created) {
        const sourceStroke = d.before.glyphs
          .find((g) => g.id === glyph.id)
          ?.strokes.find(
            (s) => s.visible && s.nodes.includes(d.branch!.sourceId),
          );
        select(d.branch!.sourceId, sourceStroke?.id ?? null, d.transaction);
      } else if (!atOrigin && !created)
        select(d.id!, d.branch!.strokeId, d.transaction);
    }
    if (d.kind === "handle") {
      const current = api
        .getState()
        .project.glyphs.find((g) => g.id === glyph.id)!;
      const origin = d.before.glyphs.find((g) => g.id === glyph.id)!;
      update((g) => {
        // 使用起点控制柄，避免逐帧累积；回到按下位置时恢复完整几何。
        g.nodes[d.id!].handle = origin.nodes[d.id!].handle;
        g.nodes[d.id!].handleIn = origin.nodes[d.id!].handleIn;
        if (p.x === d.start.x && p.y === d.start.y) {
          reconcileStrokeGeometry(current, g, origin);
          return;
        }
        const n = g.nodes[d.id!],
          vector = { x: p.x - n.x, y: p.y - n.y },
          len = Math.hypot(vector.x, vector.y) || 1;
        const path = origin.strokes.find((s) => s.id === strokeId);
        const oppositeIndex =
          path &&
          (d.sign === -1
            ? path.nodes.indexOf(n.id)
            : path.nodes.lastIndexOf(n.id) - 1);
        const oppositeControl =
          path?.segments &&
          oppositeIndex !== undefined &&
          oppositeIndex >= 0 &&
          oppositeIndex < path.nodes.length - 1
            ? strokeControls(
                path.nodes.map((id) => origin.nodes[id]),
                path,
                oppositeIndex,
              )[d.sign === -1 ? 0 : 1]
            : undefined;
        if (n.mode === "symmetric") {
          n.handle = {
            x: vector.x * (d.sign || 1),
            y: vector.y * (d.sign || 1),
          };
          n.handleIn = undefined;
        } else if (d.sign === -1) {
          const opposite = oppositeControl
            ? distance(n, oppositeControl)
            : n.handle
              ? Math.hypot(n.handle.x, n.handle.y)
              : 50;
          n.handleIn = vector;
          n.handle = {
            x: (-vector.x / len) * opposite,
            y: (-vector.y / len) * opposite,
          };
        } else {
          const opposite = oppositeControl
            ? distance(n, oppositeControl)
            : n.handleIn
              ? Math.hypot(n.handleIn.x, n.handleIn.y)
              : n.handle
                ? Math.hypot(n.handle.x, n.handle.y)
                : 50;
          n.handle = vector;
          n.handleIn = {
            x: (-vector.x / len) * opposite,
            y: (-vector.y / len) * opposite,
          };
        }
        // 节点原值可能与目标相同，但当前边上的拆分控制柄仍需更新。
        reconcileStrokeGeometry(current, g, origin, [n.id]);
      }, d.transaction);
    }
    if (d.kind === "stroke")
      update((g) => {
        const s = g.strokes.find((s) => s.id === d.id)!,
          old = d.before.glyphs.find((g) => g.id === glyph.id)!,
          originals = s.nodes.map((id) => old.nodes[id]);
        const dx = clamp(
            p.x - d.start.x,
            -Math.min(...originals.map((n) => n.x)),
            640 - Math.max(...originals.map((n) => n.x)),
          ),
          dy = clamp(
            p.y - d.start.y,
            -Math.min(...originals.map((n) => n.y)),
            640 - Math.max(...originals.map((n) => n.y)),
          );
        s.nodes.forEach((id) => {
          g.nodes[id].x = old.nodes[id].x + dx;
          g.nodes[id].y = old.nodes[id].y + dy;
        });
      }, d.transaction);
  };
  const end = (e: PE, cancel = false) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (d.kind === "marquee") {
      clearDrag();
      if (cancel) selectNodes(d.selection!.nodeIds, d.selection!.strokeId);
      else if (!d.moved && !d.selection!.additive) select(null, null);
      return;
    }
    if (d.transaction && api.getState().transaction?.id !== d.transaction) {
      drag.current = null;
      return;
    }
    if (d.kind !== "pan") {
      if (cancel || (d.kind === "branch" && !d.moved)) {
        cancelTransaction(d.transaction!);
        select(null, null);
      } else if (d.moved) commitTransaction(d.transaction);
      else if (d.kind === "node" && d.deselectOnClick) {
        const ids = d.nodeIds!.filter((id) => id !== d.id);
        selectNodes(ids, strokeForNode(ids.at(-1)));
      }
    }
    if (d.transaction) commitTransaction(d.transaction);
    drag.current = null;
    if (stage.current?.hasPointerCapture(e.pointerId))
      stage.current.releasePointerCapture(e.pointerId);
  };
  const cancelDrag = () => {
    const d = drag.current;
    clearDrag();
    if (!d) return;
    if (d.kind === "marquee")
      selectNodes(d.selection!.nodeIds, d.selection!.strokeId);
    else if (d.transaction) cancelTransaction(d.transaction);
    else if (d.pan) setPan(d.pan);
  };
  const canvasDown = (e: PE) => {
    if (
      drag.current ||
      e.isPrimary === false ||
      (e.button !== 0 && e.button !== 1)
    )
      return;
    if (space || tool === "hand" || e.button === 1) {
      start(e, "pan");
      return;
    }
    if (modalOpen) return;
    if (tool === "select" && !preview && nodesVisible) {
      e.preventDefault();
      e.stopPropagation();
      commitTransaction();
      drag.current = {
        kind: "marquee",
        pointerId: e.pointerId,
        start: point(e, false),
        clientStart: { x: e.clientX, y: e.clientY },
        before: api.getState().project,
        moved: false,
        selection: {
          nodeIds,
          strokeId,
          additive: e.shiftKey || e.ctrlKey || e.metaKey,
        },
      };
      stage.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (tool !== "pen" || preview) {
      select(null, null);
      return;
    }
    const p = point(e),
      id = uid(),
      tail =
        penTail.current && glyph.nodes[penTail.current]
          ? penTail.current
          : null;
    const existing = tail
        ? glyph.strokes.find(
            (s) =>
              s.id === penStroke.current &&
              !s.locked &&
              s.nodes[s.nodes.length - 1] === tail,
          )
        : null,
      sid = existing?.id || uid();
    update((g) => {
      g.nodes[id] = {
        ...p,
        id,
        width: tail ? g.nodes[tail].width : 40,
        mode: "corner",
      };
      if (tail) {
        if (existing) g.strokes.find((s) => s.id === sid)!.nodes.push(id);
        else
          g.strokes.push({
            ...newStroke([tail, id], g.strokes.length),
            id: sid,
          });
      }
    });
    penTail.current = id;
    if (tail) penStroke.current = sid;
    select(id, tail ? sid : null);
  };
  const insert = (e: MouseEvent, s: Stroke) => {
    e.stopPropagation();
    if (s.locked || tool !== "select") return;
    const p = point(e);
    let best = Infinity,
      at = 1;
    for (let i = 0; i < s.nodes.length - 1; i++) {
      const a = glyph.nodes[s.nodes[i]],
        b = glyph.nodes[s.nodes[i + 1]],
        [c, d] = strokeControls(
          s.nodes.map((n) => glyph.nodes[n]),
          s,
          i,
        );
      for (let j = 0; j <= 20; j++) {
        const t = j / 20,
          v = 1 - t,
          q = {
            x:
              v ** 3 * a.x +
              3 * v * v * t * c.x +
              3 * v * t * t * d.x +
              t ** 3 * b.x,
            y:
              v ** 3 * a.y +
              3 * v * v * t * c.y +
              3 * v * t * t * d.y +
              t ** 3 * b.y,
          };
        if (distance(p, q) < best) {
          best = distance(p, q);
          at = i + 1;
        }
      }
    }
    const id = uid();
    update((g) => {
      g.nodes[id] = {
        ...p,
        id,
        width:
          (g.nodes[s.nodes[at - 1]].width + g.nodes[s.nodes[at]].width) / 2,
        mode: "corner",
      };
      g.strokes.find((item) => item.id === s.id)!.nodes.splice(at, 0, id);
    });
    select(id, s.id);
  };
  return {
    start,
    move,
    end,
    cancelDrag,
    canvasDown,
    insert,
    drag,
    penTail,
    nodeLocked,
    finishPen,
    marquee,
  };
}
