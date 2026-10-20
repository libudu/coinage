import { useEffect, useRef } from "react";
import type {
  Dispatch,
  MouseEvent,
  PointerEvent as PE,
  RefObject,
  SetStateAction,
} from "react";
import { clamp, controls, distance } from "../../core/geometry";
import { newStroke, uid } from "../../core/model";
import type { Point, Project, Stroke } from "../../core/model";
import type { EditorCanvasProps } from "./canvasTypes";
import { selectionLocked, translateNodes } from "./nodeSelection";
import { useActiveGlyph, useProject, useProjectActions, useProjectApi } from "../project/useProject";
import type { TransactionId } from "../project/projectStore";

type Drag = {
  kind: "node" | "branch" | "handle" | "stroke" | "pan";
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
};

type Options = Pick<
  EditorCanvasProps,
  "toast"
> & {
  space: boolean;
  preview: boolean;
  pan: Point;
  setPan: Dispatch<SetStateAction<Point>>;
  stage: RefObject<HTMLDivElement | null>;
  svg: RefObject<SVGSVGElement | null>;
};

export function useCanvasInteraction({
  toast,
  space,
  preview,
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
  const { update, select, selectNodes, beginTransaction, commitTransaction, cancelTransaction } = useProjectActions();
  const drag = useRef<Drag | null>(null);
  useEffect(() => {
    const finish = () => {
      if (drag.current?.transaction) commitTransaction(drag.current.transaction);
      drag.current = null;
    };
    window.addEventListener("blur", finish);
    return () => { window.removeEventListener("blur", finish); finish(); };
  }, [commitTransaction]);
  const penTail = useRef<string | null>(null);
  const penStroke = useRef<string | null>(null);
  const stroke = glyph.strokes.find((s) => s.id === strokeId);
  const nodeLocked = (id: string) =>
    glyph.strokes.some((s) => s.locked && s.nodes.includes(id));
  const strokeForNode = (id: string | undefined) => id
    ? (stroke?.visible && stroke.nodes.includes(id) ? stroke
      : glyph.strokes.find((s) => s.visible && s.nodes.includes(id)))?.id ?? null
    : null;

  const finishPen = () => {
    penTail.current = null;
    penStroke.current = null;
  };
  useEffect(() => {
    finishPen();
  }, [glyph.id, tool]);
  const point = (e: { clientX: number; clientY: number }): Point => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: clamp(p.x, 0, 640), y: clamp(p.y, 0, 640) };
  };
  const start = (e: PE, kind: Drag["kind"], id?: string, sign?: number) => {
    let movingIds: string[] | undefined;
    let deselectOnClick = false;
    if (drag.current || e.isPrimary === false || (e.button !== 0 && e.button !== 1)) return;
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
    drag.current = { transaction, branch, pointerId: e.pointerId, kind, id, nodeIds: movingIds, deselectOnClick, sign, start: p, origin, before, moved: false };
    stage.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: PE) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (d.transaction && api.getState().transaction?.id !== d.transaction) { drag.current = null; return; }
    if (d.kind === "pan") {
      setPan({
        x: d.pan!.x + e.clientX - d.start.x,
        y: d.pan!.y + e.clientY - d.start.y,
      });
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
        translateNodes(g, d.nodeIds!, { x: p.x - d.start.x, y: p.y - d.start.y }, old);
      }, d.transaction);
    if (d.kind === "branch") {
      const created = !!api.getState().project.glyphs.find((g) => g.id === glyph.id)?.nodes[d.id!];
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
          g.nodes[d.id!] = { ...g.nodes[d.branch!.sourceId], id: d.id!, handle: undefined, handleIn: undefined };
          g.strokes.push({ ...newStroke([d.branch!.sourceId, d.id!], g.strokes.length), id: d.branch!.strokeId });
        }
        Object.assign(g.nodes[d.id!], p);
      }, d.transaction);
      if (atOrigin && created) {
        const sourceStroke = d.before.glyphs.find((g) => g.id === glyph.id)?.strokes
          .find((s) => s.visible && s.nodes.includes(d.branch!.sourceId));
        select(d.branch!.sourceId, sourceStroke?.id ?? null, d.transaction);
      }
      else if (!atOrigin && !created) select(d.id!, d.branch!.strokeId, d.transaction);
    }
    if (d.kind === "handle")
      update((g) => {
        const n = g.nodes[d.id!],
          vector = { x: p.x - n.x, y: p.y - n.y },
          len = Math.hypot(vector.x, vector.y) || 1;
        if (n.mode === "symmetric") {
          n.handle = {
            x: vector.x * (d.sign || 1),
            y: vector.y * (d.sign || 1),
          };
          n.handleIn = undefined;
        } else if (d.sign === -1) {
          const opposite = n.handle ? Math.hypot(n.handle.x, n.handle.y) : 50;
          n.handleIn = vector;
          n.handle = {
            x: (-vector.x / len) * opposite,
            y: (-vector.y / len) * opposite,
          };
        } else {
          const opposite = n.handleIn
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
      }, d.transaction);
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
    drag.current = null;
    if (!d) return;
    if (d.transaction) cancelTransaction(d.transaction);
    else if (d.pan) setPan(d.pan);
    if (stage.current?.hasPointerCapture(d.pointerId)) stage.current.releasePointerCapture(d.pointerId);
  };
  const canvasDown = (e: PE) => {
    if (drag.current || e.isPrimary === false || (e.button !== 0 && e.button !== 1)) return;
    if (space || tool === "hand" || e.button === 1) {
      start(e, "pan");
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
        [c, d] = controls(
          s.nodes.map((n) => glyph.nodes[n]),
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
    start, move, end, cancelDrag, canvasDown, insert, drag, penTail, nodeLocked, finishPen,
  };
}
