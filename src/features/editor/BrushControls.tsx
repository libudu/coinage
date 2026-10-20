import { brushPresets, brushTips, defaultBrush } from "../../core/brush";
import type { BrushDefaults, BrushTip } from "../../core/brush";
import { outlinePath } from "../../core/geometry";
import type { Glyph, Stroke } from "../../core/model";
import { Section } from "../../shared/components/controls";
import { SegmentedControl } from "../../shared/components/SegmentedControl";
import { useProject, useProjectActions } from "../project/useProject";
import { BrushTuning } from "./BrushTuning";

const labels: Record<BrushTip, string> = {
  none: "无",
  horizontal: "横式",
  vertical: "竖式",
};
const previewGlyph: Glyph = {
  id: "brush-preview",
  name: "",
  color: "#243d34",
  referenceOpacity: 0,
  nodes: {
    a: { id: "a", x: 16, y: 22, width: 16, mode: "corner" },
    b: { id: "b", x: 112, y: 22, width: 16, mode: "corner" },
  },
  strokes: [],
};
function BrushPreview({ start, end }: { start: BrushTip; end: BrushTip }) {
  const stroke: Stroke = {
    id: "preview",
    name: "",
    nodes: ["a", "b"],
    visible: true,
    locked: false,
    cap: "butt",
    join: "miter",
  };
  return (
    <svg viewBox="0 0 128 44" aria-hidden="true">
      <path
        d={outlinePath(previewGlyph, stroke, {
          ...defaultBrush,
          startTip: start,
          endTip: end,
        })}
        fill="currentColor"
      />
    </svg>
  );
}

export function BrushControls() {
  const brush = useProject((s) => s.project.brush) ?? defaultBrush;
  const { changeBrush } = useProjectActions();
  const change = (values: Partial<BrushDefaults>) => {
    changeBrush(values);
  };
  return (
    <Section title="全局笔锋">
      {(["start", "end"] as const).map((end) => {
        const label = end === "start" ? "起笔" : "收笔";
        const key = end === "start" ? "startTip" : "endTip";
        const tip = brush[key];
        return (
          <div className="brush-end mb-[12px]" key={end}>
            <div className="brush-end-heading flex items-center justify-between mb-[6px] text-[12px] [&>span]:text-[#87957b] [&>span]:text-[12px]">
              <span>{label}</span>
            </div>
            <SegmentedControl
              variant="brush"
              label={label}
              value={tip}
              onValueChange={(option) => change({ [key]: option })}
              options={brushTips.map((option) => ({
                value: option,
                label: `${label}：${labels[option]}`,
                content: (
                  <>
                    <BrushPreview
                      start={end === "start" ? option : "none"}
                      end={end === "end" ? option : "none"}
                    />
                    <span>{labels[option]}</span>
                  </>
                ),
              }))}
            />
          </div>
        );
      })}
      <SegmentedControl
        variant="presets"
        label="笔锋预设"
        value={
          brushPresets.find(
            (preset) =>
              brush.startTip === preset.start && brush.endTip === preset.end,
          )?.name ?? null
        }
        onValueChange={(name) => {
          const preset = brushPresets.find((item) => item.name === name)!;
          change({ startTip: preset.start, endTip: preset.end });
        }}
        options={brushPresets.map((preset) => ({
          value: preset.name,
          label: `笔锋预设：${preset.name}`,
          title: `${preset.name} · 起笔${labels[preset.start]}，收笔${labels[preset.end]}`,
          content: (
            <>
              <BrushPreview start={preset.start} end={preset.end} />
              <span>{preset.name}</span>
            </>
          ),
        }))}
      />
      <BrushTuning />
    </Section>
  );
}
