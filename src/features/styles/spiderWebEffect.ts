import type { SpiderWebSettings } from "../../core/glyphEffects";
import type { Point } from "../../core/model";

type WebNode = Point & { boundary: boolean };
type WebThread = {
  a: number;
  b: number;
  length: number;
  kind: "support" | "capture";
  control: Point;
  weight: number;
  opacity: number;
  sheen: number;
};
export type SpiderWebGeometry = { nodes: WebNode[]; threads: WebThread[] };

// 固定种子让网丝在重绘、重复字符和重新打开预览时保持一致。
function randomSource() {
  let seed = 7321;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function buildSpiderWeb(
  pixels: Uint8ClampedArray,
  size: number,
  density: number,
): SpiderWebGeometry {
  const grid = 192;
  const mask = new Uint8Array(grid * grid);
  const distance = new Float32Array(grid * grid);
  const random = randomSource();
  for (let y = 1; y < grid - 1; y++)
    for (let x = 1; x < grid - 1; x++) {
      const alpha =
        pixels[
          (Math.floor((y * size) / grid) * size +
            Math.floor((x * size) / grid)) *
            4 +
            3
        ];
      mask[y * grid + x] = alpha > 100 ? 1 : 0;
      distance[y * grid + x] = mask[y * grid + x] ? grid : 0;
    }
  // 两遍距离场挑选笔画内部的结网中心，窄笔画也有各自的小网眼。
  for (let y = 1; y < grid - 1; y++)
    for (let x = 1; x < grid - 1; x++) {
      const i = y * grid + x;
      distance[i] = Math.min(
        distance[i],
        distance[i - 1] + 1,
        distance[i - grid] + 1,
        distance[i - grid - 1] + Math.SQRT2,
        distance[i - grid + 1] + Math.SQRT2,
      );
    }
  for (let y = grid - 2; y > 0; y--)
    for (let x = grid - 2; x > 0; x--) {
      const i = y * grid + x;
      distance[i] = Math.min(
        distance[i],
        distance[i + 1] + 1,
        distance[i + grid] + 1,
        distance[i + grid + 1] + Math.SQRT2,
        distance[i + grid - 1] + Math.SQRT2,
      );
    }
  const inside = (x: number, y: number) => {
    const ix = Math.floor(x * grid),
      iy = Math.floor(y * grid);
    return (
      ix >= 0 && iy >= 0 && ix < grid && iy < grid && mask[iy * grid + ix] === 1
    );
  };
  const candidates = [];
  for (let y = 1; y < grid - 1; y += 2)
    for (let x = 1; x < grid - 1; x += 2) {
      const d = distance[y * grid + x];
      const i = y * grid + x;
      const thin =
        d > 0 &&
        Math.max(
          distance[i - 1],
          distance[i + 1],
          distance[i - grid],
          distance[i + grid],
        ) < 1.5;
      if (d >= 1.5 || thin)
        candidates.push({
          x: (x + 0.5) / grid,
          y: (y + 0.5) / grid,
          radius: d / grid,
          score: d * (0.85 + random() * 0.15),
        });
    }
  candidates.sort((a, b) => b.score - a.score);
  const hubs: (Point & { radius: number })[] = [];
  const nodes: WebNode[] = [];
  const threads: WebThread[] = [];
  const addNode = (x: number, y: number, boundary = false) => {
    nodes.push({ x, y, boundary });
    return nodes.length - 1;
  };
  const connect = (
    a: number,
    b: number,
    kind: WebThread["kind"],
    hub: Point,
  ) => {
    const first = nodes[a],
      last = nodes[b];
    const length = Math.hypot(last.x - first.x, last.y - first.y);
    if (length < 0.0005) return;
    const middle = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
    const toHub = { x: hub.x - middle.x, y: hub.y - middle.y };
    const distanceToHub = Math.max(0.0001, Math.hypot(toHub.x, toHub.y));
    const sag =
      kind === "capture"
        ? length * (0.17 + random() * 0.12)
        : length * (random() - 0.5) * 0.025;
    const control = {
      x: middle.x + (toHub.x / distanceToHub) * sag,
      y: middle.y + (toHub.y / distanceToHub) * sag,
    };
    const samples = Math.max(2, Math.ceil(length * grid * 2));
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      if (
        !inside(
          first.x + (last.x - first.x) * t,
          first.y + (last.y - first.y) * t,
        )
      )
        return;
    }
    // 捕获丝向网心自然下垂，曲线也须留在笔画内部，避免穿过字形孔洞。
    for (let attempt = 0; attempt < 5; attempt++) {
      let valid = true;
      for (let i = 1; i < samples; i++) {
        const t = i / samples,
          s = 1 - t;
        if (
          !inside(
            s * s * first.x + 2 * s * t * control.x + t * t * last.x,
            s * s * first.y + 2 * s * t * control.y + t * t * last.y,
          )
        ) {
          valid = false;
          break;
        }
      }
      if (valid) break;
      const shrink = attempt === 4 ? 0 : 0.5;
      control.x = middle.x + (control.x - middle.x) * shrink;
      control.y = middle.y + (control.y - middle.y) * shrink;
    }
    threads.push({
      a,
      b,
      length,
      kind,
      control,
      weight: (kind === "support" ? 0.95 : 0.46) * (0.85 + random() * 0.3),
      opacity: (kind === "support" ? 0.66 : 0.4) + random() * 0.22,
      sheen: random(),
    });
  };
  // 设置项保持 100% 的默认读数，内部按原密度的 60% 生成网丝。
  const silkDensity = density * 0.6;
  const spokes = Math.round(10 + silkDensity * 0.06);
  const rings = Math.round(3 + silkDensity * 0.035);
  for (const hub of candidates) {
    if (
      hubs.some(
        (other) =>
          Math.hypot(hub.x - other.x, hub.y - other.y) <
          Math.min(0.18, Math.max(0.025, other.radius * 3.2)),
      )
    )
      continue;
    const rotation = random() * Math.PI * 2;
    const hubRings = Math.min(
      rings,
      Math.max(2, Math.round(hub.radius * grid)),
    );
    const rays: number[][] = [];
    for (let spoke = 0; spoke < spokes; spoke++) {
      const angle =
        rotation + ((spoke + (random() - 0.5) * 0.25) * Math.PI * 2) / spokes;
      const dx = Math.cos(angle),
        dy = Math.sin(angle);
      const limit = Math.min(0.21, Math.max(0.018, hub.radius * 3.2));
      let length = 0;
      const step = 0.5 / grid;
      while (
        length + step < limit &&
        inside(hub.x + dx * (length + step), hub.y + dy * (length + step))
      )
        length += step;
      const boundary = length + step < limit;
      length *= 0.94;
      const ray: number[] = [];
      const phase = random() * Math.PI * 2;
      const inner = Math.min(
        0.5,
        Math.max(0.09, 0.0025 / Math.max(length, 0.0001)),
      );
      for (let ring = 0; ring <= hubRings; ring++) {
        const t = ring / hubRings;
        // 网心保留小孔，避免多条粗支撑丝重叠成黑点；网眼间距有缓慢起伏。
        const r =
          length *
          (inner +
            (1 - inner) * Math.pow(t, 0.9) +
            Math.sin(phase + t * 4) * t * (1 - t) * 0.04);
        const id = addNode(
          hub.x + dx * r,
          hub.y + dy * r,
          boundary && ring === hubRings,
        );
        if (ring > 0) connect(ray[ring - 1], id, "support", hub);
        ray.push(id);
      }
      rays.push(ray);
    }
    for (let spoke = 0; spoke < spokes; spoke++)
      for (let ring = 0; ring <= hubRings; ring++) {
        if (ring > 0 && ring < hubRings && random() < 0.035) continue;
        connect(
          rays[spoke][ring],
          rays[(spoke + 1) % spokes][ring],
          "capture",
          hub,
        );
      }
    hubs.push(hub);
    // 限制单字网格规模，造句中多个实例也能保持稳定开销。
    if (hubs.length >= 80) break;
  }
  return { nodes, threads };
}

