import { TransactionalRange } from "./TransactionalRange";
import type { TransactionId } from "../project/projectStore";
import { clamp, distance } from "../../core/geometry";
import type { Knot, Stroke } from "../../core/model";
import { Icon } from "../../shared/components/Icon";
import { BrushControls } from "./BrushControls";
import { IconButton, NumberField, Section, segmentedStateClasses } from "../../shared/components/controls";
import { useActiveGlyph, useProject, useProjectActions } from "../project/useProject";
import { selectionLocked, translateNodes } from "./nodeSelection";
import { GlyphExport } from "./GlyphExport";
import type { GlyphExportProps } from "./GlyphExport";

export function Properties({
  onExportSvg, onExportPng,
}: GlyphExportProps) {
  const glyph = useActiveGlyph();
  const nodeIds = useProject((s) => s.session.nodeIds);
  const nodeId = nodeIds.at(-1) ?? null;
  const strokeId = useProject((s) => s.session.strokeId);
  const showReference = useProject((s) => s.session.showReference);
  const { update, setShowReference } = useProjectActions();
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
  const changeNode = (values: Partial<Knot>) => {
    if (nodes.length && !locked)
      update((g) => {
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
      update((g) =>
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
  const changeWidth = (width: number, transaction?: TransactionId) => {
    if (widthLocked) return;
    update((g) => {
      if (nodes.length) nodeIds.forEach((id) => { g.nodes[id].width = width; });
      else if (stroke)
        [...new Set(stroke.nodes)].forEach((id) => {
          g.nodes[id].width = width;
        });
    }, transaction);
  };
  return (
    <aside className="right-panel bg-[var(--panel)] min-h-0 flex flex-col border-l [border-left-style:solid]
      border-l-[var(--border)] compact:hidden">
      <div className="properties-scroll flex-1 overflow-auto min-h-0">
        <Section
          title={node ? "节点" : stroke ? "笔画" : "字符"}
          trailing={
            <span className="selection-badge py-[3px] px-[7px] text-[12px] bg-[#eff2e8] text-[#839171] border [border-style:solid]
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
              <label className="field-title spaced block text-[#77856a] text-[12px] mb-[10px] mt-[19px]">节点类型</label>
              <div className="node-type-options grid grid-cols-[repeat(3,_1fr)] gap-[7px] [&>button]:flex [&>button]:flex-col
                [&>button]:items-center [&>button]:justify-center [&>button]:gap-[8px] [&>button]:h-[60px]
                [&>button]:border [&>button]:[border-style:solid] [&>button]:border-[#e1e7d9] [&>button]:rounded-[6px]
                [&>button]:text-[#91a082] [&>button]:text-[12px] [&>button]:bg-[#f9fbf4] [&>button.active]:border-[#adc28b] [&>button.active]:bg-[#e9f0dc] [&>button.active]:text-[#55743e]! [&>button:hover]:bg-[#eff4e6] [&>button.active:hover]:bg-[#eff4e6]">
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
              <span className="subtle-label text-[12px] text-[#77856a]">
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
            <TransactionalRange
              aria-label="笔画粗细"
              min="1"
              max="200"
              value={avgWidth}
              disabled={widthLocked}
              onValueChange={changeWidth}
            />
            <div className="range-scale flex justify-between text-[#77856a] text-[12px] mt-[5px]">
              <span>细</span>
              <span>粗</span>
            </div>
          </Section>
        )}
        {(node || stroke) && (
          <Section title="转折">
            <label className="field-title block text-[#77856a] text-[12px] mb-[10px]">转折方式</label>
            <div className={`segmented shape-options flex border [border-style:solid] border-[#e2e8d9] rounded-[6px] p-[3px]
              bg-[#f1f4eb] gap-[3px] [&>button]:flex-1 [&>button]:min-w-0 [&>button]:py-[7px] [&>button]:px-[4px]
              [&>button]:text-[12px] [&>button]:rounded-[3px] [&>button]:text-[#87957b] [&>button]:flex
              [&>button]:justify-center [&>button]:items-center [&>button]:gap-[6px] [&.shape-options>button]:flex-col
              [&.shape-options>button]:gap-[7px] [&.shape-options>button]:py-[8px] [&.shape-options>button]:px-[2px]
              [&.shape-options>button]:text-[12px] [&.shape-options>button>svg]:w-[20px]
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
        <BrushControls />
        <Section title="外观">
          <div className="color-row flex items-center gap-[10px] [font-family:ui-monospace,_monospace] text-[12px] bg-[#f1f4eb]
            border [border-style:solid] border-[#e6ebdd] rounded-[5px] h-[35px] py-0 px-[8px] text-[#748464]">
            <label className="color-swatch block w-[19px] h-[19px] rounded-[4px] border [border-style:solid] border-[#0000000a]
              overflow-hidden cursor-pointer [&>input]:w-[40px] [&>input]:h-[40px] [&>input]:m-[-9px]
              [&>input]:cursor-pointer [&>input]:opacity-0" style={{ background: glyph.color }}>
              <input
                type="color"
                aria-label="笔画颜色"
                value={glyph.color}
                onChange={(e) =>
                  update((g) => {
                    g.color = e.target.value;
                  })
                }
              />
            </label>
            <span>{glyph.color.toUpperCase()}</span>
            <span className="color-opacity ml-auto text-[12px] text-[#96a287] border-l [border-left-style:solid] border-l-[#dfe6d4] pl-[10px]">100%</span>
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
                  update((g) => {
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
            <div className="range-label flex justify-between items-center text-[#88967a] text-[12px] mt-[26px] mx-0 mb-[15px]
              [&>b]:[font-family:ui-monospace,_monospace] [&>b]:text-[#5a7446] [&>b]:text-[12px] [&>b]:font-medium
              phone:mt-[20px]">
              不透明度<b>{glyph.referenceOpacity}%</b>
            </div>
            <TransactionalRange
              aria-label="原图不透明度"
              min="0"
              max="100"
              value={glyph.referenceOpacity}
              onValueChange={(value, transaction) =>
                update((g) => { g.referenceOpacity = value; }, transaction)
              }
            />
          </Section>
        )}
      </div>
      {!nodes.length && !stroke && (
        <div className="shrink-0 border-t [border-top-style:solid] border-t-[var(--border)] px-[20px] py-[16px]
          wide:px-[25px] laptop:px-[16px] tablet:px-[14px]">
          <GlyphExport onExportSvg={onExportSvg} onExportPng={onExportPng} />
        </div>
      )}
    </aside>
  );
}
