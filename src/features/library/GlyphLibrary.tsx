import { defaultProjectStyle } from "../../core/glyphEffects";
import { EffectPreview } from "../styles/EffectPreview";
import { Input } from "../../shared/components/Input";
import { Button } from "../../shared/components/Button";
import { useMemo, useState } from "react";
import type { Glyph, Point } from "../../core/model";
import { Icon } from "../../shared/components/Icon";
import {
  loadLocalSettings,
  saveLocalSettings,
} from "../../shared/utils/localSettings";
import { GlyphPreview } from "../editor/GlyphPreview";
import { useProject } from "../project/useProject";

type Props = {
  active?: boolean;
  onEdit: (id: string) => void;
  openGlyphContextMenu: (id: string, position: Point) => void;
};

export function GlyphLibrary({
  onEdit,
  openGlyphContextMenu,
  active = true,
}: Props) {
  const glyphs = useProject((s) => s.project.glyphs);
  const brush = useProject((s) => s.project.brush);
  const style = useProject((s) => s.project.style ?? defaultProjectStyle);
  const [sentence, setSentence] = useState("");
  const [showGrid, setShowGrid] = useState(
    () => loadLocalSettings().showSentenceGrid,
  );
  const characters = useMemo(() => {
    const result = new Map<string, Glyph>();
    for (const glyph of glyphs) {
      if (glyph.name.trim() && !result.has(glyph.name))
        result.set(glyph.name, glyph);
    }
    return Array.from(result.values()).sort(
      (a, b) => b.name.length - a.name.length,
    );
  }, [glyphs]);
  const preview = useMemo(() => {
    const cells: { text: string; glyph?: Glyph }[] = [];
    // 优先匹配完整的较长汉语，缺字按 Unicode 码点保留一个空字格。
    for (let offset = 0; offset < sentence.length;) {
      const glyph = characters.find((item) =>
        sentence.startsWith(item.name, offset),
      );
      const text =
        glyph?.name ?? String.fromCodePoint(sentence.codePointAt(offset)!);
      cells.push({ text, glyph });
      offset += text.length;
    }
    return cells;
  }, [characters, sentence]);

  return (
    <main
      aria-label="字库"
      className="h-full overflow-auto bg-[#f7f8f4] px-[48px] py-[48px] tablet:px-[28px] compact:px-[20px] compact:py-[28px]"
    >
      <div className="mx-auto max-w-[1120px]">
        <section
          aria-label="造句预览"
          className="border-b border-solid border-[var(--border)] pb-[32px]"
        >
          <div className="relative">
            <Input
              variant="sentence"
              type="text"
              aria-label="造句预览"
              placeholder="输入一句话"
              value={sentence}
              onChange={(event) => setSentence(event.target.value)}
            />
            <Button
              variant="bare"
              type="button"
              aria-label="显示字格"
              aria-pressed={showGrid}
              title={showGrid ? "隐藏字格" : "显示字格"}
              onClick={() => {
                const next = !showGrid;
                setShowGrid(next);
                saveLocalSettings({ showSentenceGrid: next });
              }}
              className={`absolute right-[8px] top-[8px] grid h-[32px] w-[32px] place-items-center rounded-[5px]
                ${showGrid ? "bg-[#e7eddf] text-[#385e3d] hover:bg-[#dce7d3]" : "text-[#7a8671] hover:bg-[#edf1e6]"}`}
            >
              <Icon name="grid" size={18} />
            </Button>
          </div>
          {preview.length > 0 && (
            <EffectPreview
              glyphs={preview.flatMap(({ glyph }) => (glyph ? [glyph] : []))}
              brush={brush}
              effects={style.effects}
              active={active}
              className="mt-[24px]"
            >
              <div
                role="group"
                aria-label="句子预览"
                className="flex flex-wrap gap-[6px]"
              >
                {preview.map(({ text, glyph }, index) => (
                  <div
                    key={index}
                    data-effect-glyph={glyph?.id}
                    role="img"
                    aria-label={glyph ? text : `${text}（缺字）`}
                    className={`h-[100px] w-[100px] shrink-0 rounded-[3px] border border-solid [&_svg]:h-full [&_svg]:w-full compact:h-[80px] compact:w-[80px] ${glyph ? (showGrid ? "border-[#c3cdbb] bg-transparent" : "border-transparent bg-transparent") : "border-2 border-[#b2c0a8] bg-[#edf1e6]"}`}
                  >
                    {glyph && (
                      <GlyphPreview
                        glyph={glyph}
                        brush={brush}
                        color={style.color}
                      />
                    )}
                  </div>
                ))}
              </div>
            </EffectPreview>
          )}
        </section>
        <section
          aria-label="全部字符"
          className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-[16px] pt-[32px] compact:grid-cols-[repeat(auto-fill,minmax(88px,1fr))] compact:gap-[10px]"
        >
          {glyphs.map((glyph, index) => (
            <Button
              variant="bare"
              key={glyph.id}
              type="button"
              aria-label={`编辑 ${glyph.name || `字符 ${String(index + 1).padStart(2, "0")}`}`}
              onClick={() => onEdit(glyph.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                openGlyphContextMenu(glyph.id, {
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
              className="flex min-w-0 flex-col items-center gap-[12px] rounded-[9px] border border-solid border-[#e4e8dc] bg-[#fcfdf9] px-[12px] pb-[14px] pt-[16px] hover:border-[#cddbb9] hover:bg-[#edf2e3]"
            >
              <span className="block aspect-square w-full max-w-[120px] [&_svg]:h-full [&_svg]:w-full">
                <GlyphPreview glyph={glyph} brush={brush} color={style.color} />
              </span>
              {(glyph.name || glyph.description) && (
                <span className="flex w-full min-w-0 flex-col gap-[5px] text-center">
                  {glyph.name && (
                    <span className="truncate text-[12px]" title={glyph.name}>
                      {glyph.name}
                    </span>
                  )}
                  {glyph.description && (
                    <span
                      className="truncate text-[11px] text-[#a0a69b]"
                      title={glyph.description}
                    >
                      {glyph.description}
                    </span>
                  )}
                </span>
              )}
            </Button>
          ))}
        </section>
      </div>
    </main>
  );
}
