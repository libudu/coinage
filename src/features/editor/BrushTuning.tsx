import { RangeInput } from "../../shared/components/RangeInput";
import { useCallback, useEffect, useRef, useState } from "react";
import { brushSettingLimits, changeGlobalBrush, defaultBrush, defaultBrushSettings } from "../../core/brush";
import type { BrushSettings } from "../../core/brush";
import { clamp } from "../../core/geometry";
import type { Project } from "../../core/model";
import type { useProject } from "../project/useProject";

const adjustmentKeys = new Set([
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown",
]);

// Keep a draft while typing so entering e.g. "175" is not clamped to 25
// after the first digit. Commit on Enter/blur, or discard with Escape.
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
    <input className="w-[52px] min-w-0 border [border-style:solid] border-[#e2e8d9] rounded-[3px] py-[2px] px-[3px] bg-[#fcfdf8] text-[#345c29] text-[11px]" type="number" aria-label={label} min={min} max={max} step={5}
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

export function BrushTuning({ doc }: {
  doc: ReturnType<typeof useProject>;
}) {
  const gesture = useRef<{ before: Project; dirty: boolean } | null>(null);
  const pointer = useRef<number | null>(null);
  const { current, remember, replace } = doc;
  const finish = useCallback((cancel = false) => {
    const pending = gesture.current;
    gesture.current = null;
    pointer.current = null;
    if (!pending?.dirty) return;
    if (cancel) replace(pending.before, false);
    else remember(pending.before);
  }, [remember, replace]);
  useEffect(() => () => finish(), [finish]);
  const begin = () => {
    gesture.current ??= { before: current.current, dirty: false };
  };
  const change = (end: "startBrush" | "endBrush", values: Partial<BrushSettings>) => {
    const project = current.current;
    const effective = project.brush ?? defaultBrush;
    const previous = effective[end];
    const next = { ...previous, ...values };
    if (previous.length === next.length && previous.spread === next.spread) return;
    if (gesture.current) gesture.current.dirty = true;
    doc.update((_, p) => changeGlobalBrush(p, { [end]: next }), !gesture.current);
  };
  const brush = doc.project.brush ?? defaultBrush;

  return (
    <details className="brush-basic brush-tuning mt-[12px] [&>summary]:cursor-pointer [&>summary]:text-[#748464]
      [&>summary]:text-[10px] [&>summary:focus-visible]:[outline:2px_solid_#81a16d]
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
            [&>legend]:text-[11px]" key={end}>
            <legend>{label}</legend>
            <div className="brush-tuning-actions flex items-center justify-end text-[10px] text-[#748464] [&>button]:p-0 [&>button]:text-[10px]">
              <button disabled={isDefault}
                aria-label={`恢复${label}默认笔锋`}
                onClick={() => change(key, defaultBrushSettings)}>
                恢复默认
              </button>
            </div>
            {(["length", "spread"] as const).map((setting) => {
              const name = setting === "length" ? "长度" : "张开";
              const limits = brushSettingLimits[setting];
              const update = (value: number) => {
                if (!disabled && Number.isFinite(value))
                  change(key, { [setting]: clamp(value, limits.min, limits.max) });
              };
              const dragTo = (input: HTMLInputElement, clientX: number) => {
                const rect = input.getBoundingClientRect();
                // Match the 16px thumb and keep the full 28px row draggable.
                const fraction = clamp((clientX - rect.left - 8) / Math.max(1, rect.width - 16), 0, 1);
                update(Math.round(limits.min + fraction * (limits.max - limits.min)));
              };
              return (
                <div className="brush-adjustment mt-[8px] [&_input:disabled]:opacity-[0.4]" key={setting}>
                  <div className="brush-adjustment-label flex items-center justify-between text-[10px] text-[#748464] [&>label]:flex
                    [&>label]:items-center [&>label]:gap-[3px]">
                    <span>{name}</span>
                    <label>
                      <BrushValue label={`${label}${name}百分比`}
                        min={limits.min} max={limits.max}
                        value={settings[setting]} disabled={disabled} change={update} />
                      <span>%</span>
                    </label>
                  </div>
                  <RangeInput variant="row" aria-label={`${label}${name}`}
                    min={limits.min} max={limits.max} step={1}
                    value={settings[setting]} disabled={disabled}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      e.currentTarget.focus();
                      begin();
                      pointer.current = e.pointerId;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      dragTo(e.currentTarget, e.clientX);
                    }}
                    onPointerMove={(e) => {
                      if (pointer.current === e.pointerId) dragTo(e.currentTarget, e.clientX);
                    }}
                    onChange={(e) => update(e.target.valueAsNumber)}
                    onPointerUp={(e) => {
                      if (pointer.current !== e.pointerId) return;
                      dragTo(e.currentTarget, e.clientX);
                      finish();
                      if (e.currentTarget.hasPointerCapture(e.pointerId))
                        e.currentTarget.releasePointerCapture(e.pointerId);
                    }}
                    onPointerCancel={() => finish(true)}
                    onLostPointerCapture={() => finish()}
                    onBlur={() => finish()}
                    onKeyDown={(e) => {
                      if (adjustmentKeys.has(e.key)) begin();
                      else if (e.key === "Escape" && gesture.current) {
                        e.preventDefault();
                        e.stopPropagation();
                        finish(true);
                      }
                    }}
                    onKeyUp={(e) => {
                      if (adjustmentKeys.has(e.key)) finish();
                    }} />
                </div>
              );
            })}
          </fieldset>
        );
      })}
    </details>
  );
}
