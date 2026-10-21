import { ArtboardGrid } from "../../shared/components/ArtboardGrid";
import {
  centerPath,
  distance,
  outlinePath,
  strokeControls,
} from "../../core/geometry";
import type { Glyph, Point } from "../../core/model";
import type { BrushDefaults } from "../../core/brush";
import type { Tool } from "./canvasTypes";
import type { useCanvasInteraction } from "./useCanvasInteraction";

type Props = {
  glyph: Glyph;
  nodeId: string | null;
  nodeIds: string[];
  strokeId: string | null;
  tool: Tool;
  showReference: boolean;
  brush?: BrushDefaults;
  color?: string;
  scale: number;
  grid: boolean;
  preview: boolean;
  nodesVisible: boolean;
  interaction: Pick<
    ReturnType<typeof useCanvasInteraction>,
    "start" | "canvasDown" | "insert" | "penTail" | "nodeLocked"
  >;
};

export function GlyphArtwork({
  glyph,
  nodeId,
  nodeIds,
  strokeId,
  tool,
  showReference,
  brush,
  color = glyph.color,
  scale,
  grid,
  preview,
  nodesVisible,
  interaction,
}: Props) {
  const { start, canvasDown, insert, penTail, nodeLocked } = interaction;
  const node = nodeIds.length === 1 && nodeId ? glyph.nodes[nodeId] : undefined;
  const selectedIds = new Set(nodeIds);
  const stroke = glyph.strokes.find((s) => s.id === strokeId);
  const visibleIds = new Set(
    glyph.strokes.filter((s) => s.visible).flatMap((s) => s.nodes),
  );
  const usedIds = new Set(glyph.strokes.flatMap((s) => s.nodes));
  Object.keys(glyph.nodes).forEach((id) => {
    if (!usedIds.has(id)) visibleIds.add(id);
  });
  const outlines = glyph.strokes
    .filter((s) => s.visible)
    .map((s) => ({ stroke: s, path: outlinePath(glyph, s, brush) }));
  if (penTail.current && glyph.nodes[penTail.current])
    visibleIds.add(penTail.current);
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
  let incomingHandle =
    node?.mode === "smooth" && node.handleIn
      ? node.handleIn
      : handle
        ? { x: -handle.x, y: -handle.y }
        : null;
  if (node && node.mode !== "corner" && stroke?.segments) {
    const nodes = stroke.nodes.map((id) => glyph.nodes[id]);
    const out = stroke.nodes.indexOf(node.id),
      incoming = stroke.nodes.lastIndexOf(node.id);
    if (out < nodes.length - 1) {
      const p = strokeControls(nodes, stroke, out)[0];
      handle = { x: p.x - node.x, y: p.y - node.y };
    }
    if (incoming > 0) {
      const p = strokeControls(nodes, stroke, incoming - 1)[1];
      incomingHandle = { x: p.x - node.x, y: p.y - node.y };
    }
  }
  return (
    <>
      <rect width="640" height="640" fill="#fffefa" />
      {grid && !preview && <ArtboardGrid />}
      {glyph.reference && showReference && (
        <image
          href={glyph.reference}
          width="640"
          height="640"
          opacity={glyph.referenceOpacity / 100}
          pointerEvents="none"
        />
      )}
      <g fill={color}>
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
                  strokeId === s.id ? undefined : `${3 / scale} ${3 / scale}`
                }
                pointerEvents="none"
              />
            ))}
          {[...visibleIds].map((id) => {
            const n = glyph.nodes[id];
            if (!n) return null;
            const selected = selectedIds.has(id),
              size = (selected ? 9 : 7) / scale;
            return (
              <g
                key={id}
                data-node-id={id}
                data-selected={selected}
                className="node-target"
                onPointerDown={(e) => start(e, "node", id)}
              >
                <circle cx={n.x} cy={n.y} r={10 / scale} fill="transparent" />
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
                        onPointerDown={(e) => start(e, "handle", node.id, sign)}
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
    </>
  );
}
