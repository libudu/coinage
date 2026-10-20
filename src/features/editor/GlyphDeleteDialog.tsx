import { useEffect, useId, useRef } from "react";
import { buttonStateClasses } from "../../shared/components/controls";

type Props = {
  name: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function GlyphDeleteDialog({ name, onConfirm, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="m-auto w-[380px] max-w-[calc(100vw_-_30px)] max-h-[calc(100dvh_-_30px)] overflow-auto p-0
        bg-[#fafbf6] text-[#313a33] border border-solid border-[#e4e8dc] rounded-[15px]
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
      <div className="p-[27px]">
        <h2
          id={titleId}
          className="m-0 mb-[18px] text-[20px] font-semibold tracking-[1px]"
        >
          删除字符
        </h2>
        <p
          id={descriptionId}
          className="m-0 text-[13px] leading-[1.8] break-words"
        >
          确定删除「{name}」？此操作无法撤销。
        </p>
        <div className="flex justify-end gap-[9px] mt-[25px]">
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className={`h-[35px] px-[15px] border border-solid border-[#dfe4d7] rounded-[6px] text-[12px] ${buttonStateClasses}`}
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-[35px] px-[15px] border border-solid border-[#a44c3a] rounded-[6px] text-[12px]
              bg-[#a44c3a] text-white hover:bg-[#913e2e]"
          >
            删除
          </button>
        </div>
      </div>
    </dialog>
  );
}
