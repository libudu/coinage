import type { KeyboardEvent, PointerEvent } from "react";
import { Input } from "../../shared/components/Input";
import type { InputProps } from "../../shared/components/Input";
import { NumberField } from "../../shared/components/NumberField";
import type { NumberFieldProps } from "../../shared/components/NumberField";
import { useEditTransaction, useProjectActions } from "../project/useProject";
import type { TransactionId } from "../project/projectStore";

type Edit<Value> = (value: Value, transaction: TransactionId) => void;

function useInputTransaction<Value>(onValueChange: Edit<Value>) {
  const { transaction, begin, finish, isActive } = useEditTransaction();
  const { undo, redo } = useProjectActions();
  return {
    onFocus: () => {
      begin();
    },
    onBlur: () => finish(),
    onPointerDown: (event: PointerEvent<HTMLInputElement>) => {
      if (event.button === 0 && event.isPrimary !== false) begin();
    },
    onPaste: () => {
      begin();
    },
    onCut: () => {
      begin();
    },
    onCompositionStart: () => {
      begin();
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y")) {
        event.preventDefault();
        event.stopPropagation();
        finish();
        if (key === "y" || event.shiftKey) redo();
        else undo();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
      } else if (
        !(event.ctrlKey || event.metaKey) ||
        key === "v" ||
        key === "x"
      ) {
        // 保存或撤销后的新输入可开启新事务，迟到的 change 本身不能创建事务。
        if (!event.repeat) begin();
        else if (!isActive()) event.preventDefault();
      }
    },
    onValueChange: (value: Value) => {
      if (isActive()) onValueChange(value, transaction.current!);
    },
  };
}

type ManagedEvents =
  | "onFocus"
  | "onBlur"
  | "onPointerDown"
  | "onPaste"
  | "onCut"
  | "onCompositionStart"
  | "onKeyDown"
  | "onChange";
type TextProps = Omit<InputProps, ManagedEvents | "value"> & {
  value: string;
  onValueChange: Edit<string>;
};

export function TransactionalTextInput({ onValueChange, ...props }: TextProps) {
  const { onValueChange: change, ...events } =
    useInputTransaction(onValueChange);
  return (
    <Input
      {...props}
      {...events}
      onChange={(event) => change(event.target.value)}
    />
  );
}

type NumberProps = Omit<
  NumberFieldProps,
  ManagedEvents | "onValueChange" | "commitOn"
> & { onValueChange: Edit<number> };
export function TransactionalNumberField({
  onValueChange,
  ...props
}: NumberProps) {
  const events = useInputTransaction(onValueChange);
  return <NumberField {...props} {...events} />;
}
