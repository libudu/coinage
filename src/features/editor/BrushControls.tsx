import { brushPresets, brushTips, changeGlobalBrush, defaultBrush } from "../../core/brush";
import type { BrushDefaults, BrushTip } from "../../core/brush";
import { outlinePath } from "../../core/geometry";
import type { Glyph, Stroke } from "../../core/model";
import { Section, segmentedStateClasses } from "../../shared/components/controls";
import type { useProject } from "../project/useProject";
import { BrushTuning } from "./BrushTuning";

const labels: Record<BrushTip, string> = { none: "无", horizontal: "横式", vertical: "竖式" };
const previewGlyph: Glyph = {
  id: "brush-preview", name: "", color: "#243d34", referenceOpacity: 0,
  nodes: {
    a: { id: "a", x: 16, y: 22, width: 16, mode: "corner" },
    b: { id: "b", x: 112, y: 22, width: 16, mode: "corner" },
  },
  strokes: [],
};
function BrushPreview({ start, end }: { start: BrushTip; end: BrushTip }) {
  const stroke: Stroke = {
    id: "preview", name: "", nodes: ["a", "b"], visible: true, locked: false,
    cap: "butt", join: "miter",
  };
  return (
    <svg viewBox="0 0 128 44" aria-hidden="true">
      <path d={outlinePath(previewGlyph, stroke, { ...defaultBrush, startTip: start, endTip: end })} fill="currentColor" />
    </svg>
  );
}

export function BrushControls({ doc }: { doc: ReturnType<typeof useProject> }) {
  const brush = doc.project.brush ?? defaultBrush;
  const change = (values: Partial<BrushDefaults>) => {
    doc.update((_, project) => changeGlobalBrush(project, values));
  };
  return (
    <Section title="全局笔锋">
      {(["start", "end"] as const).map((end) => {
        const label = end === "start" ? "起笔" : "收笔";
        const key = end === "start" ? "startTip" : "endTip";
        const tip = brush[key];
        return (
          <div className="brush-end mb-[12px]" key={end}>
            <div className="brush-end-heading flex items-center justify-between mb-[6px] text-[12px] [&>span]:text-[#87957b] [&>span]:text-[12px]"><span>{label}</span></div>
            <div className={`segmented brush-tip-options flex border [border-style:solid] border-[#e2e8d9] rounded-[6px] p-[3px]
              bg-[#f1f4eb] gap-[3px] [&>button]:flex-1 [&>button]:min-w-0 [&>button]:py-[7px] [&>button]:px-[4px]
              [&>button]:text-[12px] [&>button]:rounded-[3px] [&>button]:text-[#87957b] [&>button]:flex
              [&>button]:justify-center [&>button]:items-center [&>button]:gap-[6px]
              [&.brush-tip-options>button]:flex-col [&.brush-tip-options>button]:gap-[2px]
              [&.brush-tip-options>button]:py-[5px] [&.brush-tip-options>button]:px-[2px]
              [&.brush-tip-options>button]:text-[12px] [&.brush-tip-options_svg]:block [&.brush-tip-options_svg]:w-full
              [&.brush-tip-options_svg]:h-[22px] ${segmentedStateClasses}`} role="group" aria-label={label}>
              {brushTips.map((option) => (
                <button key={option}
                  aria-label={`${label}：${labels[option]}`} aria-pressed={tip === option}
                  className={tip === option ? "active" : ""}
                  onClick={() => change({ [key]: option })}>
                  <BrushPreview start={end === "start" ? option : "none"} end={end === "end" ? option : "none"} />
                  <span>{labels[option]}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <div className="brush-presets grid grid-cols-[repeat(4,_minmax(0,_1fr))] gap-[5px] [&_svg]:block [&_svg]:w-full
        [&_svg]:h-[22px] [&>button]:min-w-0 [&>button]:py-[4px] [&>button]:px-[2px] [&>button]:border
        [&>button]:[border-style:solid] [&>button]:border-[#e2e8d9] [&>button]:rounded-[5px]
        [&>button]:text-[#748464] [&>button]:text-[12px] [&>button:hover:not(:disabled)]:text-[#345c29]! [&>button:hover:not(:disabled)]:bg-[#edf3e5] [&>button:hover:not(:disabled)]:border-[#a8bd94] [&>button.active]:text-[#345c29]! [&>button.active]:bg-[#edf3e5] [&>button.active]:border-[#a8bd94]" role="group" aria-label="笔锋预设">
        {brushPresets.map((preset) => {
          const active = brush.startTip === preset.start && brush.endTip === preset.end;
          return (
            <button key={preset.name}
              title={`${preset.name} · 起笔${labels[preset.start]}，收笔${labels[preset.end]}`}
              aria-label={`笔锋预设：${preset.name}`} aria-pressed={active}
              className={active ? "active" : ""}
              onClick={() => change({ startTip: preset.start, endTip: preset.end })}>
              <BrushPreview start={preset.start} end={preset.end} />
              <span>{preset.name}</span>
            </button>
          );
        })}
      </div>
      <BrushTuning doc={doc} />
    </Section>
  );
}
