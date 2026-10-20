import { Button } from "../../shared/components/Button";
import { useState } from "react";
import { centerPath } from "../../core/geometry";
import type { Point } from "../../core/model";
import { Icon } from "../../shared/components/Icon";
import { SegmentedControl } from "../../shared/components/SegmentedControl";
import {
  useActiveGlyph,
  useProject,
  useProjectActions,
} from "../project/useProject";
import { GlyphPreview } from "./GlyphPreview";
import { AddGlyphMenu } from "./AddGlyphMenu";

type Props = {
  openGlyphContextMenu: (id: string, position: Point) => void;
  importGlyph: () => void;
};

export function GlyphSidebar({ openGlyphContextMenu, importGlyph }: Props) {
  const glyphs = useProject((s) => s.project.glyphs);
  const brush = useProject((s) => s.project.brush);
  const glyph = useActiveGlyph();
  const strokeId = useProject((s) => s.session.strokeId);
  const nodeIds = useProject((s) => s.session.nodeIds);
  const { update, select, switchGlyph, addGlyph } = useProjectActions();
  const [compositionView, setCompositionView] = useState<"strokes" | "nodes">(
    "strokes",
  );
  const nodes = Object.values(glyph.nodes);
  return (
    <aside className="left-panel bg-[var(--panel)] min-h-0 flex flex-col border-r [border-right-style:solid] border-r-[var(--border)]">
      <div
        className="panel-tabs h-[62px] flex items-center justify-between py-0 px-[19px] shrink-0 text-[12px]
        font-semibold
        wide:h-[68px] wide:py-0 wide:px-[25px] tablet:py-0 tablet:px-[14px] compact:py-0
        compact:h-[52px] compact:px-[5px] phone:py-0 phone:px-[3px]"
      >
        <h3 className="m-0 whitespace-nowrap">
          字符集{" "}
          <span className="text-[#a0a69b] font-normal">({glyphs.length})</span>
        </h3>
        <AddGlyphMenu addGlyph={addGlyph} importGlyph={importGlyph} />
      </div>
      <div
        className="glyph-list pt-0 px-[12px] pb-[19px] flex flex-col gap-[8px] max-h-[46%] overflow-auto shrink-0 wide:pt-0
        wide:px-[17px] wide:pb-[24px] tablet:pt-0 tablet:px-[8px] tablet:pb-[15px] compact:pt-0 compact:px-[7px]
        compact:pb-[12px] compact:gap-[8px] compact:max-h-[52%] phone:pl-[5px] phone:pr-[5px]"
      >
        {glyphs.map((g, index) => (
          <Button
            variant="bare"
            key={g.id}
            aria-label={g.name || `字符 ${String(index + 1).padStart(2, "0")}`}
            className={`glyph-card ${g.id === glyph.id ? "selected" : ""} flex items-center gap-[13px] text-left min-h-[83px]
              p-[9px] border [border-style:solid] border-[transparent] rounded-[8px] relative wide:min-h-[93px]
              laptop:gap-[9px] laptop:p-[7px] tablet:min-h-[70px] tablet:gap-[7px] compact:min-h-[87px] compact:py-[8px]
              compact:px-[3px] compact:flex-col compact:gap-[6px] hover:bg-[#f1f4eb] [&.selected]:bg-[#edf2e3] [&.selected]:border-[#cddbb9] [&.selected:hover]:bg-[#edf2e3]`}
            onClick={() => switchGlyph(g.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              openGlyphContextMenu(g.id, { x: e.clientX, y: e.clientY });
            }}
          >
            <div
              className="glyph-thumb w-[60px] h-[62px] bg-[#fffefa] grid place-items-center border [border-style:solid]
              border-[#e4e8dc] rounded-[4px] shrink-0 [&_svg]:w-[54px] [&_svg]:h-[54px] wide:w-[69px] wide:h-[69px]
              wide:[&_svg]:w-[60px] wide:[&_svg]:h-[60px] laptop:w-[48px] laptop:h-[52px] laptop:[&_svg]:w-[45px]
              laptop:[&_svg]:h-[45px] tablet:w-[41px] tablet:h-[45px] tablet:[&_svg]:w-[39px] tablet:[&_svg]:h-[39px]
              compact:h-[44px] compact:w-[47px]"
            >
              <GlyphPreview glyph={g} brush={brush} />
            </div>
            <span
              className="glyph-card-text min-w-0 flex flex-col gap-[8px] [&_strong]:text-[12px] [&_strong]:font-[550]
              [&_strong]:max-w-[95px] [&_strong]:whitespace-nowrap [&_strong]:overflow-hidden [&_strong]:text-ellipsis
              [&_small]:text-[12px] [&_small]:text-[#a0a69b] [&_small]:truncate [&_small]:max-w-full
              wide:[&_strong]:max-w-[110px] laptop:[&_strong]:max-w-[75px] tablet:[&_strong]:max-w-[62px]
              tablet:gap-[5px] compact:[&_strong]:max-w-[61px] compact:[&_small]:max-w-[61px]"
            >
              {g.name && <strong title={g.name}>{g.name}</strong>}
              {g.description && (
                <small title={g.description}>{g.description}</small>
              )}
            </span>
            {g.id === glyph.id && (
              <span className="glyph-active-dot w-[5px] h-[5px] bg-[#7d9c58] rounded-[50%] ml-auto mr-[3px] tablet:hidden" />
            )}
          </Button>
        ))}
      </div>
      <div
        className="layers-section border-t [border-top-style:solid] border-t-[var(--border)] pt-[22px] px-[12px] pb-[12px]
        min-h-0 flex-1 flex flex-col [&>.section-heading]:py-0 [&>.section-heading]:px-[8px]
        [&>.section-heading]:mb-[13px] laptop:pl-[9px] laptop:pr-[9px] compact:pt-[16px] compact:px-[6px]
        compact:pb-[8px] compact:[&>.section-heading]:py-0 compact:[&>.section-heading]:px-0"
      >
        <div className="section-heading flex items-center justify-between gap-[4px] shrink-0 mb-[19px]">
          <h3 className="m-0 whitespace-nowrap font-semibold laptop:text-[14px] compact:text-[12px]">
            构成
          </h3>
          <SegmentedControl
            variant="compact"
            label="构成视图"
            value={compositionView}
            onValueChange={setCompositionView}
            options={(
              [
                {
                  value: "strokes",
                  label: "笔画",
                  icon: "pen",
                  count: glyph.strokes.length,
                },
                {
                  value: "nodes",
                  label: "节点",
                  icon: "node",
                  count: nodes.length,
                },
              ] as const
            ).map((item) => ({
              value: item.value,
              label: item.label,
              title: `${item.label} (${item.count})`,
              content: (
                <>
                  <span className="pl-[2px] compact:hidden">
                    {item.label}
                    <span className="ml-[3px] text-[11px] text-[#a0a69b] font-normal laptop:text-[10px] tablet:hidden">
                      ({item.count})
                    </span>
                  </span>
                  <span className="hidden compact:block">
                    <Icon name={item.icon} size={12} />
                  </span>
                </>
              ),
            }))}
          />
        </div>
        <div
          key={compositionView}
          className="layer-list flex-1 overflow-auto min-h-0"
          aria-label={compositionView === "strokes" ? "笔画列表" : "节点列表"}
        >
          {compositionView === "strokes" &&
            glyph.strokes.map((s, i) => (
              <div
                key={s.id}
                className={`layer-row ${strokeId === s.id ? "selected" : ""} ${!s.visible ? "muted" : ""} flex items-center h-[40px]
                border [border-style:solid] border-[transparent] rounded-[5px] mb-[5px] pt-0 pr-[6px] pb-0 pl-[7px]
                tablet:pl-[3px] tablet:pr-[3px] compact:p-0 compact:h-[34px] [&.selected]:bg-[#eaf0e1] [&.selected]:border-[#dce5d0] hover:bg-[#eef2e8] [&.selected:hover]:bg-[#eef2e8] [&.muted]:opacity-[0.45] [&:not(:hover):not(.selected)_.layer-control:not(.is-locked)]:opacity-0 compact:[&:hover_.layer-control:last-child]:grid compact:[&:hover_.layer-control:last-child]:w-[15px]`}
              >
                <Button
                  variant="bare"
                  className="layer-select flex items-center gap-[7px] flex-1 min-w-0 h-full text-left [&>svg]:text-[#5f7755]
                  [&>svg]:shrink-0 [&_span]:text-[12px] [&_span]:overflow-hidden [&_span]:text-ellipsis
                  [&_span]:whitespace-nowrap [&_small]:hidden tablet:gap-[3px] tablet:[&>svg]:w-[20px]
                  compact:gap-[3px] compact:[&>svg]:w-[18px]"
                  onClick={() => select(null, s.id)}
                >
                  <svg width="26" height="26" viewBox="0 0 640 640">
                    <path
                      d={centerPath(glyph, s)}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="38"
                    />
                  </svg>
                  <span>{s.name}</span>
                  <small>{String(i + 1).padStart(2, "0")}</small>
                </Button>
                <Button
                  variant="bare"
                  className={`layer-control ${s.locked ? "is-locked" : ""} w-[23px] h-[27px] grid place-items-center text-[#8c9682]
                  shrink-0 rounded-[4px] laptop:w-[18px] tablet:w-[16px] tablet:[&>svg]:w-[12px] compact:hidden hover:bg-[#dce5d1]`}
                  aria-label={`${s.locked ? "解锁" : "锁定"}${s.name}`}
                  title={s.locked ? "解锁笔画" : "锁定笔画"}
                  onClick={() =>
                    update((g) => {
                      g.strokes.find((item) => item.id === s.id)!.locked =
                        !s.locked;
                    })
                  }
                >
                  <Icon name={s.locked ? "lock" : "unlock"} size={13} />
                </Button>
                <Button
                  variant="bare"
                  className="layer-control w-[23px] h-[27px] grid place-items-center text-[#8c9682] shrink-0 rounded-[4px]
                  laptop:w-[18px] tablet:w-[16px] tablet:[&>svg]:w-[12px] compact:hidden hover:bg-[#dce5d1]"
                  aria-label={`${s.visible ? "隐藏" : "显示"}${s.name}`}
                  title={s.visible ? "隐藏笔画" : "显示笔画"}
                  onClick={() =>
                    update((g) => {
                      g.strokes.find((item) => item.id === s.id)!.visible =
                        !s.visible;
                    })
                  }
                >
                  <Icon name={s.visible ? "eye" : "eyeOff"} size={14} />
                </Button>
              </div>
            ))}
          {compositionView === "nodes" &&
            nodes.map((node, index) => (
              <Button
                variant="bare"
                key={node.id}
                type="button"
                className={`node-row ${nodeIds.includes(node.id) ? "selected" : ""} flex items-center gap-[7px] w-full h-[40px]
                border border-solid border-transparent rounded-[5px] mb-[5px] px-[7px] text-left text-[12px]
                tablet:px-[3px] compact:gap-[3px] compact:px-0 compact:h-[34px]
                [&.selected]:bg-[#eaf0e1] [&.selected]:border-[#dce5d0] hover:bg-[#eef2e8]`}
                aria-pressed={nodeIds.includes(node.id)}
                title={`节点 ${String(index + 1).padStart(2, "0")} · X ${Math.round(node.x)} / Y ${Math.round(node.y)}`}
                onClick={() => {
                  const stroke =
                    glyph.strokes.find(
                      (s) => s.id === strokeId && s.nodes.includes(node.id),
                    ) ??
                    glyph.strokes.find(
                      (s) => s.visible && s.nodes.includes(node.id),
                    ) ??
                    glyph.strokes.find((s) => s.nodes.includes(node.id));
                  select(node.id, stroke?.id ?? null);
                }}
              >
                <span className="text-[#5f7755] shrink-0">
                  <Icon name={node.mode} size={18} />
                </span>
                <span className="min-w-0 truncate">
                  节点 {String(index + 1).padStart(2, "0")}
                </span>
                <small className="ml-auto text-[11px] text-[#929a89] font-mono whitespace-nowrap laptop:hidden">
                  {Math.round(node.x)}, {Math.round(node.y)}
                </small>
              </Button>
            ))}
          {!(compositionView === "strokes"
            ? glyph.strokes.length
            : nodes.length) && (
            <div className="empty-layer flex items-center justify-center h-full text-[12px] text-[#afb4aa]">
              {compositionView === "strokes" ? "暂无笔画" : "暂无节点"}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
