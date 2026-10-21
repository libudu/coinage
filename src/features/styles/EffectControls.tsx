import {
  defaultProjectStyle,
  firePalettes,
  runePresets,
} from "../../core/glyphEffects";
import type { GlyphEffects } from "../../core/glyphEffects";
import { Button } from "../../shared/components/Button";
import { Section } from "../../shared/components/controls";
import { SegmentedControl } from "../../shared/components/SegmentedControl";
import { TransactionalNumberField } from "../editor/TransactionalInput";
import { TransactionalRange } from "../editor/TransactionalRange";
import type { TransactionId } from "../project/projectStore";
import { useProject, useProjectActions } from "../project/useProject";

export function EffectControls() {
  const effects = useProject(
    (s) => (s.project.style ?? defaultProjectStyle).effects,
  );
  const { changeStyle } = useProjectActions();
  const change = (
    recipe: (effects: GlyphEffects) => void,
    transaction?: TransactionId,
  ) => {
    changeStyle((style) => {
      recipe(style.effects);
    }, transaction);
  };
  const fire = effects.type === "fire";
  const settings = fire ? effects.fire : effects.rune;
  return (
    <Section title="特效">
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
        ]}
      />
      {effects.type !== "none" && (
        <div className="mt-[20px] flex flex-col gap-[20px]">
          {fire ? (
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
          ) : (
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
          )}
          <div className="flex flex-col gap-[10px]">
            <div className="flex items-center justify-between gap-[12px]">
              <span
                aria-hidden="true"
                className="grid h-[36px] w-[36px] place-items-center rounded-full border border-solid border-[#dfe6d4] text-[20px] text-[#657e4d]"
              >
                <span style={{ transform: `rotate(${settings.direction}deg)` }}>
                  ↑
                </span>
              </span>
              <div className="w-[130px]">
                <TransactionalNumberField
                  key={`${effects.type}:direction-number`}
                  label={fire ? "火焰方向" : "流光方向"}
                  value={settings.direction}
                  min={0}
                  max={360}
                  suffix="°"
                  onValueChange={(direction, transaction) =>
                    change((e) => {
                      e[fire ? "fire" : "rune"].direction = direction;
                    }, transaction)
                  }
                />
              </div>
            </div>
            <TransactionalRange
              key={`${effects.type}:direction`}
              aria-label={fire ? "火焰方向" : "流光方向"}
              min={0}
              max={360}
              value={settings.direction}
              onValueChange={(direction, transaction) =>
                change((e) => {
                  e[fire ? "fire" : "rune"].direction = direction;
                }, transaction)
              }
            />
            <div className="flex justify-between text-[11px] text-[#96a287]">
              <span>0°</span>
              <span>180°</span>
              <span>360°</span>
            </div>
          </div>
          {(
            [
              {
                key: "intensity",
                label: fire ? "火势" : "辉光强度",
                min: 20,
                max: 100,
              },
              {
                key: "speed",
                label: fire ? "燃烧速度" : "流动速度",
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
              <TransactionalRange
                aria-label={label}
                min={min}
                max={max}
                value={settings[key]}
                onValueChange={(value, transaction) =>
                  change((e) => {
                    e[fire ? "fire" : "rune"][key] = value;
                  }, transaction)
                }
              />
            </label>
          ))}
          <label className="block text-[12px] text-[#77856a]">
            <span className="mb-[10px] flex justify-between">
              {fire ? "扰动强度" : "光晕粗细"}
              <span className="font-mono">
                {fire ? effects.fire.disturbance : effects.rune.haloWidth}%
              </span>
            </span>
            <TransactionalRange
              key={`${effects.type}:interaction`}
              aria-label={fire ? "扰动强度" : "光晕粗细"}
              min={fire ? 0 : 10}
              max={100}
              value={fire ? effects.fire.disturbance : effects.rune.haloWidth}
              onValueChange={(value, transaction) =>
                change((e) => {
                  if (fire) e.fire.disturbance = value;
                  else e.rune.haloWidth = value;
                }, transaction)
              }
            />
          </label>
        </div>
      )}
    </Section>
  );
}
