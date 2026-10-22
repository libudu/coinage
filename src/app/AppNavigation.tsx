import { Button } from "../shared/components/Button";
import { Icon } from "../shared/components/Icon";
import { version } from "../../package.json";
import {
  desktopDownloadUrl,
  isWebVersion,
  repositoryUrl,
} from "../shared/utils/runtime";

export type WorkspacePage = "library" | "editor" | "styles";

export function AppNavigation({
  page,
  onChange,
}: {
  page: WorkspacePage;
  onChange: (page: WorkspacePage) => void;
}) {
  return (
    <aside className="flex w-[88px] shrink-0 flex-col items-center gap-[32px] border-r border-solid border-[var(--border)] bg-[#fcfdf9] py-[24px] compact:w-[76px] compact:py-[18px]">
      <div className="flex flex-col items-center gap-[8px]">
        <div
          aria-label="Coinage"
          className="grid h-[39px] w-[37px] place-items-center rounded-[9px] bg-[#2d4d39] text-[#e0edc6]"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 30 30"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M5 23V11L15 4l10 7v12M5 16h20M15 4v22M8 25l7-9 7 9" />
          </svg>
        </div>
        <div className="flex flex-col items-center gap-[2px]">
          <span className="text-[13px] font-semibold text-[#2d4e3b]">
            Coinage
          </span>
          <span className="text-[11px] text-[#7e897c]">v{version}</span>
        </div>
      </div>
      <nav
        aria-label="主导航"
        className="flex w-full flex-col gap-[10px] px-[10px] compact:px-[6px]"
      >
        {(
          [
            { id: "library", label: "字库", icon: "grid" },
            { id: "editor", label: "造字", icon: "pen" },
            { id: "styles", label: "样式", icon: "settings" },
          ] as const
        ).map((item) => (
          <Button
            variant="bare"
            key={item.id}
            type="button"
            aria-current={page === item.id ? "page" : undefined}
            className={`flex h-[64px] w-full flex-col items-center justify-center gap-[7px] rounded-[9px] text-[12px] ${
              page === item.id
                ? "bg-[#eaf0e1] font-semibold text-[#2d4e3b]"
                : "text-[#7e897c] enabled:hover:bg-[#f0f3ea]"
            }`}
            onClick={() => onChange(item.id)}
          >
            <Icon name={item.icon} size={21} />
            {item.label}
          </Button>
        ))}
      </nav>
      <div className="mt-auto flex w-full flex-col items-center gap-[16px] px-[8px]">
        {isWebVersion && (
          <p className="text-center text-[11px] leading-[1.7] text-[#c43b35]">
            数据保存在浏览器，可能丢失，仅供体验。
            <a
              className="underline underline-offset-2"
              href={desktopDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              请下载桌面版
            </a>
          </p>
        )}
        <a
          href={repositoryUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub 项目主页"
          title="GitHub 项目主页"
          className="grid size-[36px] shrink-0 place-items-center rounded-[9px] text-[#7e897c] hover:bg-[#f0f3ea] hover:text-[#2d4e3b]"
        >
          <Icon name="github" size={22} />
        </a>
      </div>
    </aside>
  );
}
