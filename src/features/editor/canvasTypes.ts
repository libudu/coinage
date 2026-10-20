import type { Point } from "../../core/model";

export type Tool = "select" | "pen" | "branch" | "hand";
export type EditorCanvasProps = {
  importFile: (file: File) => void;
  toast: (message: string) => void;
  modalOpen: boolean;
  showShortcuts: () => void;
  openContextMenu: (position: Point, node: string | null, stroke: string | null) => void;
};
