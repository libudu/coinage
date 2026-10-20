import "./App.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Glyph, Point, Project } from "../core/model";
import { Icon } from "../shared/components/Icon";
import { IconButton } from "../shared/components/controls";
import { ImportDialog } from "../features/tracing/ImportDialog";
import { EditorCanvas } from "../features/editor/EditorCanvas";
import { EditorContextMenu } from "../features/editor/EditorContextMenu";
import { Properties } from "../features/editor/Properties";
import {
  ProjectProvider,
  useProject,
  useProjectActions,
  useProjectApi,
} from "../features/project/useProject";
import { activeGlyph } from "../features/project/projectStore";
import { useProjectFiles } from "../features/project/useProjectFiles";
import { useEditorCommands } from "../features/editor/useEditorCommands";
import { GlyphSidebar } from "../features/editor/GlyphSidebar";
import { GlyphBasicInfoDialog } from "../features/editor/GlyphBasicInfoDialog";
import { GlyphDeleteDialog } from "../features/editor/GlyphDeleteDialog";
import { GlyphLibrary } from "../features/library/GlyphLibrary";
import { AppNavigation } from "./AppNavigation";
import type { WorkspacePage } from "./AppNavigation";

export default function App({ initialProject }: { initialProject: Project }) {
  return (
    <ProjectProvider initialProject={initialProject}>
      <Workspace />
    </ProjectProvider>
  );
}

function ProjectImportDialog(
  props: Omit<Parameters<typeof ImportDialog>[0], "brush">,
) {
  const brush = useProject((s) => s.project.brush);
  return <ImportDialog {...props} brush={brush} />;
}

function ProjectSaveError({ exportProject }: { exportProject: () => void }) {
  const error = useProject((s) => s.saveError);
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e6cbb8] bg-[#fff3e9] px-4 py-2 text-xs text-[#a04c32]"
    >
      <span>{error}</span>
      <button
        className="shrink-0 underline underline-offset-2"
        onClick={exportProject}
      >
        导出应急副本
      </button>
    </div>
  );
}

