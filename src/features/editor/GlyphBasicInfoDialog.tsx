import { useEffect, useId, useRef, useState } from "react";
import { buttonStateClasses } from "../../shared/components/controls";

type Props = {
  name: string;
  description: string;
  onConfirm: (info: { name: string; description: string }) => void;
  onClose: () => void;
};

export function GlyphBasicInfoDialog({ name, description, onConfirm, onClose }: Props) {
  const [value, setValue] = useState(name);
  const [descriptionValue, setDescriptionValue] = useState(description);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const inputId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    input.current?.select();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="m-auto w-[380px] max-w-[calc(100vw_-_30px)] max-h-[calc(100dvh_-_30px)] overflow-auto p-0
        bg-[#fafbf6] text-[#313a33] border [border-style:solid] border-[#e4e8dc] rounded-[15px]
        shadow-[0_24px_90px_#172b2433] backdrop:bg-[#1f30244f] backdrop:backdrop-blur-[5px]"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <form
        className="p-[27px]"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm({ name: value.trim(), description: descriptionValue.trim() });
        }}
      >
        <h2 id={titleId} className="m-0 mb-[23px] text-[20px] font-semibold tracking-[1px]">编辑基本信息</h2>
        <label htmlFor={inputId} className="block mb-[9px] text-[12px] text-[#77856a]">对应汉语</label>
        <input
          ref={input}
          id={inputId}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full min-w-0 h-[38px] px-[11px] bg-[#f0f3ea] border [border-style:solid]
            border-[#dce3d3] rounded-[5px] text-[13px] text-[#4b5845]"
        />
        <label htmlFor={descriptionId} className="block mb-[9px] mt-[18px] text-[12px] text-[#77856a]">描述</label>
        <input
          id={descriptionId}
          value={descriptionValue}
          onChange={(e) => setDescriptionValue(e.target.value)}
          className="w-full min-w-0 h-[38px] px-[11px] bg-[#f0f3ea] border [border-style:solid]
            border-[#dce3d3] rounded-[5px] text-[13px] text-[#4b5845]"
        />
        <div className="flex justify-end gap-[9px] mt-[25px]">
          <button type="button" onClick={onClose}
            className={`h-[35px] px-[15px] border [border-style:solid] border-[#dfe4d7] rounded-[6px] text-[12px] ${buttonStateClasses}`}>
            取消
          </button>
          <button type="submit"
            className={`primary h-[35px] px-[15px] border [border-style:solid] rounded-[6px] text-[12px] ${buttonStateClasses}`}>
            确认
          </button>
        </div>
      </form>
    </dialog>
  );
}
