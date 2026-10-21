import { defaultProjectStyle } from "../../core/glyphEffects";
import { EffectControls } from "./EffectControls";
import { EffectPreview } from "./EffectPreview";
import { Button } from "../../shared/components/Button";
import { Section } from "../../shared/components/controls";
import { GlyphPreview } from "../editor/GlyphPreview";
import {
  useActiveGlyph,
  useProject,
  useProjectActions,
} from "../project/useProject";

export function StyleWorkspace({ active = true }: { active?: boolean }) {
  const glyph = useActiveGlyph();
  const brush = useProject((s) => s.project.brush);
  const style = useProject((s) => s.project.style ?? defaultProjectStyle);
  const { changeStyle } = useProjectActions();

  return (
    <main
      aria-label="样式"
      className="h-full overflow-auto bg-[#f7f8f4] px-[48px] py-[48px] tablet:px-[28px] compact:px-[20px] compact:py-[28px]"
    >
      <div className="mx-auto max-w-[840px]">
        <h2 className="m-0 mb-[28px] text-[20px] font-semibold">样式</h2>
        <div className="grid grid-cols-[minmax(0,400px)_minmax(324px,340px)] items-start gap-[32px] compact:grid-cols-1 compact:gap-[20px]">
          <div className="mx-auto w-full min-w-0 max-w-[400px]">
            <EffectPreview
              glyphs={[glyph]}
              brush={brush}
              effects={style.effects}
              active={active}
            >
              <div
                data-effect-glyph={glyph.id}
                role="img"
                aria-label={`${glyph.name || "当前字符"}预览`}
                className="aspect-square w-full rounded-[8px] border border-solid border-[var(--border)] bg-transparent [&_svg]:h-full [&_svg]:w-full"
              >
                <GlyphPreview glyph={glyph} brush={brush} color={style.color} />
              </div>
            </EffectPreview>
            {(glyph.name || glyph.description) && (
              <div className="mt-[16px] text-center">
                {glyph.name && (
                  <div className="break-words text-[14px]">{glyph.name}</div>
                )}
                {glyph.description && (
                  <div className="mt-[6px] break-words text-[12px] text-[#a0a69b]">
                    {glyph.description}
                  </div>
                )}
              </div>
            )}
          </div>
          <aside
            aria-label="样式配置"
            className="rounded-[8px] border border-solid border-[var(--border)] bg-[var(--panel)]"
          >
            <Section title="外观">
              <div
                className="color-row flex items-center gap-[10px] [font-family:ui-monospace,_monospace] text-[12px] bg-[#f1f4eb]
            border [border-style:solid] border-[#e6ebdd] rounded-[5px] h-[35px] py-0 px-[8px] text-[#748464]"
              >
                <label
                  className="color-swatch block w-[19px] h-[19px] rounded-[4px] border [border-style:solid] border-[#0000000a]
              overflow-hidden cursor-pointer [&>input]:w-[40px] [&>input]:h-[40px] [&>input]:m-[-9px]
              [&>input]:cursor-pointer [&>input]:opacity-0"
                  style={{ background: style.color }}
                >
                  <input
                    type="color"
                    aria-label="笔画颜色"
                    value={style.color}
                    onChange={(e) =>
                      changeStyle((s) => {
                        s.color = e.target.value;
                      })
                    }
                  />
                </label>
                <span>{style.color.toUpperCase()}</span>
                <span className="color-opacity ml-auto text-[12px] text-[#96a287] border-l [border-left-style:solid] border-l-[#dfe6d4] pl-[10px]">
                  100%
                </span>
              </div>
              <div
                className="preset-colors flex gap-[12px] mt-[13px] p-[2px] [&>button]:w-[17px] [&>button]:h-[17px]
            [&>button]:rounded-[50%] [&>button]:border-[2px] [&>button]:[border-style:solid]
            [&>button]:border-[#fafbf7] laptop:gap-[11px] tablet:gap-[10px] [&>button.selected]:[outline:1px_solid_#8f9f80] [&>button.selected]:outline-offset-[2px]"
              >
                {[
                  "#243d34",
                  "#222222",
                  "#7b281d",
                  "#4562a6",
                  "#88729b",
                  "#b69250",
                ].map((color) => (
                  <Button
                    variant="bare"
                    key={color}
                    className={style.color === color ? "selected" : ""}
                    style={{ background: color }}
                    title={color}
                    aria-label={`使用颜色 ${color}`}
                    onClick={() =>
                      changeStyle((s) => {
                        s.color = color;
                      })
                    }
                  />
                ))}
              </div>
            </Section>
            <EffectControls />
          </aside>
        </div>
      </div>
    </main>
  );
}
