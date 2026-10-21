import { defaultInkSettings } from "../../core/glyphEffects";
import type { InkSettings } from "../../core/glyphEffects";

export const inkFieldSize = 192;
export const inkPointerRadius = 0.0475;
const stepTime = 1 / 80;
const inkDecay = 2.8;
// 收紧供墨与消散之间的扩散长度，让轮廓自然清晰，仍只渲染流动的墨量。
const inkDiffusion = 0.000032;

function sample(field: Float32Array, size: number, x: number, y: number) {
  if (x < 0 || y < 0 || x > size - 1 || y > size - 1) return 0;
  const left = Math.floor(x),
    top = Math.floor(y);
  const right = Math.min(size - 1, left + 1),
    bottom = Math.min(size - 1, top + 1);
  const fx = x - left,
    fy = y - top;
  return (
    (field[top * size + left] * (1 - fx) + field[top * size + right] * fx) *
      (1 - fy) +
    (field[bottom * size + left] * (1 - fx) +
      field[bottom * size + right] * fx) *
      fy
  );
}

// 字形只定义墨源；稳态也由供墨、真实扩散与统一消散求出，不把遮罩画进墨量。
export function createInkFlow(mask: Float32Array, size = inkFieldSize) {
  const count = size * size;
  const source = Float32Array.from(mask);
  const rest = new Float32Array(count);
  const scratch = new Float32Array(count);
  let diffusionRange = defaultInkSettings.diffusionRange;
  let diffusionRate = inkDiffusion * (size - 1) ** 2;
  const rebuildRest = () => {
    rest.fill(0);
    const equilibriumDiffusion = diffusionRate / inkDecay;
    for (let iteration = 0; iteration < 220; iteration++) {
      let change = 0;
      for (let y = 1; y < size - 1; y++)
        for (let x = 1; x < size - 1; x++) {
          const i = y * size + x;
          scratch[i] =
            (source[i] +
              equilibriumDiffusion *
                (rest[i - 1] + rest[i + 1] + rest[i - size] + rest[i + size])) /
            (1 + 4 * equilibriumDiffusion);
          change = Math.max(change, Math.abs(scratch[i] - rest[i]));
        }
      rest.set(scratch);
      if (change < 1e-6) break;
    }
  };
  rebuildRest();
  const density = Float32Array.from(rest);
  let vx = new Float32Array(count),
    vy = new Float32Array(count);
  let nextX = new Float32Array(count),
    nextY = new Float32Array(count);
  let pressure = new Float32Array(count),
    nextPressure = new Float32Array(count);
  const divergence = new Float32Array(count);
  const advected = new Float32Array(count);
  const pixels = new Uint8ClampedArray(count * 4);
  let previous: readonly number[] | null = null;
  let accumulated = 0;
  let active = 0;
  const writePixels = () => {
    for (let i = 0; i < count; i++) {
      // 纹理只携带墨量；不再传输字形、稳态底色或任何鼠标颜色。
      pixels[i * 4] =
        pixels[i * 4 + 1] =
        pixels[i * 4 + 2] =
          Math.round(density[i] * 255);
      pixels[i * 4 + 3] = 255;
    }
  };
  writePixels();
  const reset = () => {
    density.set(rest);
    for (const field of [vx, vy, nextX, nextY, pressure, nextPressure])
      field.fill(0);
    previous = null;
    accumulated = active = 0;
    writePixels();
  };
  return {
    density,
    rest,
    pixels,
    reset,
    update(pointer: readonly number[], delta: number, settings: InkSettings) {
      const range =
        settings.diffusionRange ?? defaultInkSettings.diffusionRange;
      const changedRange = range !== diffusionRange;
      if (changedRange) {
        diffusionRange = range;
        // 扩散长度与系数平方根成正比；调整范围时同步静态平衡和动态扩散。
        diffusionRate = inkDiffusion * (size - 1) ** 2 * (range / 100) ** 2;
        rebuildRest();
        // 静止预览立即响应滑块；正在流动的墨水继续平流，不被稳态覆盖。
        if (!active) {
          density.set(rest);
          writePixels();
        }
      }
      const dt = Math.min(0.1, Math.max(0, delta));
      const speedScale = (settings.speed * 0.8) / 60;
      const pointerRadius =
        inkPointerRadius *
        ((settings.stirSize ?? defaultInkSettings.stirSize) / 100);
      const present = pointer[0] > -2 && pointer[1] > -2;
      const start = previous ?? pointer;
      const nearby =
        Math.max(start[0], pointer[0]) >= -pointerRadius &&
        Math.min(start[0], pointer[0]) <= 1 + pointerRadius &&
        Math.max(start[1], pointer[1]) >= -pointerRadius &&
        Math.min(start[1], pointer[1]) <= 1 + pointerRadius;
      const moving =
        present &&
        nearby &&
        settings.disturbance > 0 &&
        Math.hypot(pointer[2], pointer[3]) > 0.015;
      if (moving) active = 7;
      if (!active || dt === 0) {
        previous = present ? [...pointer] : null;
        return changedRange;
      }
      active = Math.max(0, active - dt * speedScale);
      if (!active) {
        reset();
        return true;
      }
      accumulated += dt;
      const steps = Math.floor((accumulated + 1e-9) / stepTime);
      accumulated -= steps * stepTime;
      const h = stepTime * speedScale;
      const drag = Math.exp(-h * 3);
      const fade = Math.exp(-h * inkDecay);
      const emission = 1 - fade;
      const diffusion = (emission * diffusionRate) / inkDecay;
      const radiusCells = pointerRadius * (size - 1);
      const force = settings.disturbance / 100;
      for (let step = 0; step < steps; step++) {
        const blend = (step + 1) / Math.max(1, steps);
        const px = (start[0] + (pointer[0] - start[0]) * blend) * (size - 1);
        const py = (start[1] + (pointer[1] - start[1]) * blend) * (size - 1);
        for (let y = 1; y < size - 1; y++)
          for (let x = 1; x < size - 1; x++) {
            const i = y * size + x;
            const bx = x - vx[i] * h * (size - 1),
              by = y - vy[i] * h * (size - 1);
            let u = sample(vx, size, bx, by) * drag;
            let v = sample(vy, size, bx, by) * drag;
            if (moving) {
              const dx = (x - px) / radiusCells,
                dy = (y - py) / radiusCells;
              const falloff = Math.max(0, 1 - dx * dx - dy * dy);
              const stream = pointer[2] * dy - pointer[3] * dx;
              // 紧支撑流函数的旋度产生往返水流，鼠标只注入动量。
              u +=
                (pointer[2] * falloff - 6 * dy * stream) *
                falloff *
                falloff *
                force *
                h *
                24;
              v +=
                (pointer[3] * falloff + 6 * dx * stream) *
                falloff *
                falloff *
                force *
                h *
                24;
            }
            nextX[i] = u;
            nextY[i] = v;
          }
        [vx, nextX] = [nextX, vx];
        [vy, nextY] = [nextY, vy];
        // 压力投影让清水以近似不可压缩水流进入笔画，避免凭空挤出或抹掉墨色。
        pressure.fill(0);
        nextPressure.fill(0);
        for (let y = 1; y < size - 1; y++)
          for (let x = 1; x < size - 1; x++) {
            const i = y * size + x;
            divergence[i] =
              (vx[i + 1] - vx[i - 1] + vy[i + size] - vy[i - size]) * 0.5;
          }
        for (let iteration = 0; iteration < 10; iteration++) {
          for (let y = 1; y < size - 1; y++)
            for (let x = 1; x < size - 1; x++) {
              const i = y * size + x;
              nextPressure[i] =
                (pressure[i - 1] +
                  pressure[i + 1] +
                  pressure[i - size] +
                  pressure[i + size] -
                  divergence[i]) *
                0.25;
            }
          [pressure, nextPressure] = [nextPressure, pressure];
        }
        for (let y = 1; y < size - 1; y++)
          for (let x = 1; x < size - 1; x++) {
            const i = y * size + x;
            vx[i] -= (pressure[i + 1] - pressure[i - 1]) * 0.5;
            vy[i] -= (pressure[i + size] - pressure[i - size]) * 0.5;
            advected[i] = sample(
              density,
              size,
              x - vx[i] * h * (size - 1),
              y - vy[i] * h * (size - 1),
            );
          }
        for (let y = 1; y < size - 1; y++)
          for (let x = 1; x < size - 1; x++) {
            const i = y * size + x;
            const laplacian =
              advected[i - 1] +
              advected[i + 1] +
              advected[i - size] +
              advected[i + size] -
              4 * advected[i];
            // 全域统一消散，仅字形墨源供墨；没有与光标距离相关的染色或稀释项。
            density[i] = Math.max(
              0,
              Math.min(
                1,
                advected[i] * fade +
                  source[i] * emission +
                  laplacian * diffusion,
              ),
            );
          }
      }
      previous = present ? [...pointer] : null;
      if (steps > 0) writePixels();
      return changedRange || steps > 0;
    },
  };
}

export const inkUniforms = `
uniform sampler2D uInk;
`;

export const inkFragment = `
    // 唯一可见量是流动墨水的浓度；字形遮罩不参与最终颜色或透明度。
    float density = texture(uInk, uv).r;
    float border = min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y));
    alpha = (1.0 - exp(-density * (1.2 + uIntensity * 2.1) * 1.5))
          * smoothstep(0.0, 0.025, border);
    color = vec3(0.0);
`;
