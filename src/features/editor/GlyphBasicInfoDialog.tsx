import { Input } from "../../shared/components/Input";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../../shared/components/Button";
import { Modal } from "../../shared/components/Modal";

type Props = {
  name: string;
  description: string;
  onConfirm: (info: { name: string; description: string }) => void;
  onClose: () => void;
};

export function GlyphBasicInfoDialog({
  name,
  description,
  onConfirm,
  onClose,
}: Props) {
  const [value, setValue] = useState(name);
  const [descriptionValue, setDescriptionValue] = useState(description);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const inputId = useId();
  const descriptionId = useId();

  useEffect(() => {
    input.current?.select();
  }, []);
  return (
    <Modal
      onClose={onClose}
      initialFocus={input}
      aria-labelledby={titleId}
      className="w-[380px]"
    >
      <form
        className="p-[27px]"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm({
            name: value.trim(),
            description: descriptionValue.trim(),
          });
        }}
      >
        <h2
          id={titleId}
          className="m-0 mb-[23px] text-[20px] font-semibold tracking-[1px]"
        >
          编辑基本信息
        </h2>
        <label
          htmlFor={inputId}
          className="block mb-[9px] text-[12px] text-[#77856a]"
        >
          对应汉语
        </label>
        <Input
          ref={input}
          id={inputId}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <label
          htmlFor={descriptionId}
          className="block mb-[9px] mt-[18px] text-[12px] text-[#77856a]"
        >
          描述
        </label>
        <Input
          id={descriptionId}
          value={descriptionValue}
          onChange={(e) => setDescriptionValue(e.target.value)}
        />
        <div className="flex justify-end gap-[9px] mt-[25px]">
          <Button size="sm" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" variant="primary" type="submit">
            确认
          </Button>
        </div>
      </form>
    </Modal>
  );
}