function Workspace() {
  const [page, setPage] = useState<WorkspacePage>("library");
  const [contextMenu, setContextMenu] = useState<Point | null>(null);
  const [editingGlyphInfo, setEditingGlyphInfo] = useState<Pick<
    Glyph,
    "id" | "name" | "description"
  > | null>(null);
  const [deletingGlyph, setDeletingGlyph] = useState<Pick<
    Glyph,
    "id" | "name"
  > | null>(null);
  const api = useProjectApi();
  const {
    editGlyphInfo,
    removeGlyph,
    select,
    selectNodes,
    switchGlyph,
    addGlyph,
    commitTransaction,
  } = useProjectActions();
  const [toast, setToast] = useState(""),
    [shortcuts, setShortcuts] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const openContextMenu = (
    position: Point,
    n: string | null,
    s: string | null,
  ) => {
    const nodeIds = api.getState().session.nodeIds;
    if (n && nodeIds.includes(n))
      selectNodes([...nodeIds.filter((id) => id !== n), n], s);
    else select(n, s);
    setContextMenu(position);
  };
  const openGlyphContextMenu = (id: string, position: Point) => {
    switchGlyph(id);
    openContextMenu(position, null, null);
  };
  const { source, setSource, importFile, exportProject, saveSvg, savePng } =
    useProjectFiles({
      toast: setToast,
    });
  const { remove, duplicate } = useEditorCommands({
    toast: setToast,
    importing:
      page !== "editor" ||
      !!source ||
      !!editingGlyphInfo ||
      !!deletingGlyph ||
      !!contextMenu,
    shortcuts,
    setShortcuts,
    confirmRemoveGlyph: (id) => {
      commitTransaction();
      const glyphs = api.getState().project.glyphs;
      const index = glyphs.findIndex((g) => g.id === id);
      if (index >= 0)
        setDeletingGlyph({
          id,
          name:
            glyphs[index].name || `字符 ${String(index + 1).padStart(2, "0")}`,
        });
    },
  });
  const changePage = (next: WorkspacePage) => {
    if (next === page) return;
    commitTransaction();
    setContextMenu(null);
    setShortcuts(false);
    setPage(next);
  };
  const upload = () => fileInput.current?.click();
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <div className="studio h-[100dvh] min-h-[580px] flex overflow-hidden">
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
      <AppNavigation page={page} onChange={changePage} />
      <div className="flex min-w-0 flex-1 flex-col">
        <ProjectSaveError exportProject={exportProject} />
        <div hidden={page !== "library"} className="min-h-0 flex-1">
          <GlyphLibrary
            onEdit={(id) => {
              switchGlyph(id);
              changePage("editor");
            }}
            openGlyphContextMenu={openGlyphContextMenu}
          />
        </div>
        <div
          hidden={page !== "editor"}
          className="workspace flex-1 min-h-0 grid [&[hidden]]:hidden grid-cols-[224px_minmax(280px,_1fr)_258px]
          wide:grid-cols-[250px_minmax(280px,_1fr)_280px] laptop:grid-cols-[185px_minmax(280px,_1fr)_232px]
          tablet:grid-cols-[154px_minmax(280px,_1fr)_214px] compact:grid-cols-[88px_minmax(0,_1fr)] compact:relative
          phone:grid-cols-[76px_minmax(0,_1fr)]"
        >
          <GlyphSidebar
            openGlyphContextMenu={openGlyphContextMenu}
            importGlyph={upload}
          />
          <EditorCanvas
            openContextMenu={openContextMenu}
            showShortcuts={() => setShortcuts(true)}
            importFile={importFile}
            toast={setToast}
            modalOpen={
              page !== "editor" ||
              !!source ||
              shortcuts ||
              !!contextMenu ||
              !!editingGlyphInfo ||
              !!deletingGlyph
            }
          />
          <Properties onExportSvg={saveSvg} onExportPng={savePng} />
        </div>
      </div>
      {contextMenu && (
        <EditorContextMenu
          position={contextMenu}
          onClose={closeContextMenu}
          remove={remove}
          duplicate={duplicate}
          editGlyphInfo={() => {
            const glyph = activeGlyph(api.getState());
            setEditingGlyphInfo({
              id: glyph.id,
              name: glyph.name,
              description: glyph.description,
            });
          }}
          toast={setToast}
        />
      )}
      {editingGlyphInfo && (
        <GlyphBasicInfoDialog
          name={editingGlyphInfo.name}
          description={editingGlyphInfo.description ?? ""}
          onClose={() => setEditingGlyphInfo(null)}
          onConfirm={({ name, description }) => {
            if (
              name !== editingGlyphInfo.name ||
              description !== (editingGlyphInfo.description ?? "")
            ) {
              editGlyphInfo(editingGlyphInfo.id, { name, description });
            }
            setEditingGlyphInfo(null);
          }}
        />
      )}
      {deletingGlyph && (
        <GlyphDeleteDialog
          name={deletingGlyph.name}
          onClose={() => setDeletingGlyph(null)}
          onConfirm={() => {
            removeGlyph(deletingGlyph.id);
            setDeletingGlyph(null);
            setToast("已删除字符");
          }}
        />
      )}
      {source && (
        <ProjectImportDialog
          source={source}
          onClose={() => setSource(null)}
          onImport={(g) => {
            addGlyph(g);
            setSource(null);
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
            <div
              className="modal-heading flex items-center justify-between mb-[23px] [&_h2]:text-[20px] [&_h2]:tracking-[1px]
              [&_h2]:font-semibold [&_h2]:mt-[5px] [&_h2]:mx-0 [&_h2]:mb-0"
            >
              <h2>快捷键</h2>
              <IconButton
                icon="close"
                title="关闭"
                onClick={() => setShortcuts(false)}
              />
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
                  <kbd className="[font:12px_ui-monospace,monospace]">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      {toast && (
        <div
          className="toast fixed bottom-[28px] left-[50%] z-[150] flex items-center gap-[10px] py-[13px] px-[20px] bg-[#2f4d3c]
          text-[#f1f7e9] border [border-style:solid] border-[#49654f] rounded-[9px] shadow-[0_4px_20px_#16301e25]
          text-[12px] max-w-[90vw] [&>svg]:text-[#c2dba2] [transform:translateX(-50%)] animate-[toast-in_0.2s_ease-out]"
          role="status"
        >
          <Icon name="check" size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
