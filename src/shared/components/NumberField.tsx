import { NumberInput } from "./NumberInput";
import type { NumberInputProps } from "./NumberInput";

export type NumberFieldProps = NumberInputProps & {
  label: string;
  suffix?: string;
  fieldClassName?: string;
};

export function NumberField({
  label,
  suffix,
  fieldClassName = "",
  value,
  ...props
}: NumberFieldProps) {
  return (
    <label
      className={`number-field flex items-center gap-[8px] bg-[#f0f3ea] border border-solid border-[#e7ecdf] rounded-[5px] h-[33px] py-0 px-[9px] min-w-0 [&>span]:text-[12px] [&>span]:text-[#77856a] [&>span]:shrink-0 [&>input]:w-full [&>input]:min-w-0 [&>input]:bg-[transparent] [&>input]:[border:0] [&>input]:[font-family:ui-monospace,_monospace] [&>input]:text-[12px] [&>input]:text-[#5c6e4d] [&>input]:text-right [&>input]:p-0 [&>small]:text-[12px] [&>small]:text-[#9ba68e] ${fieldClassName}`}
    >
      <span>{label}</span>
      <NumberInput
        aria-label={label}
        {...props}
        value={Math.round(value * 10) / 10}
      />
      {suffix && <small>{suffix}</small>}
    </label>
  );
}
