import type { ComponentPropsWithRef } from "react";

const buttonStateClasses = `enabled:hover:bg-[#f0f4e9]
  [&.primary]:bg-[#2d4e3b] [&.primary]:border-[#2d4e3b] [&.primary]:text-[#f8fbf2]
  [&.primary:not(:disabled):hover]:bg-[#3d6248] [&.primary:not(:disabled):hover]:text-white!`;

type Props = ComponentPropsWithRef<"button"> & {
  variant?: "default" | "primary" | "danger" | "bare";
  size?: "sm" | "md";
};

export function Button({
  variant = "default",
  size = "md",
  type = "button",
  className = "",
  ...props
}: Props) {
  const appearance =
    variant === "bare"
      ? ""
      : `button inline-flex items-center justify-center gap-[8px] border border-solid rounded-[6px] text-[12px] whitespace-nowrap
    ${size === "sm" ? "h-[35px] px-[15px]" : "h-[37px] px-[14px] font-[550]"}
    ${variant === "danger" ? "border-[#a44c3a] bg-[#a44c3a] text-white enabled:hover:bg-[#913e2e]" : `border-[#dfe4d7] ${variant === "primary" ? "primary" : size === "sm" ? "" : "bg-[#fcfdf9]"} ${buttonStateClasses}`}`;
  return (
    <button {...props} type={type} className={`${appearance} ${className}`} />
  );
}
