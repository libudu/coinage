import { useLayoutEffect, useRef } from "react";
import type { ComponentPropsWithoutRef, RefObject } from "react";
import { isSaveShortcut } from "../utils/keyboard";

type Props = Omit<
  ComponentPropsWithoutRef<"dialog">,
  "open" | "onClose" | "onCancel"
> & {
  onClose: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
  gutter?: "sm" | "md";
};

export function Modal({
  onClose,
  initialFocus,
  gutter = "sm",
  className = "",
  children,
  ...props
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  // 在子节点的 autoFocus 执行前记住入口，避免把弹窗内的输入框当成返回目标。
  const returnFocus = useRef(document.activeElement);
  const backdropPress = useRef(false);
  useLayoutEffect(() => {
    const element = dialog.current!;
    const previous = returnFocus.current;
    element.showModal();
    const target =
      initialFocus?.current ??
      element.querySelector<HTMLElement>("[autofocus]:not(:disabled)") ??
      element.querySelector<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex='0']",
      );
    (target ?? element).focus();
    return () => {
      element.close();
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        !previous.closest("[hidden]")
      )
        previous.focus();
    };
  }, [initialFocus]);

  return (
    <dialog
      role="dialog"
      {...props}
      ref={dialog}
      tabIndex={-1}
      aria-modal="true"
      className={`m-auto ${gutter === "sm" ? "max-w-[calc(100vw_-_30px)] max-h-[calc(100dvh_-_30px)]" : "max-w-[calc(100vw_-_60px)] max-h-[calc(100dvh_-_60px)] compact:max-w-[calc(100vw_-_30px)]"} overflow-auto p-0 bg-[#fafbf6] text-[#313a33] border border-solid border-[#e4e8dc] rounded-[15px] shadow-[0_24px_90px_#172b2433] backdrop:bg-[#1f30244f] backdrop:backdrop-blur-[5px] ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        backdropPress.current =
          event.target === event.currentTarget &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom);
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          backdropPress.current &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom)
        )
          onClose();
        backdropPress.current = false;
      }}
      onKeyDown={(event) => {
        if (isSaveShortcut(event)) return;
        event.stopPropagation();
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
        if (event.key !== "Tab") return;
        const items = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex='0']",
          ),
        ].filter((item) => !item.closest("[hidden], [inert]"));
        const first = items[0],
          last = items.at(-1);
        if (!first) {
          event.preventDefault();
          event.currentTarget.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === event.currentTarget)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === event.currentTarget)
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
      onKeyUp={(event) => {
        if (!isSaveShortcut(event)) event.stopPropagation();
      }}
    >
      {children}
    </dialog>
  );
}
