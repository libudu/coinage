import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../../shared/components/Icon";

type Props = {
  addGlyph: () => void;
  importGlyph: () => void;
};

export function AddGlyphMenu({ addGlyph, importGlyph }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const closeOutside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", closeOutside);
    return () => window.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const choose = (action: () => void) => {
    setOpen(false);
    trigger.current?.focus();
    action();
  };

  return (
    <div
      ref={root}
      className="relative shrink-0"
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") setOpen(true);
      }}
      onPointerLeave={() => setOpen(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          setOpen(true);
          const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1
            : index < 0 ? (e.key === "ArrowUp" ? items.length - 1 : 0)
            : (index + (e.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
          requestAnimationFrame(() => items[next]?.focus());
        }
      }}
    >
      <button
        ref={trigger}
        className="flex items-center justify-center w-[28px] h-[28px] rounded-[6px] border [border-style:solid]
          border-[#dfe4d7] bg-[#fcfdf9] text-[#798273] hover:bg-[#edf1e6] compact:w-[22px] compact:h-[22px]"
        aria-label="新建字符"
        title="新建字符"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" size={16} />
      </button>
      <div className="absolute top-full left-0 pt-[6px] z-[30]" hidden={!open}>
        <div
          id={menuId}
          role="menu"
          aria-label="新建字符"
          className="w-max whitespace-nowrap p-[5px] bg-[#fcfdf9] border [border-style:solid] border-[#dfe3d7] rounded-[7px]
            shadow-[0_8px_28px_#203d2226,_0_2px_6px_#203d2212] text-[12px] font-normal
            [&>button]:flex [&>button]:items-center [&>button]:gap-[9px] [&>button]:w-full [&>button]:h-[34px]
            [&>button]:px-[9px] [&>button]:rounded-[4px] [&>button]:text-left [&>button]:text-[#53674b]
            [&>button:hover]:bg-[#edf3e4] [&>button:focus-visible]:bg-[#edf3e4] [&>button:focus-visible]:outline-offset-[-2px]"
        >
          <button role="menuitem" onClick={() => choose(addGlyph)}>
            <Icon name="plus" size={16} />
            新建空白字符
          </button>
          <button role="menuitem" onClick={() => choose(importGlyph)}>
            <Icon name="image" size={16} />
            从图片导入字符
          </button>
        </div>
      </div>
    </div>
  );
}
