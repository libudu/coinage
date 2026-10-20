import "./App.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyGlyph } from "../core/model";
import type { Point } from "../core/model";
import { Icon } from "../shared/components/Icon";
import { IconButton, buttonStateClasses } from "../shared/components/controls";
import { ImportDialog } from "../features/tracing/ImportDialog";
import { EditorCanvas } from "../features/editor/EditorCanvas";
import type { Tool } from "../features/editor/canvasTypes";
import { EditorContextMenu } from "../features/editor/EditorContextMenu";
import { Properties } from "../features/editor/Properties";
import { useProject } from "../features/project/useProject";
import { useProjectFiles } from "../features/project/useProjectFiles";
import { useEditorCommands } from "../features/editor/useEditorCommands";
import { GlyphSidebar } from "../features/editor/GlyphSidebar";
import { RenameGlyphDialog } from "../features/editor/RenameGlyphDialog";

export default function App() {
  const [contextMenu, setContextMenu] = useState<Point | null>(null);
  const [renamingGlyph, setRenamingGlyph] = useState<{ id: string; name: string } | null>(null);
  const doc = useProject(),
    { project, update } = doc,
    glyph =
      project.glyphs.find((g) => g.id === project.activeId) ||
      project.glyphs[0];
  const [selectedNodeIds, setNodeIds] = useState<string[]>(
      glyph.strokes[0]?.nodes[1] ? [glyph.strokes[0].nodes[1]] : [],
    ),
    [strokeId, setStrokeId] = useState<string | null>(
      glyph.strokes[0]?.id || null,
    ),
    [tool, setTool] = useState<Tool>("select");
  const nodeIds = selectedNodeIds.filter((id) => !!glyph.nodes[id]);
  const nodeId = nodeIds.at(-1) ?? null;
  const [toast, setToast] = useState(""),
    [menu, setMenu] = useState<"export" | "project" | null>(null),
    [shortcuts, setShortcuts] = useState(false),
    [showReference, setShowReference] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null);
  const select = useCallback((n: string | null, s?: string | null) => {
    setContextMenu(null);
    setNodeIds(n ? [n] : []);
    if (s !== undefined) setStrokeId(s);
  }, []);
  const selectNodes = useCallback((nodes: string[], s?: string | null) => {
    setContextMenu(null);
    setNodeIds([...new Set(nodes)]);
    if (s !== undefined) setStrokeId(s);
  }, []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const openContextMenu = (position: Point, n: string | null, s: string | null) => {
    if (n && nodeIds.includes(n)) selectNodes([...nodeIds.filter((id) => id !== n), n], s);
    else select(n, s);
    setMenu(null);
    setContextMenu(position);
  };
  const {
    source, setSource, importFile, importProject, exportProject, saveSvg, savePng,
  } = useProjectFiles({
    doc,
    glyph,
    clearSelection: () => select(null, null),
    closeMenu: () => setMenu(null),
    toast: setToast,
  });
  const { remove, duplicate, undo, redo } = useEditorCommands({
    doc,
    glyph,
    nodeIds,
    strokeId,
    select,
    selectNodes,
    toast: setToast,
    importing: !!source,
    shortcuts,
    setShortcuts,
    closeMenu: () => setMenu(null),
    exportProject,
  });
  const upload = () => fileInput.current?.click();
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);
  const switchGlyph = (id: string) => {
    update((_, p) => {
      p.activeId = id;
    }, false);
    select(null, null);
    setShowReference(false);
  };
  const addGlyph = () => {
    const g = emptyGlyph(
      `字形 ${String(project.glyphs.length + 1).padStart(2, "0")}`,
    );
    update((_, p) => {
      p.glyphs.push(g);
      p.activeId = g.id;
    });
    select(null, null);
    setTool("pen");
    setShowReference(false);
  };
  return (
    <div className="studio h-[100dvh] min-h-[580px] flex flex-col overflow-hidden">
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) importFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={projectInput}
        type="file"
        accept=".json"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) void importProject(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <header className="app-header h-[78px] shrink-0 bg-[#fcfdf9] border-b [border-bottom-style:solid] border-b-[var(--border)]
        flex items-center py-0 px-[26px] gap-[23px] z-[20] wide:py-0 wide:px-[30px] laptop:py-0 laptop:px-[18px]
        laptop:gap-[16px] tablet:h-[68px] tablet:py-0 tablet:px-[14px] tablet:gap-[14px] compact:h-[64px]
        compact:py-0 compact:px-[12px] compact:gap-[10px] phone:py-0 phone:px-[9px] phone:gap-[7px]">
        <div className="brand flex items-center gap-[11px] shrink-0 [&>span:last-child]:text-[20px] [&>span:last-child]:font-[650]
          [&>span:last-child]:leading-[1.1] [&>span:last-child]:tracking-[3px]
          tablet:[&>span:last-child]:text-[18px] phone:gap-[7px] phone:[&>span:last-child]:text-[16px]">
          <span className="brand-mark grid place-items-center w-[37px] h-[39px] bg-[#2d4d39] rounded-[9px] text-[#e0edc6]
            [&_svg]:w-[26px] [&_svg]:h-[26px] tablet:h-[34px] tablet:w-[32px] phone:w-[29px] [&_svg]:stroke-current [&_svg]:fill-none [&_svg]:[stroke-width:1.8] [&_svg]:[stroke-linejoin:miter]">
            <svg viewBox="0 0 30 30">
              <path d="M5 23V11L15 4l10 7v12M5 16h20M15 4v22M8 25l7-9 7 9" />
            </svg>
          </span>
          <span>
            造字<span className="brand-latin block text-[12px] tracking-[2.15px] mt-[6px] font-semibold text-[#7e897c]">COINAGE</span>
          </span>
        </div>
        <div className="document-title flex items-center gap-[12px] [&>input]:w-[145px] [&>input]:[border:0]
          [&>input]:bg-[transparent] [&>input]:text-[13px] [&>input]:text-[#586052] [&>input]:py-[7px]
          [&>input]:px-0 [&_.icon-button]:w-[25px] [&_.icon-button]:h-[28px] laptop:[&>input]:w-[130px]
          laptop:gap-[7px] tablet:[&>input]:w-[107px] tablet:[&>input]:text-[12px] tablet:[&_.header-divider]:m-0
          compact:gap-[3px] compact:[&>input]:w-[102px] phone:[&>input]:hidden
          phone:[&>.header-divider]:hidden phone:ml-[-6px]">
          <span className="header-divider w-[1px] h-[27px] bg-[var(--border)] mr-[6px]" />
          <input
            aria-label="手稿名称"
            value={project.name}
            onChange={(e) =>
              update((_, p) => {
                p.name = e.target.value;
              }, false)
            }
            onBlur={() => {
              if (!project.name.trim())
                update((_, p) => {
                  p.name = "未命名手稿";
                });
            }}
          />
          <div
            className="dropdown-wrap relative"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <IconButton
              icon="chevron"
              title="手稿菜单"
              onClick={() => setMenu(menu === "project" ? null : "project")}
            />
            {menu === "project" && (
              <div className="dropdown project-dropdown absolute top-[calc(100%_+_9px)] right-0 bg-[#fcfdf9] border [border-style:solid]
                border-[#dfe3d7] shadow-[0_10px_35px_#22321a14] rounded-[9px] w-[204px] p-[6px] z-[50] [&_button]:flex
                [&_button]:items-center [&_button]:gap-[10px] [&_button]:w-full [&_button]:text-[12px]
                [&_button]:py-[11px] [&_button]:px-[10px] [&_button]:text-left [&_button]:rounded-[5px] left-[-20px]
                right-auto [&_button:hover]:bg-[#edf2e6]">
                <button
                  onClick={() => {
                    projectInput.current?.click();
                    setMenu(null);
                  }}
                >
                  <Icon name="folder" />
                  打开手稿
                </button>
                <button onClick={exportProject}>
                  <Icon name="save" />
                  保存手稿文件
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="workspace flex-1 min-h-0 grid grid-cols-[224px_minmax(280px,_1fr)_258px]
        wide:grid-cols-[250px_minmax(280px,_1fr)_280px] laptop:grid-cols-[185px_minmax(280px,_1fr)_232px]
        tablet:grid-cols-[154px_minmax(280px,_1fr)_214px] compact:grid-cols-[88px_minmax(0,_1fr)] compact:relative
        phone:grid-cols-[76px_minmax(0,_1fr)]">
        <GlyphSidebar
          doc={doc}
          glyph={glyph}
          strokeId={strokeId}
          nodeIds={nodeIds}
          select={select}
          switchGlyph={switchGlyph}
          openGlyphContextMenu={(id, position) => {
            switchGlyph(id);
            openContextMenu(position, null, null);
          }}
          addGlyph={addGlyph}
          importGlyph={upload}
        />
        <EditorCanvas
          openContextMenu={openContextMenu}
          undo={undo}
          redo={redo}
          showShortcuts={() => setShortcuts(true)}
          doc={doc}
          glyph={glyph}
          nodeId={nodeId}
          nodeIds={nodeIds}
          strokeId={strokeId}
          select={select}
          selectNodes={selectNodes}
          tool={tool}
          setTool={setTool}
          importFile={importFile}
          toast={setToast}
          showReference={showReference}
          modalOpen={!!source || shortcuts || !!contextMenu || !!renamingGlyph}
        />
        <Properties
          doc={doc}
          glyph={glyph}
          nodeId={nodeId}
          nodeIds={nodeIds}
          strokeId={strokeId}
          showReference={showReference}
          setShowReference={setShowReference}
          exportActions={
            <div
              className="split-button dropdown-wrap flex relative [&>.button]:rounded-[6px_0_0_6px] [&>.button]:border-r
                [&>.button]:[border-right-style:solid] [&>.button]:border-r-[#52705b]"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button className={`button primary flex-1 min-w-0 px-[14px] h-[37px] inline-flex items-center justify-center gap-[8px] border
                [border-style:solid] border-[#dfe4d7] rounded-[6px] text-[12px] font-[550] whitespace-nowrap ${buttonStateClasses}`} onClick={saveSvg}>
                <Icon name="download" />
                导出 SVG
              </button>
              <button
                className="split-arrow h-[37px] w-[29px] shrink-0 grid place-items-center bg-[#2d4e3b] text-[#e5eedc]
                  rounded-[0_6px_6px_0] enabled:hover:bg-[#3d6248] enabled:hover:text-white!"
                aria-label="更多导出格式"
                aria-expanded={menu === "export"}
                onClick={() => setMenu(menu === "export" ? null : "export")}
              >
                <Icon name="chevron" size={16} />
              </button>
              {menu === "export" && (
                <div className="dropdown export-dropdown absolute bottom-[calc(100%_+_9px)] right-0 bg-[#fcfdf9] border [border-style:solid]
                  border-[#dfe3d7] shadow-[0_10px_35px_#22321a14] rounded-[9px] w-[204px] p-[6px] z-[50] [&_button]:flex
                  [&_button]:items-center [&_button]:gap-[10px] [&_button]:w-full [&_button]:text-[12px]
                  [&_button]:py-[11px] [&_button]:px-[10px] [&_button]:text-left [&_button]:rounded-[5px] [&_button:hover]:bg-[#edf2e6]">
                  <button onClick={saveSvg}>
                    <Icon name="node" />
                    SVG 矢量图
                  </button>
                  <button onClick={savePng}>
                    <Icon name="image" />
                    PNG 透明图片
                  </button>
                  <button onClick={exportProject}>
                    <Icon name="file" />
                    JSON 可编辑手稿
                  </button>
                </div>
              )}
            </div>
          }
        />
        {contextMenu && (
          <EditorContextMenu
            key={`${glyph.id}:${nodeId}:${strokeId}`}
            position={contextMenu}
            onClose={closeContextMenu}
            doc={doc}
            glyph={glyph}
            nodeId={nodeId}
            nodeIds={nodeIds}
            strokeId={strokeId}
            select={select}
            remove={remove}
            duplicate={duplicate}
            renameGlyph={() => setRenamingGlyph({ id: glyph.id, name: glyph.name })}
            toast={setToast}
          />
        )}
      </div>
      {renamingGlyph && (
        <RenameGlyphDialog
          name={renamingGlyph.name}
          onClose={() => setRenamingGlyph(null)}
          onConfirm={(name) => {
            if (name !== renamingGlyph.name) {
              update((_, p) => {
                const target = p.glyphs.find((g) => g.id === renamingGlyph.id);
                if (target) target.name = name;
              });
            }
            setRenamingGlyph(null);
          }}
        />
      )}
      {source && (
        <ImportDialog
          brush={project.brush}
          source={source}
          onClose={() => setSource(null)}
          onImport={(g) => {
            update((_, p) => {
              p.glyphs.push(g);
              p.activeId = g.id;
            });
            setSource(null);
            select(null, g.strokes[0]?.id || null);
            setTool("select");
            setShowReference(false);
            setToast(`已提取 ${g.strokes.length} 条笔画`);
          }}
        />
      )}
      {shortcuts && (
        <div
          className="modal-backdrop fixed inset-0 z-[100] bg-[#1f30244f] backdrop-blur-[5px] flex items-center justify-center p-[30px] compact:p-[15px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShortcuts(false);
          }}
        >
          <section
            className="shortcut-modal bg-[#fafbf6] border [border-style:solid] border-[#e4e8dc] rounded-[15px]
              shadow-[0_24px_90px_#172b2433] w-[480px] max-h-[calc(100dvh_-_60px)] overflow-auto p-[27px]"
            role="dialog"
            aria-modal="true"
            aria-label="快捷键"
          >
            <div className="modal-heading flex items-center justify-between mb-[23px] [&_h2]:text-[20px] [&_h2]:tracking-[1px]
              [&_h2]:font-semibold [&_h2]:mt-[5px] [&_h2]:mx-0 [&_h2]:mb-0">
              <h2>快捷键</h2>
              <IconButton
                icon="close"
                title="关闭"
                onClick={() => setShortcuts(false)}
              />
            </div>
            <div className="shortcut-list flex flex-col gap-0 [&>div]:flex [&>div]:items-center [&>div]:justify-between
              [&>div]:text-[12px] [&>div]:gap-[20px] [&>div]:min-h-[36px] [&>div]:border-b
              [&>div]:[border-bottom-style:solid] [&>div]:border-b-[#e8ecdf] [&>div:last-child]:[border:0]
              [&_kbd]:text-[#81936e] phone:[&>div]:gap-[10px]">
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
                ["临时平移画布", "空格 + 拖动"],
                ["预览 / 编辑", "Tab"],
                ["网格", "G"],
                ["适应画布", "0"],
                ["撤销 / 重做", "Ctrl Z / Ctrl Shift Z"],
                ["保存手稿文件", "Ctrl S"],
                ["删除节点 / 笔画", "Delete"],
                ["结束绘制", "Esc"],
              ].map(([label, key]) => (
                <div key={label}>
                  <span>{label}</span>
                  <kbd className="[font:12px_ui-monospace,monospace]">{key}</kbd>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast fixed bottom-[28px] left-[50%] z-[150] flex items-center gap-[10px] py-[13px] px-[20px] bg-[#2f4d3c]
          text-[#f1f7e9] border [border-style:solid] border-[#49654f] rounded-[9px] shadow-[0_4px_20px_#16301e25]
          text-[12px] max-w-[90vw] [&>svg]:text-[#c2dba2] [transform:translateX(-50%)] animate-[toast-in_0.2s_ease-out]" role="status">
          <Icon name="check" size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