// 视觉网丝只绘制一次，独立的低分辨率弹性膜负责整片蛛网的形变。
export const spiderWebGridSize = 32;
const side = spiderWebGridSize + 1;
const vertexCount = side * side;

export function createSpiderWeb(pixels: Uint8ClampedArray, size: number) {
  const rest = new Float32Array(vertexCount * 2);
  const positions = new Float32Array(rest.length);
  const displacement = new Float32Array(rest.length);
  const velocity = new Float32Array(rest.length);
  const acceleration = new Float32Array(rest.length);
  const restoring = new Float32Array(vertexCount);
  const indices = new Uint32Array(spiderWebGridSize * spiderWebGridSize * 6);
  const inside = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= 1 || y >= 1) return false;
    return (
      pixels[(Math.floor(y * size) * size + Math.floor(x * size)) * 4 + 3] > 100
    );
  };
  let triangle = 0;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = y * side + x;
      const px = x / spiderWebGridSize,
        py = y / spiderWebGridSize;
      rest[i * 2] = px;
      rest[i * 2 + 1] = py;
      let coverage = 0;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++)
          if (inside(px + ox / spiderWebGridSize, py + oy / spiderWebGridSize))
            coverage++;
      // 边缘和空白区域只有更强的回位弹簧，所有顶点都允许移动。
      restoring[i] = coverage === 9 ? 1 : coverage > 0 ? 4 : 6;
      if (x < spiderWebGridSize && y < spiderWebGridSize) {
        indices.set(
          [i, i + 1, i + side, i + 1, i + side + 1, i + side],
          triangle,
        );
        triangle += 6;
      }
    }
  }
  positions.set(rest);
  let grab: {
    origin: Point;
    target: Point;
    center: Point;
    start: Float32Array;
    weights: Float32Array;
    propagation: number;
  } | null = null;
  let moving = false,
    accumulator = 0,
    quietTime = 0;
  const reset = () => {
    positions.set(rest);
    displacement.fill(0);
    velocity.fill(0);
    grab = null;
    moving = false;
    accumulator = quietTime = 0;
  };
  const setWeights = (propagation: number) => {
    if (!grab) return;
    const radius = 0.045 + propagation * 0.8 * 0.0016;
    for (let i = 0; i < vertexCount; i++) {
      const dx = rest[i * 2] - grab.center.x,
        dy = rest[i * 2 + 1] - grab.center.y;
      grab.weights[i] = Math.exp(-(dx * dx + dy * dy) / (2 * radius * radius));
    }
    grab.propagation = propagation;
    moving = true;
    quietTime = 0;
  };
  return {
    positions,
    rest,
    indices,
    restoring,
    get active() {
      return moving;
    },
    reset,
    grab(point: Point, propagation = 100) {
      const center = spiderWebLocalPoint(positions, point);
      if (!center || !inside(center.x, center.y)) return false;
      grab = {
        origin: point,
        target: point,
        center,
        start: Float32Array.from(displacement),
        weights: new Float32Array(vertexCount),
        propagation,
      };
      setWeights(propagation);
      return true;
    },
    move(point: Point) {
      if (!grab || (grab.target.x === point.x && grab.target.y === point.y))
        return;
      grab.target = point;
      moving = true;
      quietTime = 0;
    },
    release() {
      if (!grab) return;
      grab = null;
      moving = true;
      quietTime = 0;
    },
    update(delta: number, elasticity: number, propagation = 100) {
      if (grab && grab.propagation !== propagation) setWeights(propagation);
      if (!moving || delta <= 0) return false;
      accumulator += Math.min(delta, 0.05);
      const dt = 1 / 120;
      const elastic = elasticity / 100;
      const spring = 85 / (1 + elastic * 2.8);
      const damping = Math.exp((-6.5 / (1 + elastic * 0.8)) * dt);
      const tension = 70 + propagation * 0.8 * 3.5;
      let dx = grab ? grab.target.x - grab.origin.x : 0;
      let dy = grab ? grab.target.y - grab.origin.y : 0;
      const scale = Math.min(
        1,
        (0.09 + elastic * 0.2) / Math.max(0.0001, Math.hypot(dx, dy)),
      );
      dx *= scale;
      dy *= scale;
      let changed = false;
      while (accumulator + 1e-9 >= dt) {
        accumulator = Math.max(0, accumulator - dt);
        // 只在规则网格上按相邻位移传递张力，开销与网丝密度无关。
        for (let y = 0; y < side; y++) {
          for (let x = 0; x < side; x++) {
            const i = y * side + x,
              j = i * 2;
            for (let axis = 0; axis < 2; axis++) {
              const k = j + axis,
                d = displacement[k];
              let force = 0;
              if (x > 0) force += displacement[k - 2] - d;
              if (x < spiderWebGridSize) force += displacement[k + 2] - d;
              if (y > 0) force += displacement[k - side * 2] - d;
              if (y < spiderWebGridSize)
                force += displacement[k + side * 2] - d;
              acceleration[k] = force * tension - d * spring * restoring[i];
              if (grab) {
                const weight = grab.weights[i];
                acceleration[k] +=
                  (grab.start[k] + (axis ? dy : dx) * weight - d) *
                  700 *
                  weight;
              }
            }
          }
        }
        let maxVelocity = 0,
          maxDisplacement = 0;
        for (let i = 0; i < rest.length; i++) {
          velocity[i] = (velocity[i] + acceleration[i] * dt) * damping;
          displacement[i] += velocity[i] * dt;
          positions[i] = rest[i] + displacement[i];
          maxVelocity = Math.max(maxVelocity, Math.abs(velocity[i]));
          maxDisplacement = Math.max(
            maxDisplacement,
            Math.abs(displacement[i]),
          );
        }
        changed = true;
        if (grab) {
          quietTime = maxVelocity < 0.0008 ? quietTime + dt : 0;
          if (quietTime > 0.2) moving = false;
        } else if (maxDisplacement < 0.00008 && maxVelocity < 0.001) reset();
        if (!moving) {
          accumulator = 0;
          break;
        }
      }
      return changed;
    },
  };
}

