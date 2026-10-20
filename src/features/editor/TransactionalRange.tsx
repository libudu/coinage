import { useRef } from "react";
import type { ComponentProps } from "react";
import { RangeInput } from "../../shared/components/RangeInput";
import { clamp } from "../../core/geometry";
import type { TransactionId } from "../project/projectStore";
import { useEditTransaction, useProjectActions } from "../project/useProject";

const adjustmentKeys = new Set([
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown",
]);
type Props = Omit<ComponentProps<typeof RangeInput>,
  "onChange" | "onFocus" | "onBlur" | "onKeyDown" | "onKeyUp" | "onPointerDown" |
  "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture"> & {
  onValueChange: (value: number, transaction: TransactionId) => void;
};

// 原生滑块与扩大拖动区域的笔锋滑块统一管理指针归属。
// 交互结束后的迟到输入或指针事件，不得成为新的独立编辑。
export function TransactionalRange({ onValueChange, variant, ...props }: Props) {
  const pointer = useRef<number | null>(null);
  const { transaction, begin, finish, isActive } = useEditTransaction(() => { pointer.current = null; });
  const { undo, redo } = useProjectActions();
  const change = (value: number) => {
    if (isActive() && Number.isFinite(value)) onValueChange(value, transaction.current!);
  };
  const dragTo = (input: HTMLInputElement, clientX: number) => {
    if (variant !== "row") return;
    const rect = input.getBoundingClientRect();
    const fraction = clamp((clientX - rect.left - 8) / Math.max(1, rect.width - 16), 0, 1);
    const min = Number(props.min ?? 0), max = Number(props.max ?? 100);
    change(Math.round(min + fraction * (max - min)));
  };
  return <RangeInput {...props} variant={variant}
    onFocus={() => { begin(); }}
    onBlur={() => finish()}
    onPointerDown={(e) => {
      if (e.button !== 0 || e.isPrimary === false || pointer.current !== null) return;
      if (variant === "row") { e.preventDefault(); e.currentTarget.focus(); }
      begin();
      pointer.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragTo(e.currentTarget, e.clientX);
    }}
    onPointerMove={(e) => {
      if (pointer.current === e.pointerId) dragTo(e.currentTarget, e.clientX);
    }}
    onPointerUp={(e) => {
      if (pointer.current !== e.pointerId) return;
      dragTo(e.currentTarget, e.clientX);
      finish();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    }}
    onPointerCancel={(e) => { if (pointer.current === e.pointerId) finish(true); }}
    onLostPointerCapture={(e) => { if (pointer.current === e.pointerId) finish(); }}
    onChange={(e) => change(e.target.valueAsNumber)}
    onKeyDown={(e) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === "z" || key === "y")) {
        e.preventDefault();
        e.stopPropagation();
        if (key === "y" || e.shiftKey) redo();
        else undo();
      } else if (adjustmentKeys.has(e.key)) {
        if (e.repeat && !isActive()) e.preventDefault();
        else begin();
      } else if (e.key === "Escape" && transaction.current) {
        e.preventDefault();
        e.stopPropagation();
        finish(true);
      }
    }}
    onKeyUp={(e) => { if (adjustmentKeys.has(e.key)) finish(); }} />;
}
