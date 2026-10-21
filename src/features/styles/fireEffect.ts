import { flameFieldReach, flameFieldScale } from "./flameField";

export const firePointerRadius = 0.5;

// 以时间而非帧数平滑风速，让起步、急停与反向都逐渐过渡。
export function smoothFireWind(
  wind: number[],
  x: number,
  y: number,
  delta: number,
) {
  const blend = 1 - Math.exp(-Math.max(0, delta) / 0.22);
  wind[0] += (x - wind[0]) * blend;
  wind[1] += (y - wind[1]) * blend;
}

export const fireUniforms = `
uniform float uDisturbance;
uniform vec4 uPointer;
`;

export const fireSampling = `
vec2 flameField(vec2 uv) {
  vec2 p = (uv - 0.5) * ${flameFieldScale} + 0.5;
  if (min(p.x, p.y) < 0.0 || max(p.x, p.y) > 1.0) return vec2(1.0, 0.0);
  return texture(uFlame, p).rg;
}
`;

export const fireFragment = `
    vec2 flow = effectUv * vec2(13.0, 9.0) + vec2(0.0, t * 1.5);
    float broad = noise(flow * 0.55 + vec2(uSeed, 0.0));
    float curl = noise(flow + vec2(broad * 2.5, 0.0)) - 0.5;
    float fine = noise(flow * vec2(3.4, 2.5) + vec2(t * 0.3, t));
    float reach = 0.045 + uIntensity * 0.135;
    vec2 field = flameField(effectUv);
    float height = field.r * ${flameFieldReach} / reach;
    // 连续供燃场经一次卷曲重采样生成火舌，焰根不位移，越靠焰尖扰动越大。
    float bend = smoothstep(0.0, 0.7, height);
    vec2 warped = effectUv + vec2(curl * 0.045 * bend, (broad - 0.5) * 0.018 * bend);
    // 半倍渲染宽度内平方衰减，边界处平滑归零，焰根和字形不动。
    float falloff = max(0.0, 1.0 - distance(vUv, uPointer.xy) / ${firePointerRadius.toFixed(1)});
    float influence = falloff * falloff;
    vec2 wind = vec2(dot(uPointer.zw, across), dot(uPointer.zw, down));
    warped -= wind * (0.055 * uDisturbance * influence * bend);
    field = flameField(warped);
    height = field.r * ${flameFieldReach} / reach;
    float tongues = 0.5 + 0.5 * sin(warped.x * 115.0 + curl * 5.0);
    float lengthScale = 0.32 + tongues * 0.48 + broad * 0.2;
    float tip = height / lengthScale;
    float breakup = smoothstep(0.1, 0.55, fine + (1.0 - tip) * 0.65);
    float flame = field.g * (1.0 - smoothstep(0.08, 1.0, tip)) * breakup;
    float root = field.g * (1.0 - smoothstep(0.0, 0.2, height));
    float heat = clamp(0.85 - tip * 0.7 + broad * 0.12 + root * 0.15, 0.0, 1.0);
    vec3 flameColor = mix(uCold, uWarm, smoothstep(0.08, 0.6, heat));
    flameColor = mix(flameColor, uHot, smoothstep(0.65, 1.0, heat));
    // 字形只绘制一次；较暗的炽热本体与明亮焰根、透明焰尖分别着色。
    vec3 bodyColor = mix(uCold, uWarm, 0.25 + broad * 0.3);
    bodyColor = mix(bodyColor, uHot, fine * fine * 0.22);
    alpha = core + flame * (1.0 - core);
    vec3 premultiplied = bodyColor * core + flameColor * flame * (1.0 - core);
    // 火星使用浅高温色，亮度独立于低透明度的焰尖。
    vec2 sparkGrid = vec2(65.0, 43.0);
    vec2 sparkUv = effectUv * sparkGrid + vec2(sin(t * 0.7) * 0.3, t * 2.8);
    vec2 cell = floor(sparkUv);
    float spark = 1.0 - smoothstep(0.025, 0.19, length(fract(sparkUv) - 0.5));
    spark *= step(0.965, hash(cell)) * field.g;
    spark *= smoothstep(0.06, 0.2, height) * (1.0 - smoothstep(0.7, 1.3, height));
    spark *= (0.72 + uIntensity * 0.28) * (1.0 - core);
    vec3 sparkColor = mix(uHot, vec3(1.0), 0.48);
    premultiplied = sparkColor * spark + premultiplied * (1.0 - spark);
    alpha = spark + alpha * (1.0 - spark);
    finalColor = vec4(premultiplied, alpha);
    return;
`;