// 对形变后的三角网格求逆，拖出原轮廓的边缘也能再次抓取。
export function spiderWebLocalPoint(
  positions: Float32Array,
  point: Point,
): Point | null {
  const trianglePoint = (a: number, b: number, c: number) => {
    const ax = positions[a * 2],
      ay = positions[a * 2 + 1];
    const bx = positions[b * 2] - ax,
      by = positions[b * 2 + 1] - ay;
    const cx = positions[c * 2] - ax,
      cy = positions[c * 2 + 1] - ay;
    const px = point.x - ax,
      py = point.y - ay;
    const determinant = bx * cy - by * cx;
    if (Math.abs(determinant) < 1e-10) return null;
    const u = (px * cy - py * cx) / determinant,
      v = (bx * py - by * px) / determinant;
    if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) return null;
    return {
      x:
        ((a % side) * (1 - u - v) + (b % side) * u + (c % side) * v) /
        spiderWebGridSize,
      y:
        (Math.floor(a / side) * (1 - u - v) +
          Math.floor(b / side) * u +
          Math.floor(c / side) * v) /
        spiderWebGridSize,
    };
  };
  for (let y = 0; y < spiderWebGridSize; y++)
    for (let x = 0; x < spiderWebGridSize; x++) {
      const i = y * side + x;
      const hit =
        trianglePoint(i, i + 1, i + side) ??
        trianglePoint(i + 1, i + side + 1, i + side);
      if (hit) return hit;
    }
  return null;
}

