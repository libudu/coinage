import { TransactionalRange } from "./TransactionalRange";
import { useState } from "react";
import { brushSettingLimits, defaultBrush, defaultBrushSettings } from "../../core/brush";
import type { BrushSettings } from "../../core/brush";
import { clamp } from "../../core/geometry";
import { useProject, useProjectActions, useProjectApi } from "../project/useProject";
import type { TransactionId } from "../project/projectStore";

// 输入时保留草稿，避免键入“175”时，第一个数字就被限制为最小值 25。
// 按 Enter 或失焦时提交，按 Escape 时丢弃草稿。
function BrushValue({ label, value, min, max, disabled, change }: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  change: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  return (
    <input className="w-[52px] min-w-0 border [border-style:solid] border-[#e2e8d9] rounded-[3px] py-[2px] px-[3px] bg-[#fcfdf8] text-[#345c29] text-[12px]" type="number" aria-label={label} min={min} max={max} step={5}
      value={editing ? draft : value} disabled={disabled}
      onFocus={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft.trim() !== "" && Number.isFinite(Number(draft)))
          change(clamp(Number(draft), min, max));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setDraft(String(value));
        }
      }} />
  );
}

export function BrushTuning() {
  const api = useProjectApi();
  const { changeBrush } = useProjectActions();
  const change = (end: "startBrush" | "endBrush", values: Partial<BrushSettings>, transaction?: TransactionId) => {
    const project = api.getState().project;
    const effective = project.brush ?? defaultBrush;
    const previous = effective[end];
    const next = { ...previous, ...values };
    if (previous.length === next.length && previous.spread === next.spread) return;
    changeBrush({ [end]: next }, transaction);
  };
  const brush = useProject((s) => s.project.brush) ?? defaultBrush;

  return (
    <details className="brush-basic brush-tuning mt-[12px] [&>summary]:cursor-pointer [&>summary]:text-[#748464]
      [&>summary]:text-[12px] [&>summary:focus-visible]:[outline:2px_solid_#81a16d]
      [&>summary:focus-visible]:outline-offset-[3px] [&[open]>summary]:mb-[8px]">
      <summary>笔锋微调</summary>
      {(["start", "end"] as const).map((end) => {
        const label = end === "start" ? "起笔" : "收笔";
        const key = end === "start" ? "startBrush" : "endBrush";
        const tip = end === "start" ? brush.startTip : brush.endTip;
        const settings = brush[key];
        const disabled = tip === "none";
        const isDefault = settings.length === 100 && settings.spread === 100;
        return (
          <fieldset className="brush-tuning-end min-w-0 mt-[10px] mx-0 mb-0 pt-[8px] px-[10px] pb-[10px] border [border-style:solid]
            border-[#e2e8d9] rounded-[5px] [&>legend]:py-0 [&>legend]:px-[4px] [&>legend]:text-[#50713c]
            [&>legend]:text-[12px]" key={end}>
            <legend>{label}</legend>
            <div className="brush-tuning-actions flex items-center justify-end text-[12px] text-[#748464] [&>button]:p-0 [&>button]:text-[12px]">
              <button disabled={isDefault}
                aria-label={`恢复${label}默认笔锋`}
                onClick={() => change(key, defaultBrushSettings)}>
                恢复默认
              </button>
            </div>
            {(["length", "spread"] as const).map((setting) => {
              const name = setting === "length" ? "长度" : "张开";
              const limits = brushSettingLimits[setting];
              const update = (value: number, transaction?: TransactionId) => {
                if (!disabled && Number.isFinite(value))
                  change(key, { [setting]: clamp(value, limits.min, limits.max) }, transaction);
              };
              return (
                <div className="brush-adjustment mt-[8px] [&_input:disabled]:opacity-[0.4]" key={setting}>
                  <div className="brush-adjustment-label flex items-center justify-between text-[12px] text-[#748464] [&>label]:flex
                    [&>label]:items-center [&>label]:gap-[3px]">
                    <span>{name}</span>
                    <label>
                      <BrushValue label={`${label}${name}百分比`}
                        min={limits.min} max={limits.max}
                        value={settings[setting]} disabled={disabled} change={update} />
                      <span>%</span>
                    </label>
                  </div>
                  <TransactionalRange variant="row" aria-label={`${label}${name}`}
                    min={limits.min} max={limits.max} step={1}
                    value={settings[setting]} disabled={disabled} onValueChange={update} />
                </div>
              );
            })}
          </fieldset>
        );
      })}
    </details>
  );
}
