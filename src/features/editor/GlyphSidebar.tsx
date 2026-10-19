import { centerPath } from "../../core/geometry";
import type { Glyph } from "../../core/model";
import { Icon } from "../../shared/components/Icon";
import { IconButton } from "../../shared/components/controls";
import type { useProject } from "../project/useProject";
import { GlyphPreview } from "./GlyphPreview";

type Props = {
  doc: ReturnType<typeof useProject>;
  glyph: Glyph;
  strokeId: string | null;
  select: (node: string | null, stroke?: string | null) => void;
  switchGlyph: (id: string) => void;
  addGlyph: () => void;
  startDrawing: () => void;
  showShortcuts: () => void;
};

export function GlyphSidebar({
  doc,
  glyph,
  strokeId,
  select,
  switchGlyph,
  addGlyph,
  startDrawing,
  showShortcuts,
}: Props) {
  const { project, update } = doc;
  return (
    <aside className="left-panel bg-[var(--panel)] min-h-0 flex flex-col border-r [border-right-style:solid] border-r-[var(--border)]">
      <div className="panel-tabs h-[62px] flex items-center justify-between py-0 px-[19px] shrink-0 [&>span]:text-[12px]
        [&>span]:font-semibold [&>span]:flex [&>span]:gap-[12px] [&>span]:items-center [&_b]:text-[#929a8b]
        [&_b]:text-[10px] [&_b]:font-medium [&_b]:[font-family:ui-monospace,_monospace] [&_.icon-button]:w-[26px]
        wide:h-[68px] wide:py-0 wide:px-[25px] tablet:py-0 tablet:px-[14px] compact:py-0 compact:px-[8px]
        compact:h-[52px] compact:[&>span]:text-[11px] compact:[&_b]:hidden compact:[&_.icon-button]:w-[20px]
        phone:py-0 phone:px-[5px]">
        <span>
          字符集 <b>{project.glyphs.length.toString().padStart(2, "0")}</b>
        </span>
        <IconButton icon="plus" title="新建字符" onClick={addGlyph} />
      </div>
      <div className="glyph-list pt-0 px-[12px] pb-[19px] flex flex-col gap-[8px] max-h-[46%] overflow-auto shrink-0 wide:pt-0
        wide:px-[17px] wide:pb-[24px] tablet:pt-0 tablet:px-[8px] tablet:pb-[15px] compact:pt-0 compact:px-[7px]
        compact:pb-[12px] compact:gap-[8px] compact:max-h-[52%] phone:pl-[5px] phone:pr-[5px]">
        {project.glyphs.map((g, index) => (
          <button
            key={g.id}
            className={`glyph-card ${g.id === glyph.id ? "selected" : ""} flex items-center gap-[13px] text-left min-h-[83px]
              p-[9px] border [border-style:solid] border-[transparent] rounded-[8px] relative wide:min-h-[93px]
              laptop:gap-[9px] laptop:p-[7px] tablet:min-h-[70px] tablet:gap-[7px] compact:min-h-[87px] compact:py-[8px]
              compact:px-[3px] compact:flex-col compact:gap-[6px] hover:bg-[#f1f4eb] [&.selected]:bg-[#edf2e3] [&.selected]:border-[#cddbb9] [&.selected:hover]:bg-[#edf2e3]`}
            onClick={() => switchGlyph(g.id)}
          >
            <div className="glyph-thumb w-[60px] h-[62px] bg-[#fffefa] grid place-items-center border [border-style:solid]
              border-[#e4e8dc] rounded-[4px] shrink-0 [&_svg]:w-[54px] [&_svg]:h-[54px] wide:w-[69px] wide:h-[69px]
              wide:[&_svg]:w-[60px] wide:[&_svg]:h-[60px] laptop:w-[48px] laptop:h-[52px] laptop:[&_svg]:w-[45px]
              laptop:[&_svg]:h-[45px] tablet:w-[41px] tablet:h-[45px] tablet:[&_svg]:w-[39px] tablet:[&_svg]:h-[39px]
              compact:h-[44px] compact:w-[47px]">
              <GlyphPreview glyph={g} brush={project.brush} />
            </div>
            <span className="glyph-card-text min-w-0 flex flex-col gap-[8px] [&_strong]:text-[12px] [&_strong]:font-[550]
              [&_strong]:max-w-[95px] [&_strong]:whitespace-nowrap [&_strong]:overflow-hidden [&_strong]:text-ellipsis
              [&_small]:[font-family:ui-monospace,_monospace] [&_small]:text-[10px] [&_small]:text-[#929a89]
              wide:[&_strong]:max-w-[110px] laptop:[&_strong]:max-w-[75px] tablet:[&_strong]:max-w-[62px]
              tablet:[&_strong]:text-[11px] tablet:gap-[5px] compact:[&_strong]:max-w-[61px]
              compact:[&_strong]:text-[10px] compact:[&_small]:hidden">
              <strong>{g.name}</strong>
              <small>{String(index + 1).padStart(2, "0")}</small>
            </span>
            {g.id === glyph.id && <span className="glyph-active-dot w-[5px] h-[5px] bg-[#7d9c58] rounded-[50%] ml-auto mr-[3px] tablet:hidden" />}
          </button>
        ))}
        <button className="add-glyph border [border-style:dashed] border-[#d9dfd0] min-h-[36px] rounded-[5px] text-[11px] flex
          justify-center items-center gap-[7px] text-[#929c86] mt-[3px] compact:text-[0px] hover:bg-[#f0f4e7] hover:border-[#a6b896]" onClick={addGlyph}>
          <Icon name="plus" size={16} />
          新建字符
        </button>
      </div>
      <div className="layers-section border-t [border-top-style:solid] border-t-[var(--border)] pt-[22px] px-[12px] pb-[12px]
        min-h-0 flex-1 flex flex-col [&>.section-heading]:py-0 [&>.section-heading]:px-[8px]
        [&>.section-heading]:mb-[13px] laptop:pl-[9px] laptop:pr-[9px] compact:pt-[16px] compact:px-[6px]
        compact:pb-[8px] compact:[&>.section-heading]:py-0 compact:[&>.section-heading]:px-[4px]">
        <div className="section-heading flex items-center justify-between mb-[19px] gap-[8px] [&_h3]:text-[12px]
          [&_h3]:font-semibold [&_h3]:m-0 [&_h3]:tracking-[0.5px]">
          <h3>笔画</h3>
          <span className="count-badge [font-family:ui-monospace,_monospace] text-[10px] text-[#8e9785]">{glyph.strokes.length}</span>
        </div>
        <div className="layer-list overflow-auto min-h-0">
          {glyph.strokes.map((s, i) => (
            <div
              key={s.id}
              className={`layer-row ${strokeId === s.id ? "selected" : ""} ${!s.visible ? "muted" : ""} flex items-center h-[40px]
                border [border-style:solid] border-[transparent] rounded-[5px] mb-[5px] pt-0 pr-[6px] pb-0 pl-[7px]
                tablet:pl-[3px] tablet:pr-[3px] compact:p-0 compact:h-[34px] [&.selected]:bg-[#eaf0e1] [&.selected]:border-[#dce5d0] hover:bg-[#eef2e8] [&.selected:hover]:bg-[#eef2e8] [&.muted]:opacity-[0.45] [&:not(:hover):not(.selected)_.layer-control:not(.is-locked)]:opacity-0 compact:[&:hover_.layer-control:last-child]:grid compact:[&:hover_.layer-control:last-child]:w-[15px]`}
            >
              <button
                className="layer-select flex items-center gap-[7px] flex-1 min-w-0 h-full text-left [&>svg]:text-[#5f7755]
                  [&>svg]:shrink-0 [&_span]:text-[11px] [&_span]:overflow-hidden [&_span]:text-ellipsis
                  [&_span]:whitespace-nowrap [&_small]:hidden tablet:gap-[3px] tablet:[&>svg]:w-[20px]
                  tablet:[&_span]:text-[10px] compact:gap-[3px] compact:[&_span]:text-[9px] compact:[&>svg]:w-[18px]"
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
              </button>
              <button
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
              </button>
              <button
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
              </button>
            </div>
          ))}
          {!glyph.strokes.length && (
            <button className="empty-layer flex items-center gap-[10px] justify-center w-full h-[60px] text-[12px] text-[#8c9782]" onClick={startDrawing}>
              <Icon name="pen" />
              绘制第一笔
            </button>
          )}
        </div>
      </div>
      <div className="left-footer border-t [border-top-style:solid] border-t-[var(--border)] min-h-[43px] py-0 px-[20px] flex
        items-center justify-between shrink-0 [&>button]:flex [&>button]:items-center [&>button]:gap-[8px]
        [&>button]:text-[10px] [&>button]:text-[#8d9684] [&>button>span]:border
        [&>button>span]:[border-style:solid] [&>button>span]:border-[#dce2d2] [&>button>span]:w-[15px]
        [&>button>span]:h-[16px] [&>button>span]:rounded-[3px] [&>button>span]:text-center
        [&>button>span]:ml-[4px] [&>button>span]:[font-family:monospace] tablet:py-0 tablet:px-[13px] compact:py-0
        compact:px-[8px] compact:[&>button]:text-[9px] compact:[&>button]:gap-[5px] compact:[&>button>span]:hidden">
        <button onClick={showShortcuts}>
          <Icon name="shortcut" size={17} />
          快捷键<span>?</span>
        </button>
      </div>
    </aside>
  );
}
