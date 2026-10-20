import { clamp, glyphBounds } from "../../core/geometry";
import { defaultBrush } from "../../core/brush";
import type { BrushDefaults } from "../../core/brush";
import { emptyGlyph, newStroke, uid } from "../../core/model";
import type { Glyph, Point } from "../../core/model";
import {
  defaultImportSettings,
  traceOptionLimits,
} from "../../core/importSettings";
import type { TraceOptions } from "../../core/importSettings";
export type Raster = {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
};
export function makeMask(raster: Raster, options: TraceOptions) {
  const { pixels, width, height } = raster,
    mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    const r = pixels[i * 4],
      g = pixels[i * 4 + 1],
      b = pixels[i * 4 + 2],
      a = pixels[i * 4 + 3];
    const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    mask[i] =
      a > 100 &&
      (options.polarity === "dark"
        ? brightness < options.threshold
        : brightness > 255 - options.threshold)
        ? 1
        : 0;
  }
  // 将边界留空，使邻域运算的结果保持确定。
  for (let x = 0; x < width; x++) {
    mask[x] = 0;
    mask[(height - 1) * width + x] = 0;
  }
  for (let y = 0; y < height; y++) {
    mask[y * width] = 0;
    mask[y * width + width - 1] = 0;
  }
  return mask;
}
function filterNoise(mask: Uint8Array, w: number, h: number, size: number) {
  const visited = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || visited[i]) continue;
    const queue = [i];
    visited[i] = 1;
    for (let n = 0; n < queue.length; n++) {
      const p = queue[n],
        x = p % w,
        y = Math.floor(p / w);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (x + dx < 0 || x + dx >= w || y + dy < 0 || y + dy >= h) continue;
          const j = p + dy * w + dx;
          if (mask[j] && !visited[j]) {
            visited[j] = 1;
            queue.push(j);
          }
        }
    }
    if (queue.length < size)
      queue.forEach((p) => {
        mask[p] = 0;
      });
  }
}
function distanceField(mask: Uint8Array, w: number, h: number) {
  const field = Float32Array.from(mask, (b) => (b ? 1e5 : 0)),
    diag = Math.SQRT2;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i])
        field[i] = Math.min(
          field[i],
          field[i - 1] + 1,
          field[i - w] + 1,
          field[i - w - 1] + diag,
          field[i - w + 1] + diag,
        );
    }
  for (let y = h - 2; y > 0; y--)
    for (let x = w - 2; x > 0; x--) {
      const i = y * w + x;
      if (mask[i])
        field[i] = Math.min(
          field[i],
          field[i + 1] + 1,
          field[i + w] + 1,
          field[i + w + 1] + diag,
          field[i + w - 1] + diag,
        );
    }
  return field;
}
function skeletonize(mask: Uint8Array, w: number, h: number) {
  const out = mask.slice(),
    remove: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      remove.length = 0;
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!out[i]) continue;
          const p = [
            out[i - w],
            out[i - w + 1],
            out[i + 1],
            out[i + w + 1],
            out[i + w],
            out[i + w - 1],
            out[i - 1],
            out[i - w - 1],
          ];
          const count = p.reduce((a, b) => a + b, 0);
          if (count < 2 || count > 6) continue;
          let transitions = 0;
          for (let n = 0; n < 8; n++)
            if (!p[n] && p[(n + 1) % 8]) transitions++;
          if (transitions !== 1) continue;
          if (
            step === 0
              ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6]
              : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]
          )
            continue;
          remove.push(i);
        }
      if (remove.length) changed = true;
      remove.forEach((i) => {
        out[i] = 0;
      });
    }
  }
  return out;
}
function simplifyIndices(points: Point[], epsilon: number): number[] {
  const keep = new Set([0, points.length - 1]),
    stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!,
      start = points[a],
      end = points[b];
    let far = epsilon,
      index = -1;
    for (let i = a + 1; i < b; i++) {
      const p = points[i],
        dx = end.x - start.x,
        dy = end.y - start.y,
        t = clamp(
          ((p.x - start.x) * dx + (p.y - start.y) * dy) /
            (dx * dx + dy * dy || 1),
          0,
          1,
        );
      const d = Math.hypot(p.x - start.x - t * dx, p.y - start.y - t * dy);
      if (d > far) {
        far = d;
        index = i;
      }
    }
    if (index > 0) {
      keep.add(index);
      stack.push([a, index], [index, b]);
    }
  }
  return [...keep].sort((a, b) => a - b);
}
export function traceRaster(
  raster: Raster,
  options: TraceOptions,
  name: string,
  brush: BrushDefaults = defaultBrush,
): Glyph {
  return traceRasterWithPlacement(raster, options, name, brush).glyph;
}

