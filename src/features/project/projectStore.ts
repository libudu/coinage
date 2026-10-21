import { defaultProjectStyle } from "../../core/glyphEffects";
import type { ProjectStyle } from "../../core/glyphEffects";
import { freeze, produce } from "immer";
import { createStore } from "zustand/vanilla";
import { emptyGlyph, uid } from "../../core/model";
import type { Glyph, Point, Project } from "../../core/model";
import { changeGlobalBrush } from "../../core/brush";
import type { BrushDefaults } from "../../core/brush";
import type { Tool } from "../editor/canvasTypes";
import {
  removeNodes,
  selectionLocked,
  translateNodes,
} from "../editor/nodeSelection";
import { clamp } from "../../core/geometry";
import { reconcileStrokeGeometry } from "../../core/strokeEditing";

export type TransactionId = symbol;
type Transaction = { id: TransactionId; before: Project };
export type SaveStatus = "saving" | "saved" | "error";
export type EditorSession = {
  nodeIds: string[];
  strokeId: string | null;
  tool: Tool;
  showReference: boolean;
};
export type ProjectState = {
  project: Project;
  committedProject: Project;
  session: EditorSession;
  past: Project[];
  future: Project[];
  transaction: Transaction | null;
  saved: SaveStatus;
  saveError: string;
  actions: {
    update: (
      recipe: (glyph: Glyph, project: Project) => void,
      transaction?: TransactionId,
    ) => void;
    replace: (project: Project) => void;
    beginTransaction: () => TransactionId;
    commitTransaction: (id?: TransactionId) => void;
    cancelTransaction: (id: TransactionId) => void;
    undo: () => void;
    redo: () => void;
    select: (
      node: string | null,
      stroke?: string | null,
      transaction?: TransactionId,
    ) => void;
    selectNodes: (
      nodes: string[],
      stroke?: string | null,
      transaction?: TransactionId,
    ) => void;
    switchGlyph: (id: string) => void;
    setTool: (tool: Tool) => void;
    setShowReference: (visible: boolean) => void;
    addGlyph: (glyph?: Glyph) => void;
    editGlyphInfo: (
      id: string,
      info: Pick<Glyph, "name" | "description">,
    ) => void;
    duplicateGlyph: () => void;
    removeGlyph: (id: string) => void;
    removeSelection: () => boolean;
    duplicateStroke: () => void;
    moveSelection: (offset: Point, transaction?: TransactionId) => void;
    changeStyle: (
      recipe: (style: ProjectStyle) => void,
      transaction?: TransactionId,
    ) => void;
    changeBrush: (
      patch: Partial<BrushDefaults>,
      transaction?: TransactionId,
    ) => void;
  };
};

export const activeGlyph = (state: Pick<ProjectState, "project">) =>
  state.project.glyphs.find((g) => g.id === state.project.activeId) ??
  state.project.glyphs[0];

const appendHistory = (past: Project[], project: Project) => [
  ...past.slice(-59),
  project,
];
const emptySelection = { nodeIds: [] as string[], strokeId: null };
// 手稿只包含 JSON 数据，未修改的分支可通过共享引用快速比较。
// 交互结束时若回到初始值，也按无变化处理。
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((key) => left[key] !== undefined);
  return (
    keys.length ===
      Object.keys(right).filter((key) => right[key] !== undefined).length &&
    keys.every((key) => sameValue(left[key], right[key]))
  );
}
function cleanSession(project: Project, session: EditorSession): EditorSession {
  const glyph = activeGlyph({ project });
  const nodeIds = session.nodeIds.filter((id) => !!glyph.nodes[id]);
  const strokeId = glyph.strokes.some((s) => s.id === session.strokeId)
    ? session.strokeId
    : null;
  if (
    strokeId === session.strokeId &&
    nodeIds.length === session.nodeIds.length
  )
    return session;
  return { ...session, nodeIds, strokeId };
}
// 撤销编辑时保留当前仍存在的字符，不回退字符切换状态。
function restore(snapshot: Project, current: Project): Project {
  const activeId = snapshot.glyphs.some((g) => g.id === current.activeId)
    ? current.activeId
    : snapshot.activeId;
  return snapshot.activeId === activeId ? snapshot : { ...snapshot, activeId };
}

// 字符管理同步到历史快照，撤销造字编辑时保留最新的字符列表和基本信息。
// 删除字符后，去掉仅影响该字符的空历史，避免撤销按钮出现无效步骤。
function rebaseHistory(
  history: Project[],
  current: Project,
  recipe: (project: Project) => void,
): Project[] {
  const next: Project[] = [];
  let previous = current;
  for (const snapshot of [...history].reverse()) {
    const project = produce(snapshot, recipe);
    if (
      sameValue(project.glyphs, previous.glyphs) &&
      sameValue(project.brush, previous.brush) &&
      sameValue(project.style, previous.style)
    )
      continue;
    next.push(project);
    previous = project;
  }
  return next.reverse();
}

