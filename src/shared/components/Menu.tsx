import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { isSaveShortcut } from "../utils/keyboard";

const menuStyles = {
  regular: `w-max whitespace-nowrap p-[5px] bg-[#fcfdf9] border [border-style:solid] border-[#dfe3d7] rounded-[7px]
            shadow-[0_8px_28px_#203d2226,_0_2px_6px_#203d2212] text-[12px] font-normal
            [&>button]:flex [&>button]:items-center [&>button]:gap-[9px] [&>button]:w-full [&>button]:h-[34px]
            [&>button]:px-[9px] [&>button]:rounded-[4px] [&>button]:text-left [&>button]:text-[#53674b]
            [&>button:hover:not(:disabled)]:bg-[#edf3e4] [&>button:focus-visible]:bg-[#edf3e4] [&>button:focus-visible]:outline-offset-[-2px]`,
  spacious: `bg-[#fcfdf9] border [border-style:solid]
            border-[#dfe3d7] shadow-[0_10px_35px_#22321a14] rounded-[9px] w-[204px] p-[6px] z-[50] [&_button]:flex
            [&_button]:items-center [&_button]:gap-[10px] [&_button]:w-full [&_button]:text-[12px]
            [&_button]:py-[11px] [&_button]:px-[10px] [&_button]:text-left [&_button]:rounded-[5px] [&_button:hover:not(:disabled)]:bg-[#edf2e6] [&_button:focus-visible]:bg-[#edf2e6]`,
  compact: `w-max max-w-[calc(100vw_-_16px)] max-h-[calc(100dvh_-_16px)]
        overflow-auto p-[5px] bg-[var(--panel)] border [border-style:solid] border-[#dce3d3] rounded-[7px]
        shadow-[0_8px_28px_#203d2226,_0_2px_6px_#203d2212] outline-none overscroll-contain [&>button]:flex
        [&>button]:items-center [&>button]:gap-[9px] [&>button]:w-full [&>button]:h-[32px] [&>button]:py-0
        [&>button]:px-[9px] [&>button]:rounded-[4px] [&>button]:text-left [&>button]:text-[12px] [&>button]:whitespace-nowrap
        [&>button]:text-[#53674b] [&>button:hover:not(:disabled)]:bg-[#edf3e4] [&>button:hover:not(:disabled)]:outline-offset-[-2px] [&>button:focus-visible]:bg-[#edf3e4] [&>button:focus-visible]:outline-offset-[-2px] [&>button.danger]:text-[#a44c3a]!`,
};

export type MenuItem = {
  label: string;
  icon?: IconName;
  action: () => void;
  disabled?: boolean;
  danger?: boolean;
};
type Props = {
  label: string;
  variant?: keyof typeof menuStyles;
  items: MenuItem[];
  className?: string;
  containerClassName?: string;
  panelClassName?: string;
  trigger?: (props: ComponentPropsWithRef<"button">) => ReactNode;
  leading?: (close: () => void) => ReactNode;
  hover?: boolean;
  position?: { x: number; y: number };
  onClose?: () => void;
};

export function Menu({
  label,
  variant = "regular",
  items,
  className = "",
  containerClassName = "",
  panelClassName,
  trigger,
  leading,
  hover = false,
  position,
  onClose,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const open = !!position || expanded;
  const root = useRef<HTMLDivElement>(null),
    menu = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null);
  const previous = useRef<Element | null>(null);
  const closing = useRef(false);
  const focusRequest = useRef<string | null>(null);
  const id = useId();
  const [offset, setOffset] = useState(position);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = (restore = false) => {
    if (!open || closing.current) return;
    // 恢复焦点会同步触发 blur / focusin，同一次关闭只通知业务方一次。
    closing.current = true;
    if (restore) {
      const target = button.current ?? previous.current;
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    }
    setExpanded(false);
    closeRef.current?.();
  };
  const focusItem = (key: string) => {
    const buttons = [
      ...(menu.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? []),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      key === "Home"
        ? 0
        : key === "End"
          ? buttons.length - 1
          : index < 0
            ? key === "ArrowUp"
              ? buttons.length - 1
              : 0
            : (index + (key === "ArrowUp" ? -1 : 1) + buttons.length) %
              buttons.length;
    buttons[next]?.focus();
  };
  useLayoutEffect(() => {
    if (!open) return;
    closing.current = false;
    if (!menu.current?.contains(document.activeElement))
      previous.current = document.activeElement;
    if (position) menu.current?.focus();
    if (focusRequest.current) {
      focusItem(focusRequest.current);
      focusRequest.current = null;
    }
  }, [open]);
  useLayoutEffect(() => {
    if (!position || !menu.current) return;
    const element = menu.current;
    const place = () => {
      const { width, height } = element.getBoundingClientRect();
      setOffset({
        x: Math.max(8, Math.min(position.x, window.innerWidth - width - 8)),
        y: Math.max(8, Math.min(position.y, window.innerHeight - height - 8)),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [position]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const blur = () => close();
    window.addEventListener("pointerdown", outside);
    window.addEventListener("focusin", outside);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("focusin", outside);
      window.removeEventListener("blur", blur);
    };
  }, [open]);
  return (
    <div
      ref={root}
      className={containerClassName}
      onPointerEnter={
        hover
          ? (event) => {
              if (event.pointerType !== "touch") setExpanded(true);
            }
          : undefined
      }
      onPointerLeave={
        hover
          ? () => {
              if (!root.current?.contains(document.activeElement)) close();
            }
          : undefined
      }
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          close();
      }}
      onKeyDown={(event) => {
        if (isSaveShortcut(event)) return;
        event.stopPropagation();
        if ((event.key === "Escape" || event.key === "Tab") && open) {
          if (event.key === "Escape") event.preventDefault();
          close(true);
        } else if (
          ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
        ) {
          event.preventDefault();
          if (open) focusItem(event.key);
          else {
            focusRequest.current = event.key;
            setExpanded(true);
          }
        }
      }}
      onKeyUp={(event) => {
        if (!isSaveShortcut(event)) event.stopPropagation();
      }}
    >
      {leading?.(() => close(true))}
      {trigger?.({
        ref: button,
        type: "button",
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": open ? id : undefined,
        onClick: () => setExpanded((value) => hover || !value),
      })}
      {open && (
        <div className={panelClassName}>
          <div
            ref={menu}
            id={id}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            className={`${menuStyles[variant]} [&>button.danger]:text-[#a44c3a]! ${className}`}
            style={position ? { left: offset?.x, top: offset?.y } : undefined}
            onContextMenu={(event) => event.preventDefault()}
          >
            {items.map((item) => (
              <Button
                variant="bare"
                key={item.label}
                role="menuitem"
                disabled={item.disabled}
                className={item.danger ? "danger" : undefined}
                onClick={() => {
                  close(true);
                  item.action();
                }}
              >
                {item.icon && <Icon name={item.icon} size={16} />}
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
