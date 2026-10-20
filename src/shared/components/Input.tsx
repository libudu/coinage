import type { ComponentPropsWithRef } from "react";

const inputStyles = {
  dialog:
    "w-full min-w-0 h-[38px] px-[11px] bg-[#f0f3ea] border border-solid border-[#dce3d3] rounded-[5px] text-[13px] text-[#4b5845]",
  panel:
    "text-field border border-solid border-[#e2e8d8] bg-[#f0f3e9] w-full text-[12px] p-[9px] rounded-[5px]",
  sentence:
    "h-[48px] w-full rounded-[8px] border border-solid border-[#dfe4d7] bg-[#fcfdf9] pl-[16px] pr-[52px] text-[14px] placeholder:text-[#a0a69b]",
  bare: "",
};

export type InputProps = ComponentPropsWithRef<"input"> & {
  variant?: keyof typeof inputStyles;
};

export function Input({
  variant = "dialog",
  type = "text",
  className = "",
  ...props
}: InputProps) {
  return (
    <input
      {...props}
      type={type}
      className={`${inputStyles[variant]} ${className}`}
    />
  );
}
