import { Modal } from "../../shared/components/Modal";
import { IconButton } from "../../shared/components/controls";

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      gutter="md"
      onClose={onClose}
      aria-label="快捷键"
      className="shortcut-modal w-[480px]"
    >
      <div className="p-[27px]">
        <div
          className="modal-heading flex items-center justify-between mb-[23px] [&_h2]:text-[20px] [&_h2]:tracking-[1px]
              [&_h2]:font-semibold [&_h2]:mt-[5px] [&_h2]:mx-0 [&_h2]:mb-0"
        >
          <h2>快捷键</h2>
          <IconButton icon="close" title="关闭" onClick={onClose} />
        </div>
        <div
          className="shortcut-list flex flex-col gap-0 [&>div]:flex [&>div]:items-center [&>div]:justify-between
              [&>div]:text-[12px] [&>div]:gap-[20px] [&>div]:min-h-[36px] [&>div]:border-b
              [&>div]:[border-bottom-style:solid] [&>div]:border-b-[#e8ecdf] [&>div:last-child]:[border:0]
              [&_kbd]:text-[#81936e] phone:[&>div]:gap-[10px]"
        >
          {[
            ["选择 / 钢笔 / 分支 / 平移", "V / P / B / H"],
            ["从节点拉出新笔画", "Alt + 拖动"],
            ["约束 45° 方向", "Shift + 拖动"],
            ["添加路径节点", "双击笔画"],
            ["字符列表 / 节点 / 笔画操作", "右键"],
            ["移动节点", "方向键"],
            ["全选节点", "Ctrl + A"],
            ["多选 / 取消选中节点", "Shift / Ctrl + 点击"],
            ["大步移动节点", "Shift + 方向键"],
            ["调整所选节点粗细", "滚轮"],
            ["缩放画布", "Ctrl / ⌘ + 滚轮"],
            ["临时平移画布", "空格 + 拖动"],
            ["预览 / 编辑", "Tab"],
            ["网格", "G"],
            ["适应画布", "0"],
            ["撤销 / 重做", "Ctrl Z / Ctrl Shift Z"],
            ["立即保存到本机", "Ctrl S"],
            ["删除节点 / 笔画", "Delete"],
            ["结束绘制", "Esc"],
          ].map(([label, key]) => (
            <div key={label}>
              <span>{label}</span>
              <kbd className="[font:12px_ui-monospace,monospace]">{key}</kbd>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
