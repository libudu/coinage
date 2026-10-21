import { SegmentedControl } from "../../shared/components/SegmentedControl";
import {
  TransactionalNumberField,
  TransactionalTextInput,
} from "./TransactionalInput";
import { TransactionalRange } from "./TransactionalRange";
import type { TransactionId } from "../project/projectStore";
import { clamp, distance } from "../../core/geometry";
import type { Knot, Stroke } from "../../core/model";
import { Icon } from "../../shared/components/Icon";
import { BrushControls } from "./BrushControls";
import { IconButton, Section } from "../../shared/components/controls";
import {
  useActiveGlyph,
  useProject,
  useProjectActions,
} from "../project/useProject";
import { selectionLocked, translateNodes } from "./nodeSelection";
import { GlyphExport } from "./GlyphExport";
import type { GlyphExportProps } from "./GlyphExport";

export function Properties({ onExportSvg, onExportPng }: GlyphExportProps) {
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
  const changeNode = (values: Partial<Knot>, transaction?: TransactionId) => {
    if (nodes.length && !locked)
      update((g) => {
        if (values.x !== undefined || values.y !== undefined)
          translateNodes(g, nodeIds, {
            x: values.x === undefined ? 0 : values.x - position.x,
            y: values.y === undefined ? 0 : values.y - position.y,
          });
        else
          nodes.forEach((n) =>
            Object.assign(
              g.nodes[n.id],
              values,
              values.mode === "symmetric" ? { handle: symmetricHandle(n) } : {},
            ),
          );
      }, transaction);
  };
  const changeStroke = (
    values: Partial<Stroke>,
    transaction?: TransactionId,
  ) => {
    if (stroke && !stroke.locked)
      update(
        (g) =>
          Object.assign(
            g.strokes.find((s) => s.id === stroke.id)!,
            values,
          ),
        transaction,
      );
  };
  const symmetricHandle = (n: Knot) => {
    const path = stroke?.nodes.includes(n.id)
      ? stroke
      : glyph.strokes.find((s) => s.nodes.includes(n.id));
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
      if (nodes.length)
        nodeIds.forEach((id) => {
          g.nodes[id].width = width;
        });
      else if (stroke)
        [...new Set(stroke.nodes)].forEach((id) => {
          g.nodes[id].width = width;
        });
    }, transaction);
  };
  return (
    <aside
      className="right-panel bg-[var(--panel)] min-h-0 flex flex-col border-l [border-left-style:solid]
      border-l-[var(--border)] compact:hidden"
    >
      <div className="properties-scroll flex-1 overflow-auto min-h-0">
        <Section
          title={node ? "节点" : stroke ? "笔画" : "字符"}
          trailing={
            <span
              className="selection-badge py-[3px] px-[7px] text-[12px] bg-[#eff2e8] text-[#839171] border [border-style:solid]
              border-[#e3e8da] rounded-[4px] [font-family:ui-monospace,_'Microsoft_YaHei',_monospace]"
            >
              {multiple
                ? `${nodes.length} 节点`
                : node
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
                <TransactionalNumberField
                  key={`${glyph.id}:${nodeIds.join(",")}:x`}
                  label="X"
                  min={0}
                  max={640}
                  value={position.x}
                  onValueChange={(x, transaction) =>
                    changeNode({ x }, transaction)
                  }
                  disabled={locked}
                />
                <TransactionalNumberField
                  key={`${glyph.id}:${nodeIds.join(",")}:y`}
                  label="Y"
                  min={0}
                  max={640}
                  value={position.y}
                  onValueChange={(y, transaction) =>
                    changeNode({ y }, transaction)
                  }
                  disabled={locked}
                />
              </div>
              <label className="field-title spaced block text-[#77856a] text-[12px] mb-[10px] mt-[19px]">
                节点类型
              </label>
              <SegmentedControl
                variant="cards"
                label="节点类型"
                disabled={locked}
                value={
                  nodes.every((n) => n.mode === nodes[0]?.mode)
                    ? (nodes[0]?.mode ?? null)
                    : null
                }
                onValueChange={(mode) =>
                  changeNode({ mode, handle: undefined, handleIn: undefined })
                }
                options={(
                  [
                    { value: "corner", icon: "corner", label: "转角" },
                    { value: "smooth", icon: "smooth", label: "平滑" },
                    { value: "symmetric", icon: "symmetric", label: "对称" },
                  ] as const
                ).map((item) => ({
                  value: item.value,
                  label: item.label,
                  content: (
                    <>
                      <Icon name={item.icon} size={22} />
                      <span>{item.label}</span>
                    </>
                  ),
                }))}
              />
            </>
          ) : stroke ? (
            <TransactionalTextInput
              key={`${glyph.id}:${stroke.id}`}
              variant="panel"
              aria-label="笔画名称"
              value={stroke.name}
              disabled={locked}
              onValueChange={(name, transaction) =>
                changeStroke({ name }, transaction)
              }
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
            <div
              className="width-value flex items-center gap-[19px] mb-[19px] [&_.number-field]:w-[126px] [&_.number-field]:shrink-0
              laptop:gap-[12px] laptop:[&_.number-field]:w-[120px] tablet:[&_.number-field]:w-[111px]"
            >
              <TransactionalNumberField
                key={`${glyph.id}:${nodeIds.join(",")}:${strokeId}:width`}
                label="宽度"
                value={avgWidth}
                min={1}
                max={200}
                suffix="px"
                onValueChange={changeWidth}
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
            <label className="field-title block text-[#77856a] text-[12px] mb-[10px]">
              转折方式
            </label>
            <SegmentedControl
              variant="shape"
              label="转折方式"
              disabled={locked}
              value={
                (["miter", "round", "bevel"] as const).find((join) =>
                  nodes.length
                    ? nodes.every(
                        (n) =>
                          (n.join ||
                            glyph.strokes.find((s) => s.nodes.includes(n.id))
                              ?.join) === join,
                      )
                    : stroke?.join === join,
                ) ?? null
              }
              onValueChange={(join) =>
                node ? changeNode({ join }) : changeStroke({ join })
              }
              options={(["miter", "round", "bevel"] as const).map(
                (join, i) => ({
                  value: join,
                  label: ["尖角", "圆角", "斜角"][i],
                  content: (
                    <>
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
                    </>
                  ),
                }),
              )}
            />
          </Section>
        )}
        <BrushControls />
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
            <div
              className="range-label flex justify-between items-center text-[#88967a] text-[12px] mt-[26px] mx-0 mb-[15px]
              [&>b]:[font-family:ui-monospace,_monospace] [&>b]:text-[#5a7446] [&>b]:text-[12px] [&>b]:font-medium
              phone:mt-[20px]"
            >
              不透明度<b>{glyph.referenceOpacity}%</b>
            </div>
            <TransactionalRange
              aria-label="原图不透明度"
              min="0"
              max="100"
              value={glyph.referenceOpacity}
              onValueChange={(value, transaction) =>
                update((g) => {
                  g.referenceOpacity = value;
                }, transaction)
              }
            />
          </Section>
        )}
      </div>
      {!nodes.length && !stroke && (
        <div
          className="shrink-0 border-t [border-top-style:solid] border-t-[var(--border)] px-[20px] py-[16px]
          wide:px-[25px] laptop:px-[16px] tablet:px-[14px]"
        >
          <GlyphExport onExportSvg={onExportSvg} onExportPng={onExportPng} />
        </div>
      )}
    </aside>
  );
}
