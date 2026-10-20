import type { Glyph, Point } from "../../core/model";
import type { useProject } from "../project/useProject";

export type Tool = "select" | "pen" | "branch" | "hand";
export type EditorCanvasProps = {
  doc: ReturnType<typeof useProject>;
  glyph: Glyph;
  nodeId: string | null;
  nodeIds: string[];
  strokeId: string | null;
  select: (node: string | null, stroke?: string | null) => void;
  selectNodes: (nodes: string[], stroke?: string | null) => void;
  tool: Tool;
  setTool: (t: Tool) => void;
  upload: () => void;
  importFile: (f: File) => void;
  toast: (s: string) => void;
  showReference: boolean;
  modalOpen: boolean;
  toggleInspector: () => void;
  openContextMenu: (
    position: Point,
    node: string | null,
    stroke: string | null,
  ) => void;
};
