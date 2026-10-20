import type { Project } from "./model";
import { isProject } from "./validation";

export type ProjectPatch = (
  | { op: "set"; path: string[]; value: unknown }
  | { op: "remove"; path: string[] }
)[];

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// 补丁中的字符与笔画按 ID 定位，顺序独立存储，避免增删或排序时重传其他字符的原图。
function indexed(project: Project) {
  const { glyphs, ...metadata } = project;
  return { ...metadata, glyphOrder: glyphs.map((glyph) => glyph.id),
    glyphs: Object.fromEntries(glyphs.map(({ strokes, ...glyph }) => [glyph.id, {
      ...glyph, strokeOrder: strokes.map((stroke) => stroke.id),
      strokes: Object.fromEntries(strokes.map((stroke) => [stroke.id, stroke])),
    }])),
  };
}

export function createProjectPatch(previous: Project, next: Project): ProjectPatch {
  const changes: ProjectPatch = [];
  const diff = (before: unknown, after: unknown, path: string[]) => {
    if (Object.is(before, after)) return;
    if (record(before) && record(after)) {
      for (const key of Object.keys(before)) {
        if (before[key] !== undefined && (!Object.hasOwn(after, key) || after[key] === undefined))
          changes.push({ op: "remove", path: [...path, key] });
      }
      for (const key of Object.keys(after)) {
        if (after[key] !== undefined) diff(Object.hasOwn(before, key) ? before[key] : undefined, after[key], [...path, key]);
      }
      return;
    }
    // 只有顺序和笔画节点引用使用数组；未变化的 ID 数组不进入补丁。
    if (Array.isArray(before) && Array.isArray(after)
      && before.length === after.length && before.every((value, i) => value === after[i])) return;
    changes.push({ op: "set", path, value: after });
  };
  diff(indexed(previous), indexed(next), []);
  return changes;
}

export function isProjectPatch(value: unknown): value is ProjectPatch {
  return Array.isArray(value) && value.every((change) => record(change)
    && (change.op === "set" && Object.hasOwn(change, "value") || change.op === "remove")
    && Array.isArray(change.path) && change.path.length > 0 && change.path.length <= 12
    && change.path.every((key: unknown) => typeof key === "string"));
}

function ordered(items: unknown, order: unknown): Record<string, unknown>[] {
  if (!record(items) || !Array.isArray(order) || order.length !== Object.keys(items).length
    || new Set(order).size !== order.length) throw new Error("补丁中的顺序不正确");
  return order.map((id: unknown) => {
    if (typeof id !== "string" || !Object.hasOwn(items, id) || !record(items[id]) || items[id].id !== id)
      throw new Error("补丁中的 ID 不正确");
    return items[id];
  });
}

export function applyProjectPatch(project: Project, changes: unknown): Project {
  if (!isProjectPatch(changes)) throw new Error("手稿补丁格式不正确");
  // 只修改副本，校验失败时原手稿与备份都保持不变。
  const next = structuredClone(indexed(project)) as Record<string, unknown>;
  for (const change of changes) {
    let target = next;
    for (const key of change.path.slice(0, -1)) {
      if (!Object.hasOwn(target, key) || !record(target[key])) throw new Error("补丁路径不存在");
      target = target[key];
    }
    const key = change.path.at(-1)!;
    if (change.op === "remove") {
      if (!Object.hasOwn(target, key)) throw new Error("补丁路径不存在");
      delete target[key];
    } else {
      // 定义自有属性，既不访问原型链，也不触发 __proto__ 等继承的设置器。
      Object.defineProperty(target, key, { value: change.value, enumerable: true, writable: true, configurable: true });
    }
  }
  const { glyphs, glyphOrder, ...metadata } = next;
  const result = { ...metadata, glyphs: ordered(glyphs, glyphOrder).map((glyph) => {
    const { strokes, strokeOrder, ...properties } = glyph;
    return { ...properties, strokes: ordered(strokes, strokeOrder) };
  }) };
  if (!isProject(result)) throw new Error("补丁产生了无效的手稿");
  return result;
}
