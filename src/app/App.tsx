import { useCallback, useEffect, useRef, useState } from "react";
import type { Glyph, Point, Project } from "../core/model";
import { ToastProvider, useToast } from "../shared/components/Toast";
import { ShortcutsDialog } from "../features/editor/ShortcutsDialog";
import { Button } from "../shared/components/Button";
import { ImportDialog } from "../features/tracing/ImportDialog";
import { EditorCanvas } from "../features/editor/EditorCanvas";
import { EditorContextMenu } from "../features/editor/EditorContextMenu";
import type { StrokeEdge } from "../features/editor/strokeEdges";
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
import { StyleWorkspace } from "../features/styles/StyleWorkspace";
import { AppNavigation } from "./AppNavigation";
import type { WorkspacePage } from "./AppNavigation";

export default function App({ initialProject }: { initialProject: Project }) {
  return (
    <ProjectProvider initialProject={initialProject}>
      <ToastProvider>
        <Workspace />
      </ToastProvider>
    </ProjectProvider>
  );
}

function ProjectImportDialog(
  props: Omit<Parameters<typeof ImportDialog>[0], "brush" | "color">,
) {
  const brush = useProject((s) => s.project.brush);
  const color = useProject((s) => s.project.style?.color);
  return <ImportDialog {...props} brush={brush} color={color} />;
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
      <Button
        variant="bare"
        className="shrink-0 underline underline-offset-2"
        onClick={exportProject}
      >
        导出应急副本
      </Button>
    </div>
  );
}

function Workspace() {
  const [page, setPage] = useState<WorkspacePage>("library");
  const activeGlyphId = useProject((s) => s.project.activeId);
  const [contextMenu, setContextMenu] = useState<
    (Point & { edge?: StrokeEdge }) | null
  >(null);
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
  const toast = useToast();
  const [shortcuts, setShortcuts] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const editorStage = useRef<HTMLDivElement>(null);
  const focusedEditorGlyph = useRef<string | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const openContextMenu = (
    position: Point,
    n: string | null,
    s: string | null,
    edge?: StrokeEdge,
  ) => {
    const nodeIds = api.getState().session.nodeIds;
    if (n && nodeIds.includes(n))
      selectNodes([...nodeIds.filter((id) => id !== n), n], s);
    else select(n, s);
    setContextMenu({ ...position, edge });
  };
  const openGlyphContextMenu = (id: string, position: Point) => {
    switchGlyph(id);
    openContextMenu(position, null, null);
  };
  const { source, setSource, importFile, exportProject, saveSvg, savePng } =
    useProjectFiles();
  const editorBlocked =
    page !== "editor" ||
    !!source ||
    !!editingGlyphInfo ||
    !!deletingGlyph ||
    !!contextMenu ||
    shortcuts;
  useEffect(() => {
    if (page !== "editor") {
      focusedEditorGlyph.current = null;
      return;
    }
    if (editorBlocked || focusedEditorGlyph.current === activeGlyphId) return;
    focusedEditorGlyph.current = activeGlyphId;
    // 字符切换后等菜单、弹窗关闭并恢复入口焦点，再聚焦编辑画布。
    editorStage.current?.focus({ preventScroll: true });
  }, [activeGlyphId, page, editorBlocked]);
  const { remove, duplicate } = useEditorCommands({
    blocked: editorBlocked,
    showShortcuts: () => setShortcuts(true),
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
            active={page === "library"}
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
            stageRef={editorStage}
            openContextMenu={openContextMenu}
            showShortcuts={() => setShortcuts(true)}
            importFile={importFile}
            modalOpen={editorBlocked}
          />
          <Properties onExportSvg={saveSvg} onExportPng={savePng} />
        </div>
        <div hidden={page !== "styles"} className="min-h-0 flex-1">
          <StyleWorkspace active={page === "styles"} />
        </div>
      </div>
      {contextMenu && (
        <EditorContextMenu
          position={contextMenu}
          edge={contextMenu.edge}
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
            toast("已删除字符", { tone: "success" });
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
            toast(`已提取 ${g.strokes.length} 条笔画`, { tone: "success" });
          }}
        />
      )}
      {shortcuts && <ShortcutsDialog onClose={() => setShortcuts(false)} />}
    </div>
  );
}
