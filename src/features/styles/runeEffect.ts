import type { Point } from "../../core/model";
import type { EffectBounds } from "./effectInteraction";

export const runePerspective = 1.5;
export const runeRippleCount = 4;
export const runeRippleDuration = 1.2;
export type RuneRipple = { origin: Point; started: number };

export function runePointerTilt(pointer: readonly number[]) {
  const [x, y] = pointer;
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  const proximity = Math.max(
    0,
    1 - Math.hypot(Math.max(0, -x, x - 1), Math.max(0, -y, y - 1)),
  );
  return [
    -clamp((y - 0.5) * 2) * 0.12 * proximity,
    clamp((x - 0.5) * 2) * 0.12 * proximity,
  ];
}

// 与着色器使用同一透视逆变换，点击始终命中倾斜后的可见笔画。
export function runeLocalPoint(point: Point, tilt: readonly number[]): Point {
  const sx = Math.sin(tilt[0]),
    cx = Math.cos(tilt[0]);
  const sy = Math.sin(tilt[1]),
    cy = Math.cos(tilt[1]);
  const x = point.x - 0.5,
    y = point.y - 0.5;
  const nz = cy * cx;
  const scale =
    (runePerspective * nz) / (runePerspective * nz - sy * cx * x + sx * y);
  const z = runePerspective * (1 - scale);
  return {
    x: cy * x * scale - sy * z + 0.5,
    y: sy * sx * x * scale + cx * y * scale + cy * sx * z + 0.5,
  };
}

export function hitRune(
  point: Point,
  bounds: EffectBounds,
  tilt: readonly number[],
  pixels: Uint8ClampedArray,
  maskSize: number,
) {
  if (bounds.size <= 0) return null;
  const local = runeLocalPoint(
    {
      x: (point.x - bounds.x) / bounds.size,
      y: (point.y - bounds.y) / bounds.size,
    },
    tilt,
  );
  if (local.x < 0 || local.y < 0 || local.x >= 1 || local.y >= 1) return null;
  const index =
    (Math.floor(local.y * maskSize) * maskSize +
      Math.floor(local.x * maskSize)) *
    4;
  return pixels[index + 3] > 30 ? local : null;
}

export function writeRuneRipples(
  output: Float32Array,
  ripples: readonly RuneRipple[],
  time: number,
) {
  output.fill(0);
  for (let i = 0; i < Math.min(runeRippleCount, ripples.length); i++) {
    const { origin, started } = ripples[i];
    const progress = (time - started) / runeRippleDuration;
    if (progress < 0 || progress >= 1) continue;
    const reach = Math.hypot(
      Math.max(origin.x, 1 - origin.x),
      Math.max(origin.y, 1 - origin.y),
    );
    output.set(
      [
        origin.x,
        origin.y,
        reach * progress * 1.15,
        Math.min(1, (1 - progress) * 4),
      ],
      i * 4,
    );
  }
}

export const runeUniforms = `
uniform float uHaloWidth;
uniform vec2 uTilt;
uniform vec4 uRipples[${runeRippleCount}];
`;

export const runeProjection = `
vec2 runeUv(vec2 uv) {
  float sx = sin(uTilt.x), cx = cos(uTilt.x);
  float sy = sin(uTilt.y), cy = cos(uTilt.y);
  vec2 p = uv - 0.5;
  float nz = cy * cx;
  float scale = (${runePerspective} * nz) / (${runePerspective} * nz - sy * cx * p.x + sx * p.y);
  vec3 hit = vec3(p * scale, ${runePerspective} * (1.0 - scale));
  return vec2(dot(hit, vec3(cy, 0.0, -sy)), dot(hit, vec3(sy * sx, cx, cy * sx))) + 0.5;
}
`;

export const runeFragment = `
    effectUv = vec2(dot(uv, across), dot(uv, down));
    float pulse = 0.83 + 0.17 * sin(t * 1.7);
    float veins = fbm(effectUv * 26.0 + vec2(0, t * 0.35));
    float sweep = pow(0.5 + 0.5 * sin(-effectUv.y * 17.0 - t * 2.0), 16.0);
    float radiance = clamp(0.3 + veins * 0.35 + sweep * 0.6, 0.0, 1.0);
    color = mix(uWarm, uHot, radiance);
    alpha = core * pulse;
    color *= 0.8 + uIntensity * 0.4;
    float halo = 0.0;
    for (int i = 0; i < ${runeRippleCount}; i++) {
      vec4 ripple = uRipples[i];
      float ring = (distance(uv, ripple.xy) - ripple.z) / uHaloWidth;
      halo += exp(-ring * ring) * ripple.w;
    }
    halo = clamp(halo, 0.0, 1.0);
    color = mix(color, uHot * 1.65, halo);
    alpha = mix(alpha, core, halo);
`;
