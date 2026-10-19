import { useEffect, useRef, useState } from "react";
import type { PointerEvent as PE } from "react";
import {
  centerPath,
  clamp,
  controls,
  distance,
  newStroke,
  outlinePath,
  uid,
} from "../../core/model";
import type { Glyph, Knot, Point, Project, Stroke } from "../../core/model";
import { Icon } from "../../shared/components/Icon";
import { IconButton } from "../../shared/components/controls";
import type { useProject } from "../project/useProject";
export type Tool = "select" | "pen" | "branch" | "hand";
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
type Props = {
  doc: ReturnType<typeof useProject>;
  glyph: Glyph;
  nodeId: string | null;
  strokeId: string | null;
  select: (node: string | null, stroke?: string | null) => void;
  tool: Tool;
  setTool: (t: Tool) => void;
  upload: () => void;
  importFile: (f: File) => void;
  toast: (s: string) => void;
  showReference: boolean;
  modalOpen: boolean;
  toggleInspector: () => void;
  openContextMenu: (
    position: Point,
    node: string | null,
    stroke: string | null,
  ) => void;
};
export function EditorCanvas({
  doc,
  glyph,
  nodeId,
  strokeId,
  select,
  tool,
  setTool,
  upload,
  importFile,
  toast,
  showReference,
  modalOpen,
  toggleInspector,
  openContextMenu,
}: Props) {
  const [grid, setGrid] = useState(true),
    [nodesVisible, setNodesVisible] = useState(true),
    [preview, setPreview] = useState(false),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [fit, setFit] = useState(0.8),
    [space, setSpace] = useState(false),
    [dragOver, setDragOver] = useState(false);
  const stage = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null),
    drag = useRef<Drag | null>(null),
    penTail = useRef<string | null>(null),
    penStroke = useRef<string | null>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 700 });
  const node = nodeId ? glyph.nodes[nodeId] : undefined,
    stroke = glyph.strokes.find((s) => s.id === strokeId),
    scale = fit * zoom;
  const visibleIds = new Set(
    glyph.strokes.filter((s) => s.visible).flatMap((s) => s.nodes),
  );
  const outlines = glyph.strokes
    .filter((s) => s.visible)
    .map((s) => ({ stroke: s, path: outlinePath(glyph, s, doc.project.brush) }));
  if (penTail.current && glyph.nodes[penTail.current])
    visibleIds.add(penTail.current);
  const nodeLocked = (id: string) =>
    glyph.strokes.some((s) => s.locked && s.nodes.includes(id));
  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  useEffect(() => {
    reset();
    penTail.current = null;
    penStroke.current = null;
  }, [glyph.id]);
  useEffect(() => {
    penTail.current = null;
    penStroke.current = null;
    setPreview(false);
    if (tool !== "hand") setNodesVisible(true);
  }, [tool]);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
      setFit(
        Math.max(
          0.2,
          Math.min(
            (entry.contentRect.width -
              (entry.contentRect.width < 500 ? 88 : 130)) /
              640,
            (entry.contentRect.height - 145) / 640,
            1.25,
          ),
        ),
      );
    });
    observer.observe(stage.current);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey)
        setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.08 : 0.92), 0.25, 4));
      else setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    };
    const el = stage.current;
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", wheel);
    };
  }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        modalOpen ||
        (e.target as HTMLElement).closest(
          "input, textarea, select, [contenteditable]",
        ) ||
        e.ctrlKey ||
        e.metaKey
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpace(true);
      }
      if (e.key === "Escape") {
        penTail.current = null;
        penStroke.current = null;
        setTool("select");
        setPreview(false);
      }
      const tools: Record<string, Tool> = {
        v: "select",
        p: "pen",
        b: "branch",
        h: "hand",
      };
      if (tools[e.key.toLowerCase()]) setTool(tools[e.key.toLowerCase()]);
      if (e.key.toLowerCase() === "g") setGrid((v) => !v);
      if (e.key === "Tab") {
        e.preventDefault();
        setPreview((v) => !v);
      }
      if (e.key === "0") reset();
      if (e.key === "+" || e.key === "=")
        setZoom((z) => clamp(z * 1.2, 0.25, 4));
      if (e.key === "-") setZoom((z) => clamp(z / 1.2, 0.25, 4));
    };
    const up = (e: KeyboardEvent) => {
        if (e.code === "Space") setSpace(false);
      },
      blur = () => setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [modalOpen, setTool]);
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
  const insert = (e: React.MouseEvent, s: Stroke) => {
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
  let handle: Point | null = null;
  if (node && node.mode !== "corner" && stroke) {
    if (node.handle) handle = node.handle;
    else {
      const i = stroke.nodes.indexOf(node.id),
        a = glyph.nodes[stroke.nodes[Math.max(0, i - 1)]],
        b = glyph.nodes[stroke.nodes[Math.min(stroke.nodes.length - 1, i + 1)]],
        len = distance(a, b) || 1;
      handle = { x: ((b.x - a.x) / len) * 50, y: ((b.y - a.y) / len) * 50 };
    }
  }
  const incomingHandle =
    node?.mode === "smooth" && node.handleIn
      ? node.handleIn
      : handle
        ? { x: -handle.x, y: -handle.y }
        : null;
  const rulerStep = scale > 1.2 ? 40 : scale > 0.6 ? 80 : 160,
    rulerValues = Array.from({ length: 61 }, (_, i) => (i - 20) * rulerStep);
  const rulerX = (viewport.width - 640 * scale) / 2 + 11 + pan.x - 22,
    rulerY = (viewport.height - 640 * scale) / 2 + pan.y - 22;
  return (
    <main className="editor">
      <div className="editor-topbar">
        <div className="breadcrumb">
          <span>字符集</span>
          <Icon name="chevron" size={12} />
          <input
            aria-label="字符名称"
            value={glyph.name}
            onChange={(e) =>
              doc.update((g) => {
                g.name = e.target.value;
              }, false)
            }
          />
        </div>
        <div className="view-actions">
          <button
            className="view-button inspector-toggle"
            onClick={toggleInspector}
          >
            <Icon name="settings" size={16} />
            属性
          </button>
          <button
            className={`view-button ${preview ? "active" : ""}`}
            onClick={() => setPreview((v) => !v)}
          >
            <Icon name="eye" size={16} />
            预览
          </button>
          <span className="mini-divider" />
          <IconButton
            icon="grid"
            title="网格 G"
            active={grid}
            onClick={() => setGrid((v) => !v)}
          />
          <IconButton
            icon="node"
            title="显示节点"
            active={nodesVisible}
            onClick={() => {
              setNodesVisible((v) => !v);
              setPreview(false);
            }}
          />
        </div>
      </div>
      <div
        ref={stage}
        className={`canvas-stage tool-${tool} ${space ? "space-pan" : ""} ${dragOver ? "drag-over" : ""}`}
        onPointerMove={move}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.button !== 1) return;
          if (e.target === e.currentTarget) {
            if (space || tool === "hand" || e.button === 1) start(e, "pan");
            else select(null, null);
          }
        }}
        onContextMenu={(e) => {
          if ((e.target as Element).closest("button, input")) return;
          e.preventDefault();
          if (preview || drag.current) return;
          const target = e.target as Element;
          const targetNode =
            target.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null;
          const targetStroke = targetNode
            ? (stroke?.visible && stroke.nodes.includes(targetNode)
                ? stroke
                : glyph.strokes.find((s) => s.visible && s.nodes.includes(targetNode)))
                ?.id ?? null
            : target.closest("[data-stroke-id]")?.getAttribute("data-stroke-id") ?? null;
          openContextMenu({ x: e.clientX, y: e.clientY }, targetNode, targetStroke);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files[0]) importFile(e.dataTransfer.files[0]);
        }}
      >
        <div
          className="ruler ruler-horizontal"
          aria-hidden="true"
          style={{
            backgroundPositionX: rulerX,
            backgroundSize: `${(rulerStep * scale) / 8}px 4px`,
            backgroundImage:
              "linear-gradient(90deg, #dce1d4 1px, transparent 1px)",
          }}
        >
          {rulerValues.map((value) => (
            <span
              key={value}
              style={{ position: "absolute", left: rulerX + value * scale }}
            >
              {value}
            </span>
          ))}
        </div>
        <div
          className="ruler ruler-vertical"
          aria-hidden="true"
          style={{
            backgroundPositionY: rulerY,
            backgroundSize: `4px ${(rulerStep * scale) / 8}px`,
            backgroundImage:
              "linear-gradient(0deg, #dce1d4 1px, transparent 1px)",
          }}
        >
          {rulerValues.map((value) => (
            <span
              key={value}
              style={{ position: "absolute", top: rulerY + value * scale }}
            >
              {value}
            </span>
          ))}
        </div>
        <span className="ruler-origin" />
        <div className="canvas-tools">
          {(
            [
              { id: "select", icon: "cursor", label: "选择 V" },
              { id: "pen", icon: "pen", label: "钢笔 P" },
              {
                id: "branch",
                icon: "branch",
                label: "拉出笔画 B / Alt+拖动节点",
              },
              { id: "hand", icon: "hand", label: "移动画布 H / 空格" },
            ] as const
          ).map((t) => (
            <IconButton
              key={t.id}
              icon={t.icon}
              title={t.label}
              active={tool === t.id}
              onClick={() => setTool(t.id)}
            />
          ))}
          <span className="tool-divider" />
          <IconButton icon="image" title="导入图片" onClick={upload} />
        </div>
        <div
          className="artboard-wrap"
          style={{
            width: 640 * scale,
            height: 640 * scale,
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
          }}
        >
          <div className="artboard-label">
            <span>{glyph.name}</span>
            <span>640 × 640</span>
          </div>
          <svg
            ref={svg}
            className={`artboard ${preview ? "is-preview" : ""}`}
            viewBox="0 0 640 640"
            onPointerDown={canvasDown}
            aria-label="字形编辑画布"
          >
            <defs>
              <pattern
                id="dot-grid"
                width="20"
                height="20"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="0" cy="0" r=".75" fill="#b7bdb4" />
              </pattern>
            </defs>
            <rect width="640" height="640" fill="#fffefa" />
            {grid && !preview && (
              <g pointerEvents="none">
                <rect
                  width="640"
                  height="640"
                  fill="url(#dot-grid)"
                  opacity=".65"
                />
                <rect
                  x="64"
                  y="64"
                  width="512"
                  height="512"
                  fill="none"
                  stroke="#cbd0c3"
                  strokeWidth=".8"
                  strokeDasharray="5 5"
                />
                <path
                  d="M320 0V640M0 320H640M64 64 576 576M576 64 64 576"
                  stroke="#d3d6ca"
                  strokeWidth=".65"
                  strokeDasharray="4 5"
                />
              </g>
            )}
            {glyph.reference && showReference && (
              <image
                href={glyph.reference}
                width="640"
                height="640"
                opacity={glyph.referenceOpacity / 100}
                pointerEvents="none"
              />
            )}
            <g fill={glyph.color}>
              <path
                d={outlines.map(({ path }) => path).join(" ")}
                pointerEvents="none"
              />
              {outlines.map(({ stroke: s, path }) => (
                <path
                  key={s.id}
                  data-stroke-id={s.id}
                  d={path}
                  fill="transparent"
                  className={s.locked ? "locked-stroke" : "editable-stroke"}
                  onPointerDown={(e) => {
                    if (tool === "pen" || preview) {
                      canvasDown(e);
                      return;
                    }
                    start(e, "stroke", s.id);
                  }}
                  onDoubleClick={(e) => insert(e, s)}
                />
              ))}
            </g>
            {!preview && nodesVisible && (
              <g>
                {glyph.strokes
                  .filter((s) => s.visible)
                  .map((s) => (
                    <path
                      key={s.id}
                      d={centerPath(glyph, s)}
                      fill="none"
                      stroke={strokeId === s.id ? "#a8d99a" : "#6f9c85"}
                      strokeOpacity={strokeId === s.id ? 1 : 0.6}
                      strokeWidth={1 / scale}
                      strokeDasharray={
                        strokeId === s.id
                          ? undefined
                          : `${3 / scale} ${3 / scale}`
                      }
                      pointerEvents="none"
                    />
                  ))}
                {[...visibleIds].map((id) => {
                  const n = glyph.nodes[id];
                  if (!n) return null;
                  const selected = id === nodeId,
                    size = (selected ? 9 : 7) / scale;
                  return (
                    <g
                      key={id}
                      data-node-id={id}
                      className="node-target"
                      onPointerDown={(e) => start(e, "node", id)}
                    >
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={10 / scale}
                        fill="transparent"
                      />
                      {n.mode === "corner" ? (
                        <rect
                          x={n.x - size / 2}
                          y={n.y - size / 2}
                          width={size}
                          height={size}
                          rx={selected ? 1 / scale : 0}
                          fill={selected ? "#c5ef91" : "#fffefa"}
                          stroke={selected ? "#224f3d" : "#668677"}
                          strokeWidth={1.4 / scale}
                        />
                      ) : (
                        <circle
                          cx={n.x}
                          cy={n.y}
                          r={size / 2}
                          fill={selected ? "#c5ef91" : "#fffefa"}
                          stroke="#476e59"
                          strokeWidth={1.5 / scale}
                        />
                      )}
                    </g>
                  );
                })}
                {node && !nodeLocked(node.id) && visibleIds.has(node.id) && (
                  <g>
                    {handle &&
                      [-1, 1].map((sign) => {
                        const h = sign < 0 ? incomingHandle! : handle!;
                        return (
                          <g key={sign}>
                            <path
                              d={`M${node.x},${node.y} L${node.x + h.x},${node.y + h.y}`}
                              stroke="#739b69"
                              strokeWidth={1 / scale}
                            />
                            <circle
                              cx={node.x + h.x}
                              cy={node.y + h.y}
                              r={4 / scale}
                              fill="#fffefa"
                              stroke="#547a48"
                              strokeWidth={1.3 / scale}
                              className="handle-target"
                              data-node-id={node.id}
                              onPointerDown={(e) =>
                                start(e, "handle", node.id, sign)
                              }
                            />
                          </g>
                        );
                      })}
                    <g
                      className="branch-handle"
                      data-node-id={node.id}
                      onPointerDown={(e) => start(e, "branch", node.id)}
                    >
                      <path
                        d={`M${node.x + 6 / scale},${node.y - 6 / scale} l${20 / scale},${-20 / scale}`}
                        stroke="#668b64"
                        strokeDasharray={`${3 / scale} ${3 / scale}`}
                        strokeWidth={1 / scale}
                      />
                      <circle
                        cx={node.x + 32 / scale}
                        cy={node.y - 32 / scale}
                        r={10 / scale}
                        fill="#f3f9e9"
                        stroke="#72966c"
                        strokeWidth={1 / scale}
                      />
                      <path
                        d={`M${node.x + 28 / scale},${node.y - 32 / scale} h${8 / scale} M${node.x + 32 / scale},${node.y - 36 / scale} v${8 / scale}`}
                        stroke="#426e46"
                        strokeWidth={1.3 / scale}
                      />
                      <title>拖动加号，拉出新笔画</title>
                    </g>
                  </g>
                )}
              </g>
            )}
          </svg>
          <div className="artboard-corner corner-tl" />
          <div className="artboard-corner corner-br" />
        </div>
        {dragOver && (
          <div className="drop-message">
            <Icon name="upload" size={32} />
            <span>松开以导入图片</span>
          </div>
        )}
        <div className="canvas-bottom">
          <div className="mode-indicator">
            <span className="mode-dot" />
            {preview
              ? "预览模式"
              : tool === "select"
                ? "节点编辑"
                : tool === "pen"
                  ? "绘制笔画"
                  : tool === "branch"
                    ? "拉出笔画"
                    : "移动画布"}
          </div>
          <div className="zoom-control">
            <IconButton
              icon="minus"
              title="缩小"
              onClick={() => setZoom((z) => clamp(z / 1.2, 0.25, 4))}
            />
            <button className="zoom-value" onClick={reset}>
              {Math.round(zoom * 100)}%
            </button>
            <IconButton
              icon="plus"
              title="放大"
              onClick={() => setZoom((z) => clamp(z * 1.2, 0.25, 4))}
            />
            <span />
            <IconButton icon="fit" title="适应画布 0" onClick={reset} />
          </div>
        </div>
      </div>
      <footer className="editor-status">
        <span>
          <span className="status-green-dot" />
          {glyph.strokes.length} 笔画<span className="status-separator">/</span>
          {Object.keys(glyph.nodes).length} 节点
        </span>
        <span>
          {node
            ? `X ${Math.round(node.x)}　Y ${Math.round(node.y)}`
            : "640 × 640 px"}
          <span className="status-separator">·</span>SVG
        </span>
      </footer>
    </main>
  );
}
