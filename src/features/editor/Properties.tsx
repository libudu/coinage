import { RangeInput } from "../../shared/components/RangeInput";
import { useRef } from "react";
import { clamp, distance } from "../../core/geometry";
import type { Glyph, Knot, Project, Stroke } from "../../core/model";
import { Icon } from "../../shared/components/Icon";
import { BrushControls } from "./BrushControls";
import { IconButton, NumberField, Section, segmentedStateClasses } from "../../shared/components/controls";
import type { useProject } from "../project/useProject";
import { selectionLocked, translateNodes } from "./nodeSelection";
type Props = {
  doc: ReturnType<typeof useProject>;
  glyph: Glyph;
  nodeId: string | null;
  nodeIds: string[];
  strokeId: string | null;
  showReference: boolean;
  setShowReference: (v: boolean) => void;
  closeInspector: () => void;
};
export function Properties({
  doc,
  glyph,
  nodeId,
  nodeIds,
  strokeId,
  showReference,
  setShowReference,
  closeInspector,
}: Props) {
  const node = nodeId ? glyph.nodes[nodeId] : undefined,
    nodes = nodeIds.map((id) => glyph.nodes[id]).filter(Boolean),
    multiple = nodes.length > 1,
    stroke = glyph.strokes.find((s) => s.id === strokeId),
    nodeLocked = (id: string) =>
      glyph.strokes.some((s) => s.locked && s.nodes.includes(id)),
    locked = nodes.length ? selectionLocked(glyph, nodeIds) : !!stroke?.locked;
  const position = {
    x: nodes.reduce((sum, n) => sum + n.x, 0) / (nodes.length || 1),
    y: nodes.reduce((sum, n) => sum + n.y, 0) / (nodes.length || 1),
  };
  const widthGesture = useRef<Project | null>(null);
  const changeNode = (values: Partial<Knot>) => {
    if (nodes.length && !locked)
      doc.update((g) => {
        if (values.x !== undefined || values.y !== undefined)
          translateNodes(g, nodeIds, {
            x: values.x === undefined ? 0 : values.x - position.x,
            y: values.y === undefined ? 0 : values.y - position.y,
          });
        else nodes.forEach((n) => Object.assign(g.nodes[n.id], values,
          values.mode === "symmetric" ? { handle: symmetricHandle(n) } : {}));
      });
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
  const symmetricHandle = (n: Knot) => {
    const path = stroke?.nodes.includes(n.id) ? stroke : glyph.strokes.find((s) => s.nodes.includes(n.id));
    if (!path) return { x: 60, y: 0 };
    const index = path.nodes.indexOf(n.id),
      before = glyph.nodes[path.nodes[Math.max(0, index - 1)]],
      after =
        glyph.nodes[path.nodes[Math.min(path.nodes.length - 1, index + 1)]],
      length = distance(before, after) || 1;
    return {
      x: ((after.x - before.x) / length) * 60,
      y: ((after.y - before.y) / length) * 60,
    };
  };
  const avgWidth = nodes.length
    ? nodes.reduce((sum, n) => sum + n.width, 0) / nodes.length
    : stroke
    ? stroke.nodes.reduce((sum, id) => sum + glyph.nodes[id].width, 0) /
      stroke.nodes.length
    : 40;
  const widthLocked = locked || !!(!node && stroke?.nodes.some(nodeLocked));
  const changeWidth = (width: number, record = true) => {
    if (widthLocked) return;
    doc.update((g) => {
      if (nodes.length) nodeIds.forEach((id) => { g.nodes[id].width = width; });
      else if (stroke)
        [...new Set(stroke.nodes)].forEach((id) => {
          g.nodes[id].width = width;
        });
    }, record);
  };
  return (
    <aside className="right-panel bg-[var(--panel)] min-h-0 flex flex-col border-l [border-left-style:solid]
      border-l-[var(--border)] compact:hidden compact:[.inspector-open_&]:flex
      compact:[.inspector-open_&]:absolute compact:[.inspector-open_&]:top-0 compact:[.inspector-open_&]:right-0
      compact:[.inspector-open_&]:bottom-0 compact:[.inspector-open_&]:w-[238px]
      compact:[.inspector-open_&]:z-[25] compact:[.inspector-open_&]:shadow-[-12px_0_35px_#203d221a]">
      <div className="property-heading h-[51px] shrink-0 flex items-center justify-between py-0 px-[21px] border-b
        [border-bottom-style:solid] border-b-[var(--border)] text-[12px] font-semibold [&>svg]:text-[#929c86]
        tablet:py-0 tablet:px-[15px] compact:[&>svg]:hidden">
        <span>属性</span>
        <Icon name="settings" size={16} />
        <span className="inspector-close hidden compact:block">
          <IconButton icon="close" title="关闭属性" onClick={closeInspector} />
        </span>
      </div>
      <div className="properties-scroll flex-1 overflow-auto min-h-0">
        <Section
          title={node ? "节点" : stroke ? "笔画" : "字符"}
          trailing={
            <span className="selection-badge py-[3px] px-[7px] text-[9px] bg-[#eff2e8] text-[#839171] border [border-style:solid]
              border-[#e3e8da] rounded-[4px] [font-family:ui-monospace,_'Microsoft_YaHei',_monospace]">
              {multiple ? `${nodes.length} 节点` : node
                ? `#${String(Object.keys(glyph.nodes).indexOf(node.id) + 1).padStart(2, "0")}`
                : stroke
                  ? `${stroke.nodes.length} 节点`
                  : `${glyph.strokes.length} 笔画 / ${Object.keys(glyph.nodes).length} 节点`}
            </span>
          }
        >
          {node ? (
            <>
              <div className="field-grid grid grid-cols-[1fr_1fr] gap-[9px]">
                <NumberField
                  label="X"
                  value={position.x}
                  onChange={(x) => changeNode({ x })}
                  disabled={locked}
                />
                <NumberField
                  label="Y"
                  value={position.y}
                  onChange={(y) => changeNode({ y })}
                  disabled={locked}
                />
              </div>
              <label className="field-title spaced block text-[#77856a] text-[10px] mb-[10px] mt-[19px]">节点类型</label>
              <div className="node-type-options grid grid-cols-[repeat(3,_1fr)] gap-[7px] [&>button]:flex [&>button]:flex-col
                [&>button]:items-center [&>button]:justify-center [&>button]:gap-[8px] [&>button]:h-[60px]
                [&>button]:border [&>button]:[border-style:solid] [&>button]:border-[#e1e7d9] [&>button]:rounded-[6px]
                [&>button]:text-[#91a082] [&>button]:text-[10px] [&>button]:bg-[#f9fbf4] [&>button.active]:border-[#adc28b] [&>button.active]:bg-[#e9f0dc] [&>button.active]:text-[#55743e]! [&>button:hover]:bg-[#eff4e6] [&>button.active:hover]:bg-[#eff4e6]">
                {(
                  [
                    { mode: "corner", icon: "corner", label: "转角" },
                    { mode: "smooth", icon: "smooth", label: "平滑" },
                    { mode: "symmetric", icon: "symmetric", label: "对称" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.mode}
                    className={nodes.every((n) => n.mode === item.mode) ? "active" : ""}
                    onClick={() =>
                      changeNode({
                        mode: item.mode,
                        handle: undefined,
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
              className="text-field border [border-style:solid] border-[#e2e8d8] bg-[#f0f3e9] w-full text-[12px] p-[9px] rounded-[5px]"
              aria-label="笔画名称"
              value={stroke.name}
              disabled={locked}
              onChange={(e) => changeStroke({ name: e.target.value })}
            />
          ) : null}
        </Section>
        {(node || stroke) && (
          <Section
            title="笔画粗细"
            trailing={
              <span className="subtle-label text-[9px] text-[#77856a]">
                {multiple ? "所选节点" : node ? "当前节点" : "整条笔画"}
              </span>
            }
          >
            <div className="width-value flex items-center gap-[19px] mb-[19px] [&_.number-field]:w-[126px] [&_.number-field]:shrink-0
              laptop:gap-[12px] laptop:[&_.number-field]:w-[120px] tablet:[&_.number-field]:w-[111px]">
              <NumberField
                label="宽度"
                value={avgWidth}
                min={1}
                max={200}
                suffix="px"
                onChange={(width) => changeWidth(width)}
                disabled={widthLocked}
              />
              <span
                className="width-demo w-[54px] bg-[#657e4d] rounded-[1px] block max-h-[30px] relative tablet:w-[38px]
                  after:content-[''] after:absolute after:top-[50%] after:left-[-5px] after:right-[-5px] after:border-t
                  after:[border-top-style:dashed] after:border-t-[#aec196]"
                style={{ height: clamp(avgWidth / 4, 2, 35) }}
              />
            </div>
            <RangeInput
              aria-label="笔画粗细"
              min="1"
              max="200"
              value={avgWidth}
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
            <div className="range-scale flex justify-between text-[#77856a] text-[9px] mt-[5px]">
              <span>细</span>
              <span>粗</span>
            </div>
          </Section>
        )}
        {(node || stroke) && (
          <Section title="转折">
            <label className="field-title block text-[#77856a] text-[10px] mb-[10px]">转折方式</label>
            <div className={`segmented shape-options flex border [border-style:solid] border-[#e2e8d9] rounded-[6px] p-[3px]
              bg-[#f1f4eb] gap-[3px] [&>button]:flex-1 [&>button]:min-w-0 [&>button]:py-[7px] [&>button]:px-[4px]
              [&>button]:text-[11px] [&>button]:rounded-[3px] [&>button]:text-[#87957b] [&>button]:flex
              [&>button]:justify-center [&>button]:items-center [&>button]:gap-[6px] [&.shape-options>button]:flex-col
              [&.shape-options>button]:gap-[7px] [&.shape-options>button]:py-[8px] [&.shape-options>button]:px-[2px]
              [&.shape-options>button]:text-[9px] [&.shape-options>button>svg]:w-[20px]
              [&.shape-options>button>svg]:h-[20px] [&.shape-options>button]:text-[#77856a] ${segmentedStateClasses}`}>
              {(["miter", "round", "bevel"] as const).map((join, i) => (
                <button
                  key={join}
                  className={
                    (nodes.length
                      ? nodes.every((n) => (n.join || glyph.strokes.find((s) => s.nodes.includes(n.id))?.join) === join)
                      : stroke?.join === join) ? "active" : ""
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
          <div className="color-row flex items-center gap-[10px] [font-family:ui-monospace,_monospace] text-[10px] bg-[#f1f4eb]
            border [border-style:solid] border-[#e6ebdd] rounded-[5px] h-[35px] py-0 px-[8px] text-[#748464]">
            <label className="color-swatch block w-[19px] h-[19px] rounded-[4px] border [border-style:solid] border-[#0000000a]
              overflow-hidden cursor-pointer [&>input]:w-[40px] [&>input]:h-[40px] [&>input]:m-[-9px]
              [&>input]:cursor-pointer [&>input]:opacity-0" style={{ background: glyph.color }}>
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
            <span className="color-opacity ml-auto text-[9px] text-[#96a287] border-l [border-left-style:solid] border-l-[#dfe6d4] pl-[10px]">100%</span>
          </div>
          <div className="preset-colors flex gap-[12px] mt-[13px] p-[2px] [&>button]:w-[17px] [&>button]:h-[17px]
            [&>button]:rounded-[50%] [&>button]:border-[2px] [&>button]:[border-style:solid]
            [&>button]:border-[#fafbf7] laptop:gap-[11px] tablet:gap-[10px] [&>button.selected]:[outline:1px_solid_#8f9f80] [&>button.selected]:outline-offset-[2px]">
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
            <div className="range-label flex justify-between items-center text-[#88967a] text-[11px] mt-[26px] mx-0 mb-[15px]
              [&>b]:[font-family:ui-monospace,_monospace] [&>b]:text-[#5a7446] [&>b]:text-[11px] [&>b]:font-medium
              phone:mt-[20px]">
              不透明度<b>{glyph.referenceOpacity}%</b>
            </div>
            <RangeInput
              aria-label="原图不透明度"
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
      </div>
      <div className="property-footer h-[43px] border-t [border-top-style:solid] border-t-[var(--border)] flex items-center
        gap-[7px] py-0 px-[21px] text-[#92a082] text-[10px] shrink-0 [&>svg:last-child]:ml-auto
        [&>svg:last-child]:text-[#a1b18d] [&_.local-dot]:mr-[1px] [&_.local-dot]:w-[4px] [&_.local-dot]:h-[4px]">
        <span className="local-dot inline-block w-[5px] h-[5px] rounded-[50%] bg-[#8eab70] shrink-0" />
        <Icon name="save" size={14} />
        <span>本地手稿</span>
        <Icon name="check" size={14} />
      </div>
    </aside>
  );
}
