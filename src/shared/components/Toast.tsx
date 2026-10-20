import "./Toast.css";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

type ToastOptions = { tone?: "success" | "error" | "info"; duration?: number };
export type Notify = (message: string, options?: ToastOptions) => void;
type Message = ToastOptions & { id: number; message: string };
const ToastContext = createContext<Notify | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const sequence = useRef(0);
  const [message, setMessage] = useState<Message | null>(null);
  const notify = useCallback<Notify>((text, options) => {
    setMessage({ ...options, id: ++sequence.current, message: text });
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(
      () =>
        setMessage((current) => (current?.id === message.id ? null : current)),
      message.duration ?? 3200,
    );
    return () => clearTimeout(timer);
  }, [message]);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      {message && <Toast key={message.id} {...message} />}
    </ToastContext.Provider>
  );
}

function Toast({ message, tone = "info" }: Message) {
  const element = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const toast = element.current!;
    // 使用顶层展示，异步操作的反馈不会被原生弹窗遮挡，也不会抢走焦点。
    toast.showPopover?.();
    return () => toast.hidePopover?.();
  }, []);
  return (
    <div
      ref={element}
      popover="manual"
      className={`toast fixed m-0 top-auto right-auto bottom-[28px] left-[50%] z-[150] flex items-center gap-[10px] py-[13px] px-[20px] border border-solid rounded-[9px] shadow-[0_4px_20px_#16301e25] text-[12px] max-w-[90vw] [transform:translateX(-50%)] animate-[coinage-toast-in_0.2s_ease-out] ${tone === "error" ? "bg-[#a44c3a] border-[#913e2e] text-white" : "bg-[#2f4d3c] text-[#f1f7e9] border-[#49654f] [&>svg]:text-[#c2dba2]"}`}
      role={tone === "error" ? "alert" : "status"}
      aria-atomic="true"
    >
      {tone !== "info" && (
        <Icon name={tone === "success" ? "check" : "close"} size={17} />
      )}
      {message}
    </div>
  );
}

export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("提示必须位于 ToastProvider 内");
  return notify;
}
