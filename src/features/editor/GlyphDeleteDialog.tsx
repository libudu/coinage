import { useId } from "react";
import { Button } from "../../shared/components/Button";
import { Modal } from "../../shared/components/Modal";

type Props = {
  name: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function GlyphDeleteDialog({ name, onConfirm, onClose }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <Modal
      onClose={onClose}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="w-[380px]"
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
          <Button size="sm" autoFocus onClick={onClose}>
            取消
          </Button>
          <Button size="sm" variant="danger" onClick={onConfirm}>
            删除
          </Button>
        </div>
      </div>
    </Modal>
  );
}
