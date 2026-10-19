import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { clamp } from "../../core/model";
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
      className={`icon-button ${active ? "active" : ""}`}
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
    <section className="panel-section">
      <div className="section-heading">
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
    <label className="number-field">
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
