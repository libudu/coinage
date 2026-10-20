import { useEffect, useRef, useState } from "react";
import { Input } from "./Input";
import type { InputProps } from "./Input";

export type NumberInputProps = Omit<
  InputProps,
  "type" | "value" | "defaultValue" | "min" | "max" | "variant"
> & {
  value: number;
  min?: number;
  max?: number;
  onValueChange: (value: number) => void;
  commitOn?: "change" | "blur";
  variant?: "compact" | "bare";
};

export function NumberInput({
  value,
  min,
  max,
  onValueChange,
  commitOn = "change",
  variant = "bare",
  className = "",
  onFocus,
  onBlur,
  onChange,
  onKeyDown,
  ...props
}: NumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  const draftValue = useRef(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    draftValue.current = String(value);
    setDraft(String(value));
  }, [value]);
  const submit = (text: string) => {
    if (!text.trim() || !Number.isFinite(Number(text))) return;
    const next = Math.min(
      max ?? Infinity,
      Math.max(min ?? -Infinity, Number(text)),
    );
    if (commitOn === "change" || next !== value) onValueChange(next);
  };
  return (
    <Input
      {...props}
      variant="bare"
      type="number"
      min={min}
      max={max}
      value={commitOn === "blur" && editing ? draft : value}
      className={`${variant === "compact" ? "w-[52px] min-w-0 border border-solid border-[#e2e8d9] rounded-[3px] py-[2px] px-[3px] bg-[#fcfdf8] text-[#345c29] text-[12px]" : ""} ${className}`}
      onFocus={(event) => {
        draftValue.current = String(value);
        setDraft(String(value));
        setEditing(true);
        onFocus?.(event);
      }}
      onChange={(event) => {
        if (commitOn === "blur") {
          draftValue.current = event.target.value;
          setDraft(event.target.value);
        } else submit(event.target.value);
        onChange?.(event);
      }}
      onBlur={(event) => {
        setEditing(false);
        if (commitOn === "blur") submit(draftValue.current);
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          event.keyCode === 229 ||
          commitOn !== "blur"
        )
          return;
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          draftValue.current = String(value);
          setDraft(String(value));
        }
      }}
    />
  );
}
