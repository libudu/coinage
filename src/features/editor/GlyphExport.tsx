import { Button } from "../../shared/components/Button";
import { Menu } from "../../shared/components/Menu";
import { Icon } from "../../shared/components/Icon";

export type GlyphExportProps = {
  onExportSvg: () => void;
  onExportPng: () => void;
};
export function GlyphExport({ onExportSvg, onExportPng }: GlyphExportProps) {
  return (
    <Menu
      label="导出格式"
      containerClassName="split-button dropdown-wrap flex relative [&>.button]:rounded-[6px_0_0_6px] [&>.button]:border-r [&>.button]:border-r-[#52705b]"
      variant="spacious"
      className="dropdown export-dropdown absolute bottom-[calc(100%_+_9px)] right-0"
      leading={(close) => (
        <Button
          variant="primary"
          className="flex-1 min-w-0"
          onClick={() => {
            close();
            onExportSvg();
          }}
        >
          <Icon name="download" />
          导出 SVG
        </Button>
      )}
      trigger={(props) => (
        <Button
          {...props}
          variant="bare"
          className="split-arrow h-[37px] w-[29px] shrink-0 grid place-items-center bg-[#2d4e3b] text-[#e5eedc] rounded-[0_6px_6px_0] enabled:hover:bg-[#3d6248] enabled:hover:text-white!"
          aria-label="更多导出格式"
        >
          <Icon name="chevron" size={16} />
        </Button>
      )}
      items={[
        { label: "SVG 矢量图", icon: "node", action: onExportSvg },
        { label: "PNG 透明图片", icon: "image", action: onExportPng },
      ]}
    />
  );
}
