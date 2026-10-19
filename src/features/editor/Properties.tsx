import { useRef } from "react";
import { clamp, distance, uid } from "../../core/model";
import type { Glyph, Knot, Project, Stroke } from "../../core/model";
import { Icon } from "../../shared/components/Icon";
import { GlyphPreview } from "./GlyphPreview";
import { BrushControls } from "./BrushControls";
import { IconButton, NumberField, Section } from "../../shared/components/controls";
import type { useProject } from "../project/useProject";
type Props = {
  doc: ReturnType<typeof useProject>;
  glyph: Glyph;
  nodeId: string | null;
  strokeId: string | null;
  select: (node: string | null, stroke?: string | null) => void;
  showReference: boolean;
  setShowReference: (v: boolean) => void;
  remove: () => void;
  duplicate: () => void;
  toast: (s: string) => void;
  closeInspector: () => void;
};
export function Properties({
  doc,
  glyph,
  nodeId,
  strokeId,
  select,
  showReference,
  setShowReference,
  remove,
  duplicate,
  toast,
  closeInspector,
}: Props) {
  const node = nodeId ? glyph.nodes[nodeId] : undefined,
    stroke = glyph.strokes.find((s) => s.id === strokeId),
    nodeLocked = (id: string) =>
      glyph.strokes.some((s) => s.locked && s.nodes.includes(id)),
    locked = !!stroke?.locked || !!(node && nodeLocked(node.id));
  const widthGesture = useRef<Project | null>(null);
  const changeNode = (values: Partial<Knot>) => {
    if (node && !locked)
      doc.update((g) => Object.assign(g.nodes[node.id], values));
  };
  const changeStroke = (values: Partial<Stroke>) => {
    if (stroke && !stroke.locked)
      doc.update((g) =>
        Object.assign(
          g.strokes.find((s) => s.id === stroke.id)!,
          values,
        ),
      );
  };
  const symmetricHandle = () => {
    if (!node || !stroke) return { x: 60, y: 0 };
    const index = stroke.nodes.indexOf(node.id),
      before = glyph.nodes[stroke.nodes[Math.max(0, index - 1)]],
      after =
        glyph.nodes[stroke.nodes[Math.min(stroke.nodes.length - 1, index + 1)]],
      length = distance(before, after) || 1;
    return {
      x: ((after.x - before.x) / length) * 60,
      y: ((after.y - before.y) / length) * 60,
    };
  };
  const avgWidth = stroke
    ? stroke.nodes.reduce((sum, id) => sum + glyph.nodes[id].width, 0) /
      stroke.nodes.length
    : 40;
  const widthLocked = locked || !!(!node && stroke?.nodes.some(nodeLocked));
  const changeWidth = (width: number, record = true) => {
    if (widthLocked) return;
    doc.update((g) => {
      if (node) g.nodes[node.id].width = width;
      else if (stroke)
        [...new Set(stroke.nodes)].forEach((id) => {
          g.nodes[id].width = width;
        });
    }, record);
  };
  const transform = (kind: "flip" | "rotate") => {
    if (!stroke || stroke.locked || stroke.nodes.some(nodeLocked)) return;
    doc.update((g) => {
      const nodes = [...new Set(stroke.nodes)].map((id) => g.nodes[id]),
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
    doc.update((g) => {
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
    toast("节点已连接");
  };
  const disconnect = () => {
    if (!node || !stroke || locked) return;
    const id = uid();
    doc.update((g) => {
      g.nodes[id] = { ...g.nodes[node.id], id };
      g.strokes.find((s) => s.id === stroke.id)!.nodes = stroke.nodes.map(
        (n) => (n === node.id ? id : n),
      );
    });
    select(id, stroke.id);
    toast("已拆开当前笔画的连接");
  };
  return (
    <aside className="right-panel">
      <div className="property-heading">
        <span>属性</span>
        <Icon name="settings" size={16} />
        <span className="inspector-close">
          <IconButton icon="close" title="关闭属性" onClick={closeInspector} />
        </span>
      </div>
      <div className="properties-scroll">
        <Section
          title={node ? "节点" : stroke ? "笔画" : "字符"}
          trailing={
            <span className="selection-badge">
              {node
                ? `#${String(Object.keys(glyph.nodes).indexOf(node.id) + 1).padStart(2, "0")}`
                : stroke
                  ? `${stroke.nodes.length} 节点`
                  : `${glyph.strokes.length} 笔画`}
            </span>
          }
        >
          {node ? (
            <>
              <div className="field-grid">
                <NumberField
                  label="X"
                  value={node.x}
                  onChange={(x) => changeNode({ x })}
                  disabled={locked}
                />
                <NumberField
                  label="Y"
                  value={node.y}
                  onChange={(y) => changeNode({ y })}
                  disabled={locked}
                />
              </div>
              <label className="field-title spaced">节点类型</label>
              <div className="node-type-options">
                {(
                  [
                    { mode: "corner", icon: "corner", label: "转角" },
                    { mode: "smooth", icon: "smooth", label: "平滑" },
                    { mode: "symmetric", icon: "symmetric", label: "对称" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.mode}
                    className={node.mode === item.mode ? "active" : ""}
                    onClick={() =>
                      changeNode({
                        mode: item.mode,
                        handle:
                          item.mode === "symmetric"
                            ? symmetricHandle()
                            : undefined,
                        handleIn: undefined,
                      })
                    }
                    disabled={locked}
                  >
                    <Icon name={item.icon} size={22} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : stroke ? (
            <input
              className="text-field"
              aria-label="笔画名称"
              value={stroke.name}
              disabled={locked}
              onChange={(e) => changeStroke({ name: e.target.value })}
            />
          ) : (
            <div className="glyph-inspector-preview">
              <GlyphPreview glyph={glyph} brush={doc.project.brush} />
            </div>
          )}
        </Section>
        {(node || stroke) && (
          <Section
            title="笔画粗细"
            trailing={
              <span className="subtle-label">
                {node ? "当前节点" : "整条笔画"}
              </span>
            }
          >
            <div className="width-value">
              <NumberField
                label="宽度"
                value={node?.width || avgWidth}
                min={1}
                max={200}
                suffix="px"
                onChange={(width) => changeWidth(width)}
                disabled={widthLocked}
              />
              <span
                className="width-demo"
                style={{ height: clamp((node?.width || avgWidth) / 4, 2, 35) }}
              />
            </div>
            <input
              aria-label="笔画粗细"
              type="range"
              min="1"
              max="200"
              value={node?.width || avgWidth}
              disabled={widthLocked}
              onPointerDown={(e) => {
                widthGesture.current = doc.current.current;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onChange={(e) =>
                changeWidth(+e.target.value, !widthGesture.current)
              }
              onPointerUp={() => {
                if (
                  widthGesture.current &&
                  widthGesture.current !== doc.current.current
                )
                  doc.remember(widthGesture.current);
                widthGesture.current = null;
              }}
              onPointerCancel={() => {
                if (widthGesture.current)
                  doc.replace(widthGesture.current, false);
                widthGesture.current = null;
              }}
            />
            <div className="range-scale">
              <span>细</span>
              <span>粗</span>
            </div>
          </Section>
        )}
        {stroke && (
          <Section title="转折">
            <label className="field-title">转折方式</label>
            <div className="segmented shape-options">
              {(["miter", "round", "bevel"] as const).map((join, i) => (
                <button
                  key={join}
                  className={
                    (node?.join || stroke.join) === join ? "active" : ""
                  }
                  disabled={locked}
                  onClick={() =>
                    node ? changeNode({ join }) : changeStroke({ join })
                  }
                >
                  <svg width="24" height="24" viewBox="0 0 24 24">
                    <path
                      d="M4 20V5h16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="5"
                      strokeLinejoin={join}
                    />
                  </svg>
                  <span>{["尖角", "圆角", "斜角"][i]}</span>
                </button>
              ))}
            </div>
          </Section>
        )}
        <BrushControls doc={doc} />
        <Section title="外观">
          <div className="color-row">
            <label className="color-swatch" style={{ background: glyph.color }}>
              <input
                type="color"
                aria-label="笔画颜色"
                value={glyph.color}
                onChange={(e) =>
                  doc.update((g) => {
                    g.color = e.target.value;
                  })
                }
              />
            </label>
            <span>{glyph.color.toUpperCase()}</span>
            <span className="color-opacity">100%</span>
          </div>
          <div className="preset-colors">
            {[
              "#243d34",
              "#222222",
              "#7b281d",
              "#4562a6",
              "#88729b",
              "#b69250",
            ].map((color) => (
              <button
                key={color}
                className={glyph.color === color ? "selected" : ""}
                style={{ background: color }}
                title={color}
                aria-label={`使用颜色 ${color}`}
                onClick={() =>
                  doc.update((g) => {
                    g.color = color;
                  })
                }
              />
            ))}
          </div>
        </Section>
        {glyph.reference && (
          <Section
            title="原图"
            trailing={
              <IconButton
                icon={showReference ? "eye" : "eyeOff"}
                title={showReference ? "隐藏原图" : "显示原图"}
                onClick={() => setShowReference(!showReference)}
              />
            }
          >
            <div className="range-label">
              不透明度<b>{glyph.referenceOpacity}%</b>
            </div>
            <input
              aria-label="原图不透明度"
              type="range"
              min="0"
              max="100"
              value={glyph.referenceOpacity}
              onChange={(e) =>
                doc.update((g) => {
                  g.referenceOpacity = +e.target.value;
                })
              }
            />
          </Section>
        )}
        {stroke && (
          <Section title="操作">
            <div className="operation-grid">
              <button onClick={duplicate}>
                <Icon name="copy" size={16} />
                复制笔画
              </button>
              <button onClick={() => transform("flip")} disabled={widthLocked}>
                <Icon name="reflect" size={16} />
                水平翻转
              </button>
              <button
                onClick={() => transform("rotate")}
                disabled={widthLocked}
              >
                <Icon name="rotate" size={16} />
                旋转 90°
              </button>
              <button onClick={remove} disabled={locked}>
                <Icon name="trash" size={16} />
                {node ? "删除节点" : "删除笔画"}
              </button>
            </div>
            {node && (
              <button
                className="connect-button"
                disabled={locked}
                onClick={merge}
              >
                <Icon name="branch" size={16} />
                连接邻近节点
                <Icon name="arrow" size={14} />
              </button>
            )}
            {node && (
              <button
                className="connect-button"
                onClick={disconnect}
                disabled={
                  locked ||
                  glyph.strokes.filter((s) => s.nodes.includes(node.id))
                    .length < 2
                }
              >
                <Icon name="node" size={16} />
                拆开连接
                <Icon name="arrow" size={14} />
              </button>
            )}
          </Section>
        )}
        {!stroke && !node && (
          <Section title="操作">
            <div className="operation-grid">
              <button
                onClick={() => {
                  const copy = structuredClone(glyph);
                  copy.id = uid();
                  copy.name += " 副本";
                  doc.update((_, p) => {
                    p.glyphs.push(copy);
                    p.activeId = copy.id;
                  });
                }}
              >
                <Icon name="copy" size={16} />
                复制字符
              </button>
              <button onClick={remove}>
                <Icon name="trash" size={16} />
                删除字符
              </button>
            </div>
          </Section>
        )}
      </div>
      <div className="property-footer">
        <span className="local-dot" />
        <Icon name="save" size={14} />
        <span>本地手稿</span>
        <Icon name="check" size={14} />
      </div>
    </aside>
  );
}
