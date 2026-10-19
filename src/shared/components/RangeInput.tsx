import type { ComponentProps } from "react";
import "./RangeInput.css";

type Props = Omit<ComponentProps<"input">, "type"> & {
  variant?: "standard" | "row";
};

export function RangeInput({ variant = "standard", className = "", ...props }: Props) {
  return (
    <input
      {...props}
      type="range"
      className={`range-input block appearance-none w-full rounded-[4px] accent-[#769754]
        cursor-pointer disabled:cursor-default ${variant === "row"
          ? "range-input-row h-[28px] mt-0 mx-0 mb-0 [background:linear-gradient(#dfe6d4,#dfe6d4)_center/100%_3px_no-repeat] touch-none select-none"
          : "h-[3px] mt-[8px] mx-0 mb-0 bg-[#dfe6d4]"} ${className}`}
    />
  );
}