export function drawSpiderWeb(
  context: CanvasRenderingContext2D,
  geometry: SpiderWebGeometry,
  settings: SpiderWebSettings,
) {
  const size = context.canvas.width;
  context.clearRect(0, 0, size, size);
  context.lineCap = "round";
  const width = 0.0026 * (settings.thickness / 100) * size;
  const batches: WebThread[][] = Array.from({ length: 18 }, () => []);
  for (const thread of geometry.threads) {
    const weight = Math.min(5, Math.floor(thread.weight * 3));
    const opacity = Math.max(
      0,
      Math.min(2, Math.floor((thread.opacity - 0.3) * 5)),
    );
    batches[weight * 3 + opacity].push(thread);
  }
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (!batch.length) continue;
    context.beginPath();
    for (const thread of batch) {
      const a = geometry.nodes[thread.a],
        b = geometry.nodes[thread.b];
      const ax = a.x * size,
        ay = a.y * size,
        bx = b.x * size,
        by = b.y * size;
      context.moveTo(ax, ay);
      context.quadraticCurveTo(
        thread.control.x * size,
        thread.control.y * size,
        bx,
        by,
      );
    }
    const opacity = 0.42 + (i % 3) * 0.21;
    const weight = (Math.floor(i / 3) + 0.5) / 3;
    // 同类网丝合并绘制；细暗边保留浅色丝线的体积感。
    context.globalAlpha = opacity * 0.12;
    context.strokeStyle = "#263139";
    context.lineWidth = width * weight + size * 0.00065;
    context.stroke();
    context.globalAlpha = opacity;
    context.strokeStyle = settings.color;
    context.lineWidth = width * weight;
    context.stroke();
  }
  // 沿丝线添加短而连续的反光细芯，保留所选颜色，不生成发光或散落噪点。
  const color = [1, 3, 5].map((offset) =>
    parseInt(settings.color.slice(offset, offset + 2), 16),
  );
  context.strokeStyle = `rgb(${color.map((channel) => Math.round(channel + (255 - channel) * 0.55)).join(" ")})`;
  context.lineWidth = Math.max(size * 0.00045, width * 0.2);
  context.globalAlpha = 0.32;
  context.beginPath();
  for (const thread of geometry.threads) {
    if (thread.sheen < 0.68 || thread.length * size < 8) continue;
    const a = geometry.nodes[thread.a],
      b = geometry.nodes[thread.b],
      c = thread.control;
    const from = 0.18 + thread.sheen * 0.18,
      to = from + 0.3;
    const point = (t: number) => ({
      x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
      y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
    });
    const start = point(from),
      end = point(to);
    context.moveTo(start.x * size, start.y * size);
    context.quadraticCurveTo(
      (start.x +
        (to - from) * ((1 - from) * (c.x - a.x) + from * (b.x - c.x))) *
        size,
      (start.y +
        (to - from) * ((1 - from) * (c.y - a.y) + from * (b.y - c.y))) *
        size,
      end.x * size,
      end.y * size,
    );
  }
  context.stroke();
  context.globalAlpha = 1;
}