export function traceRasterWithPlacement(
  raster: Raster,
  options: TraceOptions,
  name: string,
  brush: BrushDefaults = defaultBrush,
): { glyph: Glyph; referenceOffset: Point } {
  const { width: w, height: h } = raster,
    mask = makeMask(raster, options);
  filterNoise(mask, w, h, options.noise);
  if (!mask.some(Boolean))
    throw new Error("没有检测到笔画，请调整阈值或前景颜色。");
  if (mask.reduce((sum, b) => sum + b, 0) > mask.length * 0.85)
    throw new Error("前景覆盖过大，请切换前景颜色或降低阈值。");
  const widths = distanceField(mask, w, h),
    skeleton = skeletonize(mask, w, h);
  const neighbors = (p: number): number[] => {
    const out: number[] = [],
      x = p % w,
      y = Math.floor(p / w);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (
          (!dx && !dy) ||
          x + dx < 0 ||
          x + dx >= w ||
          y + dy < 0 ||
          y + dy >= h
        )
          continue;
        const j = p + dy * w + dx;
        if (!skeleton[j]) continue;
        if (dx && dy && (skeleton[p + dx] || skeleton[p + dy * w])) continue;
        out.push(j);
      }
    return out;
  };
  const pixels: number[] = [];
  skeleton.forEach((v, i) => {
    if (v) pixels.push(i);
  });
  const adjacent = new Map(pixels.map((p) => [p, neighbors(p)])),
    vertex = new Map<number, string>(),
    g = emptyGlyph(name);
  const scale = 640 / Math.max(w, h),
    ox = (640 - w * scale) / 2,
    oy = (640 - h * scale) / 2;
  const createNode = (p: number) => {
    const id = uid();
    g.nodes[id] = {
      id,
      x: (p % w) * scale + ox,
      y: Math.floor(p / w) * scale + oy,
      width: clamp(
        options.width,
        traceOptionLimits.width.min,
        traceOptionLimits.width.max,
      ),
      mode: "corner",
    };
    return id;
  };
  // 将相邻的交汇像素合并为一个共享且可编辑的节点。
  for (const p of pixels) {
    if (vertex.has(p) || adjacent.get(p)!.length === 2) continue;
    const cluster = [p],
      id = createNode(p);
    vertex.set(p, id);
    if (adjacent.get(p)!.length > 2)
      for (let i = 0; i < cluster.length; i++)
        for (const q of adjacent.get(cluster[i])!) {
          if (!vertex.has(q) && adjacent.get(q)!.length > 2) {
            vertex.set(q, id);
            cluster.push(q);
          }
        }
    g.nodes[id].x =
      (cluster.reduce((a, q) => a + (q % w), 0) / cluster.length) * scale + ox;
    g.nodes[id].y =
      (cluster.reduce((a, q) => a + Math.floor(q / w), 0) / cluster.length) *
        scale +
      oy;
  }
  const visited = new Set<string>(),
    edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const walk = (start: number, next: number) => {
    const path = [start];
    let prev = start,
      current = next;
    visited.add(edgeKey(prev, current));
    while (true) {
      path.push(current);
      if (vertex.has(current)) break;
      const available = adjacent
        .get(current)!
        .filter((n) => n !== prev && !visited.has(edgeKey(current, n)));
      if (!available.length) {
        vertex.set(current, createNode(current));
        break;
      }
      prev = current;
      current = available[0];
      visited.add(edgeKey(prev, current));
      if (path.length > pixels.length) break;
    }
    const startId = vertex.get(start)!,
      endId = vertex.get(current)!;
    if (path.length < 3 && startId === endId) return;
    // 方形端部的骨架可能产生细小的斜向毛刺，此处只移除这些毛刺。
    const endpoint =
      adjacent.get(start)!.length === 1 || adjacent.get(current)!.length === 1;
    if (
      endpoint &&
      path.length < Math.max(widths[start], widths[current]) * 0.8
    )
      return;
    const xy = path.map((p) => ({ x: p % w, y: Math.floor(p / w) }));
    const indices = simplifyIndices(xy, options.simplify);
    // 保留原图宽度变化处的节点，便于后续局部编辑。
    for (let i = 5; i < path.length - 5; i += 5) {
      const nearest = indices.reduce(
        (best, n) => (Math.abs(n - i) < Math.abs(best - i) ? n : best),
        indices[0],
      );
      if (
        Math.abs(widths[path[i]] - widths[path[nearest]]) >
        Math.max(2, widths[path[i]] * 0.3)
      )
        indices.push(i);
    }
    indices.sort((a, b) => a - b);
    const ids = [...new Set(indices)].map((i) =>
      i === 0 ? startId : i === path.length - 1 ? endId : createNode(path[i]),
    );
    if (ids.length >= 2 && !(ids.length === 2 && ids[0] === ids[1]))
      g.strokes.push(newStroke(ids, g.strokes.length));
  };
  for (const [p] of vertex)
    for (const q of adjacent.get(p)!) {
      if (!visited.has(edgeKey(p, q)) && vertex.get(p) !== vertex.get(q))
        walk(p, q);
    }
  // 闭合轮廓没有端点，需选取一个起始点并遍历完整闭环。
  for (const p of pixels)
    for (const q of adjacent.get(p)!) {
      if (
        !visited.has(edgeKey(p, q)) &&
        (!vertex.has(p) || vertex.get(p) !== vertex.get(q))
      ) {
        if (!vertex.has(p)) vertex.set(p, createNode(p));
        walk(p, q);
      }
    }
  const used = new Set(g.strokes.flatMap((s) => s.nodes));
  Object.keys(g.nodes).forEach((id) => {
    if (!used.has(id)) delete g.nodes[id];
  });
  if (!g.strokes.length)
    throw new Error("没有提取到有效路径，请降低去噪强度或使用更清晰的图片。");
  return centerTraceGlyph(g, scale, brush);
}

