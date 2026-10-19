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

type Drag = {
  kind: "node" | "branch" | "handle" | "stroke" | "pan";
  id?: string;
  start: Point;
  origin?: Point;
  before: Project;
  moved: boolean;
  pan?: Point;
  sign?: number;
};

type Options = Pick<
  EditorCanvasProps,
  "doc" | "glyph" | "strokeId" | "select" | "tool" | "toast"
> & {
  space: boolean;
  preview: boolean;
  pan: Point;
  setPan: Dispatch<SetStateAction<Point>>;
  stage: RefObject<HTMLDivElement | null>;
  svg: RefObject<SVGSVGElement | null>;
};

export function useCanvasInteraction({
  doc,
  glyph,
  strokeId,
  select,
  tool,
  toast,
  space,
  preview,
  pan,
  setPan,
  stage,
  svg,
}: Options) {
  const drag = useRef<Drag | null>(null);
  const penTail = useRef<string | null>(null);
  const penStroke = useRef<string | null>(null);
  const stroke = glyph.strokes.find((s) => s.id === strokeId);
  const nodeLocked = (id: string) =>
    glyph.strokes.some((s) => s.locked && s.nodes.includes(id));

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
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    if (space || tool === "hand" || e.button === 1) kind = "pan";
    if (kind === "pan") {
      drag.current = {
        kind,
        start: { x: e.clientX, y: e.clientY },
        before: doc.current.current,
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
      select(
        id,
        (stroke?.visible && stroke.nodes.includes(id)
          ? stroke
          : glyph.strokes.find((s) => s.nodes.includes(id!) && s.visible))?.id,
      );
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
          doc.update((g) => {
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
    const before = doc.current.current,
      p = point(e),
      origin = id ? glyph.nodes[id] : undefined;
    if (kind === "branch" && id) {
      const nid = uid(),
        sid = uid(),
        source = glyph.nodes[id];
      doc.update((g) => {
        g.nodes[nid] = {
          ...source,
          id: nid,
          handle: undefined,
          handleIn: undefined,
        };
        g.strokes.push({ ...newStroke([id!, nid], g.strokes.length), id: sid });
      }, false);
      id = nid;
      select(nid, sid);
    }
    if (kind === "stroke" && id) {
      const s = glyph.strokes.find((s) => s.id === id)!;
      select(null, id);
      if (s.locked || s.nodes.some(nodeLocked)) return;
    }
    drag.current = { kind, id, sign, start: p, origin, before, moved: false };
    stage.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: PE) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pan") {
      setPan({
        x: d.pan!.x + e.clientX - d.start.x,
        y: d.pan!.y + e.clientY - d.start.y,
      });
      return;
    }
    let p = point(e);
    if (e.shiftKey && d.origin && ["node", "branch"].includes(d.kind)) {
      const dx = p.x - d.origin.x,
        dy = p.y - d.origin.y,
        a = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4,
        len = Math.hypot(dx, dy);
      p = {
        x: clamp(d.origin.x + Math.cos(a) * len, 0, 640),
        y: clamp(d.origin.y + Math.sin(a) * len, 0, 640),
      };
    }
    if (distance(p, d.start) > 1) d.moved = true;
    if (d.kind === "node" || d.kind === "branch")
      doc.update((g) => {
        Object.assign(g.nodes[d.id!], p);
      }, false);
    if (d.kind === "handle")
      doc.update((g) => {
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
      }, false);
    if (d.kind === "stroke")
      doc.update((g) => {
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
      }, false);
  };
  const end = (e: PE, cancel = false) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind !== "pan") {
      if (cancel || (d.kind === "branch" && !d.moved)) {
        doc.replace(d.before, false);
        select(null, null);
      } else if (d.moved) doc.remember(d.before);
    }
    drag.current = null;
    if (stage.current?.hasPointerCapture(e.pointerId))
      stage.current.releasePointerCapture(e.pointerId);
  };
  const canvasDown = (e: PE) => {
    if (e.button !== 0 && e.button !== 1) return;
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
    doc.update((g) => {
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
    doc.update((g) => {
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
    start, move, end, canvasDown, insert, drag, penTail, nodeLocked, finishPen,
  };
}
