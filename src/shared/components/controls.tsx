import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { clamp } from "../../core/geometry";

export const buttonStateClasses = `enabled:hover:bg-[#f0f4e9]
  [&.primary]:bg-[#2d4e3b] [&.primary]:border-[#2d4e3b] [&.primary]:text-[#f8fbf2]
  [&.primary:not(:disabled):hover]:bg-[#3d6248] [&.primary:not(:disabled):hover]:text-white!`;

export const segmentedStateClasses = `[&>button.active]:bg-[#fcfdf8]
  [&>button.active]:shadow-[0_1px_3px_#334b2410] [&>button.active]:text-[#50713c]!`;

export function IconButton({
  icon,
  title,
  active = false,
  onClick,
  disabled = false,
}: {
  icon: IconName;
  title: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""} w-[32px] h-[32px] flex items-center justify-center
        rounded-[6px] text-[#798273] shrink-0 enabled:hover:bg-[#edf1e6]
        [&.active]:bg-[#e7eddf] [&.active]:text-[#37533a]`}
      aria-label={title}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} />
    </button>
  );
}
export function Section({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel-section py-[22px] px-[20px] border-b [border-bottom-style:solid] border-b-[var(--border)] last:[border-bottom:0]
      wide:p-[25px] laptop:py-[20px] laptop:px-[16px] tablet:py-[18px] tablet:px-[14px]">
      <div className="section-heading flex items-center justify-between mb-[19px] gap-[8px] [&_h3]:text-[12px]
        [&_h3]:font-semibold [&_h3]:m-0 [&_h3]:tracking-[0.5px]">
        <h3>{title}</h3>
        {trailing}
      </div>
      {children}
    </section>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 640,
  suffix,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <label className="number-field flex items-center gap-[8px] bg-[#f0f3ea] border [border-style:solid] border-[#e7ecdf]
      rounded-[5px] h-[33px] py-0 px-[9px] min-w-0 [&>span]:text-[10px] [&>span]:text-[#77856a]
      [&>span]:shrink-0 [&>input]:w-full [&>input]:min-w-0 [&>input]:bg-[transparent] [&>input]:[border:0]
      [&>input]:[font-family:ui-monospace,_monospace] [&>input]:text-[11px] [&>input]:text-[#5c6e4d]
      [&>input]:text-right [&>input]:p-0 [&>small]:text-[9px] [&>small]:text-[#9ba68e]">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        disabled={disabled}
        value={Math.round(value * 10) / 10}
        onChange={(e) => {
          if (e.target.value !== "") onChange(clamp(+e.target.value, min, max));
        }}
      />
      {suffix && <small>{suffix}</small>}
    </label>
  );
}
