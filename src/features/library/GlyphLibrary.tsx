import { useMemo, useState } from "react";
import type { Glyph } from "../../core/model";
import { GlyphPreview } from "../editor/GlyphPreview";
import { useProject } from "../project/useProject";

export function GlyphLibrary({ onEdit }: { onEdit: (id: string) => void }) {
  const glyphs = useProject((s) => s.project.glyphs);
  const brush = useProject((s) => s.project.brush);
  const [sentence, setSentence] = useState("");
  const characters = useMemo(() => {
    const result = new Map<string, Glyph>();
    for (const glyph of glyphs) {
      if (glyph.name.trim() && !result.has(glyph.name))
        result.set(glyph.name, glyph);
    }
    return Array.from(result.values()).sort((a, b) => b.name.length - a.name.length);
  }, [glyphs]);
  const preview = useMemo(() => {
    const cells: { text: string; glyph?: Glyph }[] = [];
    // 优先匹配完整的较长汉语，缺字按 Unicode 码点保留一个空字格。
    for (let offset = 0; offset < sentence.length;) {
      const glyph = characters.find((item) => sentence.startsWith(item.name, offset));
      const text = glyph?.name ?? String.fromCodePoint(sentence.codePointAt(offset)!);
      cells.push({ text, glyph });
      offset += text.length;
    }
    return cells;
  }, [characters, sentence]);

  return (
    <main aria-label="字库" className="h-full overflow-auto bg-[#f7f8f4] px-[48px] py-[48px] tablet:px-[28px] compact:px-[20px] compact:py-[28px]">
      <div className="mx-auto max-w-[1120px]">
        <section aria-label="造句预览" className="border-b border-solid border-[var(--border)] pb-[32px]">
          <input
            type="text"
            aria-label="造句预览"
            placeholder="输入一句话"
            value={sentence}
            onChange={(event) => setSentence(event.target.value)}
            className="h-[48px] w-full rounded-[8px] border border-solid border-[#dfe4d7] bg-[#fcfdf9] px-[16px] text-[14px] placeholder:text-[#a0a69b]"
          />
          {preview.length > 0 && (
            <div role="group" aria-label="句子预览" className="mt-[24px] flex flex-wrap gap-[6px]">
              {preview.map(({ text, glyph }, index) => (
                <div
                  key={index}
                  role="img"
                  aria-label={glyph ? text : `${text}（缺字）`}
                  className={`h-[80px] w-[80px] shrink-0 rounded-[3px] border border-solid [&_svg]:h-full [&_svg]:w-full compact:h-[64px] compact:w-[64px] ${glyph ? "border-[#c3cdbb] bg-[#fcfdf9]" : "border-2 border-[#b2c0a8] bg-[#edf1e6]"}`}
                >
                  {glyph && <GlyphPreview glyph={glyph} brush={brush} />}
                </div>
              ))}
            </div>
          )}
        </section>
        <section aria-label="全部字符" className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-[16px] pt-[32px] compact:grid-cols-[repeat(auto-fill,minmax(88px,1fr))] compact:gap-[10px]">
          {glyphs.map((glyph, index) => (
            <button
              key={glyph.id}
              type="button"
              aria-label={`编辑 ${glyph.name || `字符 ${String(index + 1).padStart(2, "0")}`}`}
              onClick={() => onEdit(glyph.id)}
              className="flex min-w-0 flex-col items-center gap-[12px] rounded-[9px] border border-solid border-[#e4e8dc] bg-[#fcfdf9] px-[12px] pb-[14px] pt-[16px] hover:border-[#cddbb9] hover:bg-[#edf2e3]"
            >
              <span className="block aspect-square w-full max-w-[120px] [&_svg]:h-full [&_svg]:w-full">
                <GlyphPreview glyph={glyph} brush={brush} />
              </span>
              {(glyph.name || glyph.description) && (
                <span className="flex w-full min-w-0 flex-col gap-[5px] text-center">
                  {glyph.name && <span className="truncate text-[12px]" title={glyph.name}>{glyph.name}</span>}
                  {glyph.description && <span className="truncate text-[11px] text-[#a0a69b]" title={glyph.description}>{glyph.description}</span>}
                </span>
              )}
            </button>
          ))}
        </section>
      </div>
    </main>
  );
}
