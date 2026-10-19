import { brushPresets, brushTips, changeGlobalBrush, defaultBrush } from "../../core/brush";
import type { BrushDefaults, BrushTip } from "../../core/brush";
import { outlinePath } from "../../core/model";
import type { Glyph, Stroke } from "../../core/model";
import { Section } from "../../shared/components/controls";
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
          <div className="brush-end" key={end}>
            <div className="brush-end-heading"><span>{label}</span></div>
            <div className="segmented brush-tip-options" role="group" aria-label={label}>
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
      <div className="brush-presets" role="group" aria-label="笔锋预设">
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