function centerTraceGlyph(
  g: Glyph,
  scale: number,
  brush: BrushDefaults,
  referenceOffset: Point = { x: 0, y: 0 },
) {
  // 整体平移全部轮廓，包括彼此不相连的笔画。
  const bounds = glyphBounds(g, brush)!,
    offset = {
      x: 320 - (bounds.minX + bounds.maxX) / 2,
      y: 320 - (bounds.minY + bounds.maxY) / 2,
    };
  for (const node of Object.values(g.nodes)) {
    node.x += offset.x;
    node.y += offset.y;
  }
  return {
    glyph: g,
    referenceOffset: {
      x: referenceOffset.x + offset.x / scale,
      y: referenceOffset.y + offset.y / scale,
    },
  };
}

// 粗细不影响骨架，直接复用识别结果并重新对齐轮廓与原图。
export function resizeTrace(
  result: { glyph: Glyph; referenceOffset: Point },
  raster: Pick<Raster, "width" | "height">,
  width: number,
  brush: BrushDefaults = defaultBrush,
  offset: Point = { x: 0, y: 0 },
) {
  const glyph = {
    ...result.glyph,
    nodes: Object.fromEntries(
      Object.entries(result.glyph.nodes).map(([id, node]) => [
        id,
        {
          ...node,
          width: clamp(
            width,
            traceOptionLimits.width.min,
            traceOptionLimits.width.max,
          ),
        },
      ]),
    ),
  };
  const centered = centerTraceGlyph(
    glyph,
    640 / Math.max(raster.width, raster.height),
    brush,
    result.referenceOffset,
  );
  const nodes = Object.values(glyph.nodes);
  const dx = clamp(
      offset.x,
      -Math.min(...nodes.map((n) => n.x)),
      640 - Math.max(...nodes.map((n) => n.x)),
    ),
    dy = clamp(
      offset.y,
      -Math.min(...nodes.map((n) => n.y)),
      640 - Math.max(...nodes.map((n) => n.y)),
    );
  nodes.forEach((node) => {
    node.x += dx;
    node.y += dy;
  });
  const scale = 640 / Math.max(raster.width, raster.height);
  centered.referenceOffset.x += dx / scale;
  centered.referenceOffset.y += dy / scale;
  return centered;
}

export async function readImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片无法读取"));
    img.src = src;
  });
}
export async function rasterize(
  src: string,
  crop = defaultImportSettings.crop,
): Promise<{ raster: Raster; reference: string }> {
  const img = await readImage(src),
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = 420;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!,
    side =
      Math.max(img.naturalWidth, img.naturalHeight) * (1 - (crop * 2) / 100),
    sx = (img.naturalWidth - side) / 2,
    sy = (img.naturalHeight - side) / 2;
  // 以补齐短边后的正方形向内裁剪，0 时保留完整原图。
  ctx.drawImage(img, sx, sy, side, side, 30, 30, 360, 360);
  return {
    raster: {
      pixels: ctx.getImageData(0, 0, 420, 420).data,
      width: 420,
      height: 420,
    },
    reference: canvas.toDataURL("image/png"),
  };
}
