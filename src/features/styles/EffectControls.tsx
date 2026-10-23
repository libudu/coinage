import {
  defaultProjectStyle,
  defaultInkSettings,
  defaultGlyphEffects,
  defaultSpiderWebSettings,
  firePalettes,
  runePresets,
} from "../../core/glyphEffects";
import type { GlyphEffects } from "../../core/glyphEffects";
import { Button } from "../../shared/components/Button";
import { Section } from "../../shared/components/controls";
import { SegmentedControl } from "../../shared/components/SegmentedControl";
import { NumberField } from "../../shared/components/NumberField";
import { RangeInput } from "../../shared/components/RangeInput";
import { useProject, useProjectActions } from "../project/useProject";

export function EffectControls() {
  const effects = useProject(
    (s) => (s.project.style ?? defaultProjectStyle).effects,
  );
  const { changeStyle, resetEffect } = useProjectActions();
  const change = (recipe: (effects: GlyphEffects) => void) => {
    changeStyle((style) => {
      if (style.effects.type === "ink")
        style.effects.ink ??= { ...defaultInkSettings };
      if (style.effects.type === "web")
        style.effects.web ??= { ...defaultSpiderWebSettings };
      recipe(style.effects);
    });
  };
  const fire = effects.type === "fire";
  const ink = effects.type === "ink";
  const web = effects.type === "web";
  const webSettings = { ...defaultSpiderWebSettings, ...effects.web };
  const settings = fire
    ? effects.fire
    : ink
      ? { ...(effects.ink ?? defaultInkSettings), direction: 0 }
      : effects.rune;
  const interactionLabel = fire ? "扰动强度" : ink ? "搅动强度" : "光晕粗细";
  const interactionValue = fire
    ? effects.fire.disturbance
    : ink
      ? (effects.ink ?? defaultInkSettings).disturbance
      : effects.rune.haloWidth;
  const defaults = web
    ? defaultSpiderWebSettings
    : fire
      ? defaultGlyphEffects.fire
      : ink
        ? defaultInkSettings
        : defaultGlyphEffects.rune;
  const currentSettings: Record<string, unknown> = web ? webSettings : settings;
  const isDefault = Object.entries(defaults).every(
    ([key, value]) =>
      (ink ? (currentSettings[key] ?? value) : currentSettings[key]) === value,
  );
  return (
    <Section
      title="特效"
      trailing={
        effects.type !== "none" && (
          <Button
            variant="bare"
            className="p-0 text-[12px] text-[#748464] enabled:hover:underline"
            aria-label="恢复当前特效默认配置"
            disabled={isDefault}
            onClick={resetEffect}
          >
            恢复默认
          </Button>
        )
      }
    >
      <SegmentedControl
        label="特效"
        value={effects.type}
        onValueChange={(type) =>
          change((e) => {
            e.type = type;
          })
        }
        options={[
          { value: "none", label: "无" },
          { value: "fire", label: "燃烧" },
          { value: "rune", label: "符文" },
          { value: "ink", label: "水墨" },
          { value: "web", label: "蜘蛛网" },
        ]}
      />
      {effects.type !== "none" && (
        <div className="mt-[20px] flex flex-col gap-[20px]">
          {web ? (
            <>
              <label className="flex items-center justify-between text-[12px] text-[#77856a]">
                网丝颜色
                <input
                  type="color"
                  aria-label="网丝颜色"
                  value={webSettings.color}
                  className="h-[28px] w-[40px] cursor-pointer rounded-[4px] border border-solid border-[#dfe6d4] bg-transparent p-[2px]"
                  onChange={(event) =>
                    change((e) => {
                      e.web!.color = event.target.value;
                    })
                  }
                />
              </label>
              {(
                [
                  { key: "thickness", label: "线条粗细", min: 25, max: 250 },
                  { key: "density", label: "蛛网密度", min: 25, max: 200 },
                  { key: "elasticity", label: "弹性", min: 0, max: 100 },
                  { key: "propagation", label: "拉力传导", min: 0, max: 200 },
                ] as const
              ).map(({ key, label, min, max }) => (
                <label
                  key={`web:${key}`}
                  className="block text-[12px] text-[#77856a]"
                >
                  <span className="mb-[10px] flex justify-between">
                    {label}
                    <span className="font-mono">{webSettings[key]}%</span>
                  </span>
                  <RangeInput
                    aria-label={label}
                    min={min}
                    max={max}
                    value={webSettings[key]}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber;
                      change((e) => {
                        e.web![key] = value;
                      });
                    }}
                  />
                </label>
              ))}
            </>
          ) : fire ? (
            <div>
              <div className="mb-[10px] text-[12px] text-[#77856a]">
                火焰配色
              </div>
              <SegmentedControl
                label="火焰配色"
                value={effects.fire.palette}
                options={Object.entries(firePalettes).map(
                  ([value, palette]) => ({
                    value: value as GlyphEffects["fire"]["palette"],
                    label: palette.label,
                  }),
                )}
                onValueChange={(palette) =>
                  change((e) => {
                    e.fire.palette = palette;
                  })
                }
              />
            </div>
          ) : !ink ? (
            <>
              <div
                className="flex flex-wrap gap-[7px]"
                role="group"
                aria-label="符文预设"
              >
                {runePresets.map((preset) => (
                  <Button
                    key={preset.label}
                    variant="bare"
                    aria-pressed={
                      (effects.rune.material ?? "light") === preset.material &&
                      effects.rune.color === preset.color &&
                      effects.rune.intensity === preset.intensity &&
                      effects.rune.speed === preset.speed
                    }
                    className="shrink-0 whitespace-nowrap rounded-[5px] border border-solid border-[#dfe6d4] px-[8px] py-[7px] text-[11px] hover:bg-[#edf2e3] aria-pressed:bg-[#e7eddf]"
                    onClick={() =>
                      change((e) => {
                        e.rune = {
                          ...e.rune,
                          material: preset.material,
                          color: preset.color,
                          intensity: preset.intensity,
                          speed: preset.speed,
                        };
                      })
                    }
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <label className="flex items-center justify-between text-[12px] text-[#77856a]">
                光色
                <input
                  type="color"
                  aria-label="符文光色"
                  value={effects.rune.color}
                  className="h-[28px] w-[40px] cursor-pointer rounded-[4px] border border-solid border-[#dfe6d4] bg-transparent p-[2px]"
                  onChange={(event) =>
                    change((e) => {
                      e.rune.color = event.target.value;
                    })
                  }
                />
              </label>
            </>
          ) : null}
          {!ink && !web && (
            <div className="flex flex-col gap-[10px]">
              <div className="flex items-center justify-between gap-[12px]">
                <span
                  aria-hidden="true"
                  className="grid h-[36px] w-[36px] place-items-center rounded-full border border-solid border-[#dfe6d4] text-[20px] text-[#657e4d]"
                >
                  <span
                    style={{ transform: `rotate(${settings.direction}deg)` }}
                  >
                    ↑
                  </span>
                </span>
                <div className="w-[130px]">
                  <NumberField
                    key={`${effects.type}:direction-number`}
                    label={fire ? "火焰方向" : "流光方向"}
                    value={settings.direction}
                    min={0}
                    max={360}
                    suffix="°"
                    onValueChange={(direction) =>
                      change((e) => {
                        e[fire ? "fire" : "rune"].direction = direction;
                      })
                    }
                  />
                </div>
              </div>
              <RangeInput
                key={`${effects.type}:direction`}
                aria-label={fire ? "火焰方向" : "流光方向"}
                min={0}
                max={360}
                value={settings.direction}
                onChange={(event) => {
                  const direction = event.currentTarget.valueAsNumber;
                  change((e) => {
                    e[fire ? "fire" : "rune"].direction = direction;
                  });
                }}
              />
              <div className="flex justify-between text-[11px] text-[#96a287]">
                <span>0°</span>
                <span>180°</span>
                <span>360°</span>
              </div>
            </div>
          )}
          {!web &&
            (
              [
                {
                  key: "intensity",
                  label: fire ? "火势" : ink ? "晕染浓度" : "辉光强度",
                  min: 20,
                  max: 100,
                },
                {
                  key: "speed",
                  label: fire ? "燃烧速度" : ink ? "水流速度" : "流动速度",
                  min: 20,
                  max: 160,
                },
              ] as const
            ).map(({ key, label, min, max }) => (
              <label
                key={`${effects.type}:${key}`}
                className="block text-[12px] text-[#77856a]"
              >
                <span className="mb-[10px] flex justify-between">
                  {label}
                  <span className="font-mono">{settings[key]}%</span>
                </span>
                <RangeInput
                  aria-label={label}
                  min={min}
                  max={max}
                  value={settings[key]}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    change((e) => {
                      (ink ? e.ink! : e[fire ? "fire" : "rune"])[key] = value;
                    });
                  }}
                />
              </label>
            ))}
          {!web && (
            <label className="block text-[12px] text-[#77856a]">
              <span className="mb-[10px] flex justify-between">
                {interactionLabel}
                <span className="font-mono">{interactionValue}%</span>
              </span>
              <RangeInput
                key={`${effects.type}:interaction`}
                aria-label={interactionLabel}
                min={fire || ink ? 0 : 10}
                max={100}
                value={interactionValue}
                onChange={(event) => {
                  const value = event.currentTarget.valueAsNumber;
                  change((e) => {
                    if (fire) e.fire.disturbance = value;
                    else if (ink) e.ink!.disturbance = value;
                    else e.rune.haloWidth = value;
                  });
                }}
              />
            </label>
          )}
          {ink &&
            (
              [
                { key: "stirSize", label: "搅动大小", min: 25 },
                { key: "diffusionRange", label: "扩散范围", min: 0 },
              ] as const
            ).map(({ key, label, min }) => (
              <label key={key} className="block text-[12px] text-[#77856a]">
                <span className="mb-[10px] flex justify-between">
                  {label}
                  <span className="font-mono">
                    {effects.ink?.[key] ?? defaultInkSettings[key]}%
                  </span>
                </span>
                <RangeInput
                  key={`ink:${key}`}
                  aria-label={label}
                  min={min}
                  max={200}
                  value={effects.ink?.[key] ?? defaultInkSettings[key]}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    change((e) => {
                      e.ink![key] = value;
                    });
                  }}
                />
              </label>
            ))}
        </div>
      )}
    </Section>
  );
}
