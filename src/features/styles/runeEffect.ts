import type { Point } from "../../core/model";
import type { EffectBounds } from "./effectInteraction";

export const runePerspective = 1.5;
export const runeRippleCount = 4;
export const runeRippleDuration = 1.2;
export type RuneRipple = { origin: Point; started: number };

export const runeMaterials = {
  light: { id: 0, cold: null, hot: "#f4fbff", glow: 1, glowGain: 1 / 70 },
  jade: {
    id: 1,
    cold: "#294d3b",
    hot: "#eff0cd",
    glow: 0.25,
    glowGain: 1 / 220,
  },
  ice: {
    id: 2,
    cold: "#27658f",
    hot: "#ecfdff",
    glow: 0.35,
    glowGain: 1 / 180,
  },
  gold: {
    id: 3,
    cold: "#59320e",
    hot: "#fff2bd",
    glow: 0.18,
    glowGain: 1 / 240,
  },
} as const;

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
uniform float uMaterial;
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

export const runeSurface = `
// 固定晶胞的最近、次近距离形成裂隙，不随时间游动。
vec3 iceCell(vec2 p) {
  vec2 cell = floor(p), local = fract(p);
  float first = 10.0, second = 10.0, facet = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 id = cell + neighbor;
      vec2 center = neighbor + 0.03 + 0.94 * vec2(hash(id), hash(id + vec2(37.2, 19.1)));
      vec2 offset = center - local;
      float d = dot(offset, offset);
      if (d < first) {
        second = first;
        first = d;
        facet = hash(id + vec2(11.7, 43.6));
      } else second = min(second, d);
    }
  }
  return vec3(sqrt(second) - sqrt(first), facet, sqrt(first));
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
    if (uMaterial > 0.5) {
      vec2 bevel = vec2(0.008, 0.0);
      vec2 gradient = vec2(mask(uv + bevel.xy) - mask(uv - bevel.xy), mask(uv + bevel.yx) - mask(uv - bevel.yx));
      vec3 normal = normalize(vec3(-gradient * 0.8, 0.45));
      float rim = clamp(length(gradient), 0.0, 1.0);
      float lighting = dot(normal, normalize(vec3(-0.45, -0.6, 1.0)));
      if (uMaterial < 1.5) {
        // 云絮和沁色固定在玉体上，只有柔和透光随流光移动。
        float cloud = fbm(uv * 9.0 + vec2(uSeed));
        float grain = fbm(uv * 38.0 + vec2(cloud * 3.0));
        float inclusions = smoothstep(0.44, 0.76, cloud + grain * 0.23);
        float milk = smoothstep(0.36, 0.77, cloud * 0.7 + grain * 0.4);
        vec2 bevel = vec2(0.0035, 0.0);
        float edgeLight = mask(uv + bevel.xy + bevel.yx) - mask(uv - bevel.xy - bevel.yx);
        vec3 jade = mix(uCold, uWarm, 0.45 + cloud * 0.5);
        jade = mix(jade, uCold * 0.72, inclusions * 0.42);
        jade = mix(jade, uHot, milk * 0.46);
        jade += uHot * (max(0.0, edgeLight) * 0.18 + sweep * (0.06 + uIntensity * 0.12));
        color = jade * (0.96 + 0.04 * pulse) - max(0.0, -edgeLight) * uCold * 0.18;
        alpha = core * 0.97;
      } else if (uMaterial < 2.5) {
        // 蓝色深层、不同折射的晶面、两级裂隙与少量霜花构成冰体。
        vec2 crystalUv = uv * 7.0 + vec2(uSeed);
        crystalUv += (vec2(noise(uv * 5.0 + vec2(uSeed, 7.1)), noise(uv * 6.0 + vec2(19.3, uSeed))) - 0.5) * 1.2;
        vec3 crystal = iceCell(crystalUv);
        float fineCrack = 1.0 - smoothstep(0.008, 0.038, iceCell(uv * 17.0 + vec2(17.4)).x);
        float crack = 1.0 - smoothstep(0.012, 0.065, crystal.x);
        crack *= smoothstep(0.38, 0.68, fbm(uv * 13.0 + vec2(uSeed, 9.3)));
        fineCrack *= smoothstep(0.48, 0.72, noise(uv * 7.0 + vec2(23.1, uSeed)));
        float frost = smoothstep(0.56, 0.8, fbm(uv * 55.0 + vec2(uSeed)));
        float depth = fbm(uv * 8.0 + vec2(5.7, uSeed));
        float refraction = 0.5 + 0.5 * sin(dot(uv, vec2(24.0, 17.0)) + crystal.y * 3.0 + dot(uTilt, vec2(7.0, -5.0)));
        vec3 ice = mix(uCold, uWarm, 0.56 + crystal.y * 0.12);
        ice = mix(ice, uHot, 0.16 + depth * 0.18 + pow(refraction, 5.0) * 0.28);
        ice *= 0.78 + lighting * 0.22;
        ice = mix(ice, uHot, clamp(crack * 0.62 + fineCrack * 0.07 + frost * 0.3 + rim * 0.38, 0.0, 0.85));
        color = ice + uHot * sweep * (0.05 + uIntensity * 0.12);
        alpha = core * (0.84 + depth * 0.12 + rim * 0.05);
      } else {
        // 深金暗部与窄亮反射带交替，细拉丝固定在表面，高光随透视移动。
        float grain = noise(uv * vec2(360.0, 24.0) + vec2(uSeed));
        float brushed = noise(uv * vec2(580.0, 45.0));
        float reflectionUv = dot(uv, vec2(0.65, 0.95)) + dot(uTilt, vec2(0.8, -0.6));
        float reflection = 0.5 + 0.5 * sin(reflectionUv * 19.0 + grain * 0.12 + sin(t * 0.35) * 0.18);
        vec3 metal = mix(uCold, uWarm, smoothstep(0.06, 0.68, reflection));
        metal = mix(metal, uHot, smoothstep(0.74, 0.97, reflection) * 0.9);
        metal *= 0.68 + lighting * 0.32;
        metal += uWarm * (brushed - 0.5) * 0.07;
        metal = mix(metal, uHot, max(0.0, lighting - 0.72) * rim * 1.5);
        color = metal + uHot * sweep * (0.025 + uIntensity * 0.07);
        alpha = core * 0.99;
      }
    }
    float halo = 0.0;
    for (int i = 0; i < ${runeRippleCount}; i++) {
      vec4 ripple = uRipples[i];
      float ring = (distance(uv, ripple.xy) - ripple.z) / uHaloWidth;
      // 保留中心亮带，叠加低亮度的宽高斯尾部，避免削顶后的生硬白边。
      halo += (0.76 * exp(-1.2 * ring * ring) + 0.24 * exp(-0.24 * ring * ring)) * ripple.w;
    }
    halo = 1.0 - exp(-halo * 1.6);
    vec3 baseColor = color * alpha;
    float baseAlpha = alpha;
    color = mix(color, uHot * 1.08, halo);
    alpha = mix(alpha, core, halo);
    // 点击的柔光穿过轮廓少量散开，透明区域不绘制独立圆环。
    vec2 blur = vec2(0.004, 0.0);
    float softInk = (mask(uv + blur.xy) + mask(uv - blur.xy) + mask(uv + blur.yx) + mask(uv - blur.yx)) * 0.25;
    float bloom = softInk * halo * (1.0 - core) * 0.2;
    // 对完整光晕贡献统一乘半，保持亮带宽度、晕染和原材质透明度。
    finalColor = vec4(mix(baseColor, color * alpha, 0.5) + uHot * bloom * 0.5, mix(baseAlpha, alpha, 0.5) + bloom * 0.5);
    return;
`;
