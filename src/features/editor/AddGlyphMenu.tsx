import { Button } from "../../shared/components/Button";
import { Menu } from "../../shared/components/Menu";
import { Icon } from "../../shared/components/Icon";

type Props = { addGlyph: () => void; importGlyph: () => void };
export function AddGlyphMenu({ addGlyph, importGlyph }: Props) {
  return (
    <Menu
      label="新建字符"
      hover
      containerClassName="relative shrink-0"
      panelClassName="absolute top-full left-0 pt-[6px] z-[30]"
      variant="regular"
      trigger={(props) => (
        <Button
          {...props}
          variant="bare"
          aria-label="新建字符"
          title="新建字符"
          className="flex items-center justify-center w-[28px] h-[28px] rounded-[6px] border border-solid border-[#48603b] bg-[#587447] text-white shadow-[0_1px_3px_#344d3026] hover:bg-[#48623a] hover:border-[#3b5230] aria-expanded:bg-[#48623a] compact:w-[22px] compact:h-[22px]"
        >
          <Icon name="plus" size={16} />
        </Button>
      )}
      items={[
        { label: "新建空白字符", icon: "plus", action: addGlyph },
        { label: "从图片导入字符", icon: "image", action: importGlyph },
      ]}
    />
  );
}
