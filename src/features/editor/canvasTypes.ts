import type { Point } from "../../core/model";
import type { StrokeEdge } from "./strokeEdges";

export type Tool = "select" | "pen" | "branch" | "hand";
export type EditorCanvasProps = {
  importFile: (file: File) => void;
  modalOpen: boolean;
  showShortcuts: () => void;
  openContextMenu: (
    position: Point,
    node: string | null,
    stroke: string | null,
    edge?: StrokeEdge,
  ) => void;
};
