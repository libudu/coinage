import type { ComponentPropsWithRef, ReactNode } from "react";
import { Button } from "./Button";

const activeStyles =
  "[&>button.active]:bg-[#fcfdf8] [&>button.active]:shadow-[0_1px_3px_#334b2410] [&>button.active]:text-[#50713c]!";
const standardStyles =
  "segmented flex border border-solid border-[#e2e8d9] rounded-[6px] p-[3px] bg-[#f1f4eb] gap-[3px] [&>button]:flex-1 [&>button]:min-w-0 [&>button]:py-[7px] [&>button]:px-[4px] [&>button]:text-[12px] [&>button]:rounded-[3px] [&>button]:text-[#87957b] [&>button]:flex [&>button]:justify-center [&>button]:items-center [&>button]:gap-[6px]";
const controlStyles = {
  standard: `${standardStyles} ${activeStyles}`,
  compact: `segmented flex shrink-0 border border-solid border-[#e2e8d9] rounded-[6px] bg-[#f0f3ea] p-[2px] [&>button]:h-[25px] [&>button]:px-[7px] [&>button]:rounded-[4px] [&>button]:text-[12px] laptop:[&>button]:px-[3px] [&>button]:text-[#77856a] [&>button]:whitespace-nowrap compact:[&>button]:w-[15px] compact:[&>button]:px-0 compact:[&>button]:grid compact:[&>button]:place-items-center ${activeStyles}`,
  cards:
    "node-type-options grid grid-cols-[repeat(3,_1fr)] gap-[7px] [&>button]:flex [&>button]:flex-col [&>button]:items-center [&>button]:justify-center [&>button]:gap-[8px] [&>button]:h-[60px] [&>button]:border [&>button]:border-solid [&>button]:border-[#e1e7d9] [&>button]:rounded-[6px] [&>button]:text-[#91a082] [&>button]:text-[12px] [&>button]:bg-[#f9fbf4] [&>button.active]:border-[#adc28b] [&>button.active]:bg-[#e9f0dc] [&>button.active]:text-[#55743e]! [&>button:hover:not(:disabled)]:bg-[#eff4e6] [&>button.active:hover:not(:disabled)]:bg-[#eff4e6]",
  brush: `${standardStyles} brush-tip-options [&.brush-tip-options>button]:flex-col [&.brush-tip-options>button]:gap-[2px] [&.brush-tip-options>button]:py-[5px] [&.brush-tip-options>button]:px-[2px] [&.brush-tip-options>button]:text-[12px] [&.brush-tip-options_svg]:block [&.brush-tip-options_svg]:w-full [&.brush-tip-options_svg]:h-[22px] ${activeStyles}`,
  shape: `${standardStyles} shape-options [&.shape-options>button]:flex-col [&.shape-options>button]:gap-[7px] [&.shape-options>button]:py-[8px] [&.shape-options>button]:px-[2px] [&.shape-options>button]:text-[12px] [&.shape-options>button>svg]:w-[20px] [&.shape-options>button>svg]:h-[20px] [&.shape-options>button]:text-[#77856a] ${activeStyles}`,
  presets:
    "brush-presets grid grid-cols-[repeat(4,_minmax(0,_1fr))] gap-[5px] [&_svg]:block [&_svg]:w-full [&_svg]:h-[22px] [&>button]:min-w-0 [&>button]:py-[4px] [&>button]:px-[2px] [&>button]:border [&>button]:border-solid [&>button]:border-[#e2e8d9] [&>button]:rounded-[5px] [&>button]:text-[#748464] [&>button]:text-[12px] [&>button:hover:not(:disabled)]:text-[#345c29]! [&>button:hover:not(:disabled)]:bg-[#edf3e5] [&>button:hover:not(:disabled)]:border-[#a8bd94] [&>button.active]:text-[#345c29]! [&>button.active]:bg-[#edf3e5] [&>button.active]:border-[#a8bd94]",
};

export type SegmentOption<Value extends string> = {
  value: Value;
  label: string;
  content?: ReactNode;
  title?: string;
  disabled?: boolean;
};
type Props<Value extends string> = Omit<
  ComponentPropsWithRef<"div">,
  "onChange" | "defaultValue" | "children"
> & {
  label: string;
  value: Value | null;
  options: readonly SegmentOption<Value>[];
  onValueChange: (value: Value) => void;
  disabled?: boolean;
  variant?: keyof typeof controlStyles;
};

export function SegmentedControl<Value extends string>({
  label,
  value,
  options,
  onValueChange,
  disabled = false,
  variant = "standard",
  className = "",
  onKeyDown,
  ...props
}: Props<Value>) {
  return (
    <div
      {...props}
      role="group"
      aria-label={label}
      className={`${controlStyles[variant]} ${className}`}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          event.defaultPrevented ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.nativeEvent.isComposing ||
          ![
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "Home",
            "End",
          ].includes(event.key)
        )
          return;
        const buttons = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
        ];
        const focused = (event.target as HTMLElement).closest("button");
        const enabled = buttons.filter((button) => !button.disabled);
        if (!focused || !buttons.includes(focused) || !enabled.length) return;
        event.preventDefault();
        event.stopPropagation();
        const index = enabled.indexOf(focused);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? enabled.length - 1
              : (index +
                  (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) +
                  enabled.length) %
                enabled.length;
        const target = enabled[next];
        target.focus();
        const option = options[buttons.indexOf(target)];
        onValueChange(option.value);
      }}
    >
      {options.map((option) => (
        <Button
          variant="bare"
          key={option.value}
          aria-label={option.label}
          aria-pressed={value === option.value}
          title={option.title}
          disabled={disabled || option.disabled}
          className={value === option.value ? "active" : ""}
          onClick={() => onValueChange(option.value)}
        >
          {option.content ?? option.label}
        </Button>
      ))}
    </div>
  );
}