export function createProjectStore(initialProject: Project) {
  const initial = freeze(structuredClone(initialProject), true);
  const glyph = activeGlyph({ project: initial });
  return createStore<ProjectState>()((set, get) => {
    const updateLibrary = (recipe: (project: Project) => void) => {
      actions.commitTransaction();
      const state = get();
      const apply = (draft: Project) => {
        recipe(draft);
        if (!draft.glyphs.some((g) => g.id === draft.activeId))
          draft.activeId = draft.glyphs[0].id;
      };
      const project = produce(state.project, apply);
      if (sameValue(project, state.project)) return;
      const switched = project.activeId !== state.project.activeId;
      set({
        project,
        committedProject: project,
        saved: "saving",
        past: rebaseHistory(state.past, project, apply),
        future: rebaseHistory(state.future, project, apply),
        session: cleanSession(
          project,
          switched
            ? { ...state.session, ...emptySelection, showReference: false }
            : state.session,
        ),
      });
    };
    const actions: ProjectState["actions"] = {
      update(recipe, transaction) {
        if (transaction !== undefined && get().transaction?.id !== transaction)
          return;
        if (transaction === undefined) actions.commitTransaction();
        const state = get();
        const project = produce(state.project, (draft) => {
          recipe(activeGlyph({ project: draft }), draft);
          draft.glyphs.forEach((g) => {
            const before = state.project.glyphs.find(
              (previous) => previous.id === g.id,
            );
            const origin = state.transaction?.before.glyphs.find(
              (initial) => initial.id === g.id,
            );
            if (before) reconcileStrokeGeometry(before, g, origin ?? before);
          });
          if (!draft.glyphs.some((g) => g.id === draft.activeId))
            draft.activeId = draft.glyphs[0].id;
        });
        if (sameValue(project, state.project)) return;
        const switched = project.activeId !== state.project.activeId;
        set({
          project,
          session: cleanSession(
            project,
            switched
              ? { ...state.session, ...emptySelection, showReference: false }
              : state.session,
          ),
          saved: "saving",
          ...(transaction === undefined
            ? {
                committedProject: project,
                past: appendHistory(state.past, state.project),
                future: [],
              }
            : {}),
        });
      },
      replace(project) {
        actions.commitTransaction();
        const next = freeze(structuredClone(project), true);
        const state = get();
        set({
          project: next,
          committedProject: next,
          past: [],
          future: [],
          transaction: null,
          saved: "saving",
          session: {
            ...state.session,
            ...emptySelection,
            tool: "select",
            showReference: false,
          },
        });
      },
      beginTransaction() {
        actions.commitTransaction();
        const id = Symbol("edit");
        set({ transaction: { id, before: get().project } });
        return id;
      },
      commitTransaction(id) {
        const state = get(),
          pending = state.transaction;
        if (!pending || (id !== undefined && pending.id !== id)) return;
        const changed = !sameValue(state.project, pending.before);
        set({
          transaction: null,
          ...(!changed ? { project: pending.before } : {}),
          ...(changed
            ? {
                committedProject: state.project,
                past: appendHistory(state.past, pending.before),
                future: [],
              }
            : {}),
        });
      },
      cancelTransaction(id) {
        const state = get(),
          pending = state.transaction;
        if (!pending || pending.id !== id) return;
        set({
          project: pending.before,
          transaction: null,
          session: cleanSession(pending.before, state.session),
        });
      },
      undo() {
        actions.commitTransaction();
        const state = get(),
          snapshot = state.past.at(-1);
        if (!snapshot) return;
        const project = restore(snapshot, state.project);
        set({
          project,
          committedProject: project,
          past: state.past.slice(0, -1),
          future: [...state.future, state.project],
          saved: "saving",
          session: {
            ...state.session,
            ...emptySelection,
            showReference: false,
          },
        });
      },
      redo() {
        actions.commitTransaction();
        const state = get(),
          snapshot = state.future.at(-1);
        if (!snapshot) return;
        const project = restore(snapshot, state.project);
        set({
          project,
          committedProject: project,
          past: appendHistory(state.past, state.project),
          future: state.future.slice(0, -1),
          saved: "saving",
          session: {
            ...state.session,
            ...emptySelection,
            showReference: false,
          },
        });
      },
      select(node, stroke, transaction) {
        actions.selectNodes(node ? [node] : [], stroke, transaction);
      },
      selectNodes(nodes, stroke, transaction) {
        if (transaction !== undefined && get().transaction?.id !== transaction)
          return;
        const state = get();
        const session = cleanSession(state.project, {
          ...state.session,
          nodeIds: [...new Set(nodes)],
          strokeId: stroke === undefined ? state.session.strokeId : stroke,
        });
        if (
          session.strokeId === state.session.strokeId &&
          sameValue(session.nodeIds, state.session.nodeIds)
        )
          return;
        // 普通选区变化会结束旧目标的编辑；创建分支时，
        // 可显式传入所属事务 token，使选中新节点仍属于同一次编辑。
        if (transaction === undefined) actions.commitTransaction();
        set({ session });
      },
      switchGlyph(id) {
        if (!get().project.glyphs.some((g) => g.id === id)) return;
        actions.commitTransaction();
        const state = get();
        const project =
          state.project.activeId === id
            ? state.project
            : { ...state.project, activeId: id };
        set({
          project,
          committedProject: project,
          session: {
            ...state.session,
            ...emptySelection,
            showReference: false,
          },
        });
      },
      setTool(tool) {
        actions.commitTransaction();
        set({ session: { ...get().session, tool } });
      },
      setShowReference(showReference) {
        set({ session: { ...get().session, showReference } });
      },
      addGlyph(glyph) {
        const next =
          glyph ??
          emptyGlyph(
            `字形 ${String(get().project.glyphs.length + 1).padStart(2, "0")}`,
          );
        updateLibrary((p) => {
          p.glyphs.push(next);
          p.activeId = next.id;
        });
        actions.select(null, glyph?.strokes[0]?.id ?? null);
        actions.setTool(glyph ? "select" : "pen");
      },
      editGlyphInfo(id, info) {
        updateLibrary((p) => {
          const target = p.glyphs.find((g) => g.id === id);
          if (target) {
            target.name = info.name;
            target.description = info.description;
          }
        });
      },
      duplicateGlyph() {
        actions.commitTransaction();
        const copy = structuredClone(activeGlyph(get()));
        copy.id = uid();
        copy.name += " 副本";
        updateLibrary((p) => {
          p.glyphs.push(copy);
          p.activeId = copy.id;
        });
      },
      removeGlyph(id) {
        if (!get().project.glyphs.some((g) => g.id === id)) return;
        const fallback = emptyGlyph();
        updateLibrary((p) => {
          p.glyphs = p.glyphs.filter((g) => g.id !== id);
          if (!p.glyphs.length) p.glyphs.push(fallback);
        });
      },
      removeSelection() {
        const state = get(),
          glyph = activeGlyph(state),
          { nodeIds, strokeId } = state.session;
        const stroke = glyph.strokes.find((s) => s.id === strokeId);
        if (!nodeIds.length && !stroke) return false;
        if (nodeIds.length ? selectionLocked(glyph, nodeIds) : stroke?.locked)
          return false;
        actions.update((g) => {
          if (nodeIds.length) removeNodes(g, nodeIds);
          else if (stroke) {
            g.strokes = g.strokes.filter((s) => s.id !== stroke.id);
            const used = new Set(g.strokes.flatMap((s) => s.nodes));
            Object.keys(g.nodes).forEach((id) => {
              if (!used.has(id)) delete g.nodes[id];
            });
          }
        });
        actions.select(null, null);
        return true;
      },
      duplicateStroke() {
        const state = get(),
          glyph = activeGlyph(state);
        const stroke = glyph.strokes.find(
          (s) => s.id === state.session.strokeId,
        );
        if (!stroke) return;
        const sid = uid();
        const originals = stroke.nodes.map((id) => glyph.nodes[id]);
        const dx = clamp(
          24,
          -Math.min(...originals.map((n) => n.x)),
          640 - Math.max(...originals.map((n) => n.x)),
        );
        const dy = clamp(
          24,
          -Math.min(...originals.map((n) => n.y)),
          640 - Math.max(...originals.map((n) => n.y)),
        );
        actions.update((g) => {
          const mapping = new Map<string, string>();
          const nodes = stroke.nodes.map((old) => {
            if (mapping.has(old)) return mapping.get(old)!;
            const id = uid(),
              node = g.nodes[old];
            mapping.set(old, id);
            g.nodes[id] = {
              ...node,
              id,
              x: node.x + dx,
              y: node.y + dy,
            };
            return id;
          });
          g.strokes.push({
            ...stroke,
            id: sid,
            name: `${stroke.name} 副本`,
            nodes,
            ...(stroke.segments
              ? {
                  segments: stroke.segments.map((segment) => ({
                    ...segment,
                    from: mapping.get(segment.from)!,
                    to: mapping.get(segment.to)!,
                  })),
                }
              : {}),
            locked: false,
          });
        });
        actions.select(null, sid);
      },
      moveSelection(offset, transaction) {
        const ids = get().session.nodeIds;
        actions.update((g) => {
          translateNodes(g, ids, offset);
        }, transaction);
      },
      changeStyle(recipe, transaction) {
        actions.update((_, project) => {
          project.style ??= structuredClone(defaultProjectStyle);
          recipe(project.style);
        }, transaction);
      },
      changeBrush(patch, transaction) {
        actions.update((_, p) => changeGlobalBrush(p, patch), transaction);
      },
    };
    return {
      project: initial,
      committedProject: initial,
      session: {
        nodeIds: glyph.strokes[0]?.nodes[1] ? [glyph.strokes[0].nodes[1]] : [],
        strokeId: glyph.strokes[0]?.id ?? null,
        tool: "select",
        showReference: false,
      },
      past: [],
      future: [],
      transaction: null,
      saved: "saving",
      saveError: "",
      actions,
    };
  });
}
export type ProjectStore = ReturnType<typeof createProjectStore>;
