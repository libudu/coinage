import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { buttonStateClasses } from "../../shared/components/controls";

export type GlyphExportProps = {
  onExportSvg: () => void;
  onExportPng: () => void;
};

export function GlyphExport({ onExportSvg, onExportPng }: GlyphExportProps) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: Event) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const close = () => setOpen(false);
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("focusin", closeOutside);
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("focusin", closeOutside);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", close);
    };
  }, [open]);
  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div
      ref={container}
      className="split-button dropdown-wrap flex relative [&>.button]:rounded-[6px_0_0_6px] [&>.button]:border-r
        [&>.button]:[border-right-style:solid] [&>.button]:border-r-[#52705b]"
    >
      <button
        type="button"
        className={`button primary flex-1 min-w-0 px-[14px] h-[37px] inline-flex items-center justify-center gap-[8px] border
          [border-style:solid] border-[#dfe4d7] rounded-[6px] text-[12px] font-[550] whitespace-nowrap ${buttonStateClasses}`}
        onClick={() => run(onExportSvg)}
      >
        <Icon name="download" />
        导出 SVG
      </button>
      <button
        ref={toggle}
        type="button"
        className="split-arrow h-[37px] w-[29px] shrink-0 grid place-items-center bg-[#2d4e3b] text-[#e5eedc]
          rounded-[0_6px_6px_0] enabled:hover:bg-[#3d6248] enabled:hover:text-white!"
        aria-label="更多导出格式"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div
          id={menuId}
          className="dropdown export-dropdown absolute bottom-[calc(100%_+_9px)] right-0 bg-[#fcfdf9] border [border-style:solid]
            border-[#dfe3d7] shadow-[0_10px_35px_#22321a14] rounded-[9px] w-[204px] p-[6px] z-[50] [&_button]:flex
            [&_button]:items-center [&_button]:gap-[10px] [&_button]:w-full [&_button]:text-[12px]
            [&_button]:py-[11px] [&_button]:px-[10px] [&_button]:text-left [&_button]:rounded-[5px] [&_button:hover]:bg-[#edf2e6]"
        >
          <button type="button" onClick={() => run(onExportSvg)}>
            <Icon name="node" />
            SVG 矢量图
          </button>
          <button type="button" onClick={() => run(onExportPng)}>
            <Icon name="image" />
            PNG 透明图片
          </button>
        </div>
      )}
    </div>
  );
}
