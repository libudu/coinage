import type { Point } from "../../core/model";
import { uid } from "../../core/model";
import { Menu } from "../../shared/components/Menu";
import type { MenuItem } from "../../shared/components/Menu";
import { useContextMenuActions } from "./useContextMenuActions";
import { canInsertEdgeMidpoint, insertEdgeMidpoint } from "./strokeEdges";
import type { StrokeEdge } from "./strokeEdges";

type Props = {
  remove: () => void;
  duplicate: () => void;
  editGlyphInfo: () => void;
  position: Point;
  edge?: StrokeEdge;
  onClose: () => void;
};
export function EditorContextMenu({
  remove,
  duplicate,
  editGlyphInfo,
  position,
  edge,
  onClose,
}: Props) {
  const {
    glyph,
    nodeIds,
    node,
    multiple,
    stroke,
    nodeLocked,
    locked,
    transform,
    merge,
    disconnect,
    update,
    select,
    duplicateGlyph,
  } = useContextMenuActions();
  const items: MenuItem[] = [];
  if (edge && stroke?.id === edge.strokeId && !nodeIds.length) {
    items.push({
      label: "插入中点",
      icon: "node",
      disabled: !canInsertEdgeMidpoint(glyph, edge),
      action: () => {
        if (!canInsertEdgeMidpoint(glyph, edge)) return;
        const id = uid();
        update((g) => {
          insertEdgeMidpoint(g, edge, id);
        });
        select(id, edge.strokeId);
      },
    });
  }
  if (stroke || multiple) {
    const transformLocked =
      locked || (!multiple && !!stroke?.nodes.some(nodeLocked));
    if (!multiple)
      items.push({ label: "复制笔画", icon: "copy", action: duplicate });
    items.push(
      {
        label: "水平翻转",
        icon: "reflect",
        action: () => transform("flip"),
        disabled: transformLocked,
      },
      {
        label: "旋转 90°",
        icon: "rotate",
        action: () => transform("rotate"),
        disabled: transformLocked,
      },
    );
  }
  if (node) {
    items.push({
      label: multiple ? "删除所选节点" : "删除节点",
      icon: "trash",
      action: remove,
      disabled: locked,
      danger: true,
    });
    if (!multiple)
      items.push(
        {
          label: "合并邻近节点",
          icon: "branch",
          action: merge,
          disabled: locked,
        },
        {
          label: "拆开连接",
          icon: "node",
          action: disconnect,
          disabled:
            locked ||
            !stroke ||
            glyph.strokes.filter((s) => s.nodes.includes(node.id)).length < 2,
        },
      );
  } else if (stroke) {
    items.push({
      label: "删除笔画",
      icon: "trash",
      action: remove,
      disabled: locked,
      danger: true,
    });
  } else {
    items.push(
      { label: "编辑基本信息", icon: "pen", action: editGlyphInfo },
      { label: "复制字符", icon: "copy", action: duplicateGlyph },
      { label: "删除字符", icon: "trash", action: remove, danger: true },
    );
  }
  return (
    <Menu
      position={position}
      onClose={onClose}
      label={node ? "节点操作" : stroke ? "笔画操作" : "字符操作"}
      items={items}
      variant="compact"
      className="editor-context-menu fixed z-[60]"
    />
  );
}
