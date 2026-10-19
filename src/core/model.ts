import type { BrushDefaults, BrushSettings, BrushTip } from "./brush";

export type Point = { x: number; y: number };
export type NodeMode = "corner" | "smooth" | "symmetric";
export type Knot = Point & {
  id: string;
  width: number;
  mode: NodeMode;
  handle?: Point;
  handleIn?: Point;
  join?: "miter" | "round" | "bevel";
};
export type Stroke = {
  id: string;
  name: string;
  nodes: string[];
  visible: boolean;
  locked: boolean;
  cap: "butt" | "round" | "square";
  // Legacy v1 import fields; ignored when rendering and removed during migration.
  startTip?: BrushTip | "basic";
  endTip?: BrushTip | "basic";
  startBrush?: BrushSettings;
  endBrush?: BrushSettings;
  join: "miter" | "round" | "bevel";
};
export type Glyph = {
  id: string;
  name: string;
  nodes: Record<string, Knot>;
  strokes: Stroke[];
  color: string;
  reference?: string;
  referenceOpacity: number;
};
export type Project = {
  version: 1;
  name: string;
  glyphs: Glyph[];
  activeId: string;
  brush?: BrushDefaults;
};
export const uid = () => crypto.randomUUID();
export const emptyGlyph = (name = "新字符"): Glyph => ({
  id: uid(),
  name,
  nodes: {},
  strokes: [],
  color: "#243d34",
  referenceOpacity: 22,
});
export function newStroke(nodes: string[], count: number): Stroke {
  return {
    id: uid(),
    name: `笔画 ${String(count + 1).padStart(2, "0")}`,
    nodes,
    visible: true,
    locked: false,
    cap: "butt",
    join: "miter",
  };
}
