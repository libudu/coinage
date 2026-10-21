import { flameFieldReach, flameFieldScale } from "./flameField";

export const firePointerRadius = 0.5;
export const fireGustCount = 12;
const gustInterval = 0.07;
const gustLifetime = fireGustCount * gustInterval;

type FireGust = { x: number; y: number; vx: number; vy: number; age: number };

// 沿移动路径注入气流团；离开指针后继续漂移、扩散、耗散，不把火舌拴在光标上。
export function createFireAirflow() {
  const gusts: FireGust[] = [];
  const sources = new Float32Array(fireGustCount * 4);
  const motion = new Float32Array(fireGustCount * 4);
  const wind = [0, 0];
  let previous: readonly number[] | null = null;
  let accumulated = 0;
  return {
    sources,
    motion,
    reset() {
      gusts.length = 0;
      sources.fill(0);
      motion.fill(0);
      wind.fill(0);
      previous = null;
      accumulated = 0;
    },
    update(pointer: readonly number[], delta: number) {
      const dt = Math.max(0, delta);
      for (const gust of gusts) gust.age += dt;
      const previousWind = [...wind];
      smoothFireWind(wind, pointer[2], pointer[3], dt);
      const valid = pointer[0] > -2 && pointer[1] > -2;
      if (valid && previous && dt > 0) {
        for (
          let elapsed = gustInterval - accumulated;
          elapsed <= dt + 1e-9;
          elapsed += gustInterval
        ) {
          const blend = Math.min(1, elapsed / dt);
          const x = previous[0] + (pointer[0] - previous[0]) * blend;
          const y = previous[1] + (pointer[1] - previous[1]) * blend;
          if (
            x < -firePointerRadius ||
            x > 1 + firePointerRadius ||
            y < -firePointerRadius ||
            y > 1 + firePointerRadius
          )
            continue;
          const easing = 1 - Math.exp(-elapsed / 0.22);
          const vx = previousWind[0] + (pointer[2] - previousWind[0]) * easing;
          const vy = previousWind[1] + (pointer[3] - previousWind[1]) * easing;
          if (Math.hypot(vx, vy) < 0.01) continue;
          gusts.push({ x, y, vx, vy, age: Math.max(0, dt - elapsed) });
        }
        const total = accumulated + dt;
        accumulated = Math.max(
          0,
          total - Math.floor((total + 1e-9) / gustInterval) * gustInterval,
        );
      } else accumulated = 0;
      previous = valid ? [...pointer] : null;
      for (let i = gusts.length - 1; i >= 0; i--)
        if (gusts[i].age >= gustLifetime) gusts.splice(i, 1);
      if (gusts.length > fireGustCount)
        gusts.splice(0, gusts.length - fireGustCount);
      sources.fill(0);
      motion.fill(0);
      gusts.forEach((gust, i) => {
        const decay = Math.exp(-gust.age / 0.38);
        const travel = 0.09 * 0.38 * (1 - decay);
        const fade = Math.pow(1 - gust.age / gustLifetime, 2);
        const birth = Math.min(1, gust.age / 0.1);
        const strength = decay * fade * birth * birth * (3 - 2 * birth) * 0.4;
        sources.set(
          [
            gust.x + gust.vx * travel,
            gust.y + gust.vy * travel - gust.age * 0.025,
            0,
            0,
          ],
          i * 4,
        );
        motion.set(
          [
            gust.vx * strength,
            gust.vy * strength,
            Math.min(firePointerRadius, 0.16 + gust.age * 0.28),
            0,
          ],
          i * 4,
        );
      });
    },
  };
}

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
uniform vec4 uAirSources[${fireGustCount}];
uniform vec4 uAirMotion[${fireGustCount}];
`;

export const fireSampling = `
vec2 flameField(vec2 uv) {
  vec2 p = (uv - 0.5) * ${flameFieldScale} + 0.5;
  if (min(p.x, p.y) < 0.0 || max(p.x, p.y) > 1.0) return vec2(1.0, 0.0);
  return texture(uFlame, p).rg;
}
vec2 airflow(vec2 uv) {
  vec2 wind = vec2(0.0);
  for (int i = 0; i < ${fireGustCount}; i++) {
    vec2 offset = uv - uAirSources[i].xy;
    vec4 gust = uAirMotion[i];
    float radius = max(0.001, gust.z);
    float falloff = max(0.0, 1.0 - dot(offset, offset) / (radius * radius));
    // 连续的紧支撑核在边界处平滑归零，尾流两侧轻微卷动。
    float curl = (offset.x * gust.y - offset.y * gust.x) / radius;
    wind += (gust.xy + vec2(-offset.y, offset.x) * curl * 1.4) * falloff * falloff;
  }
  return wind / (1.0 + length(wind) * 0.35);
}
`;

export const fireFragment = `
    vec2 air = airflow(vUv) * uDisturbance * 3.0;
    vec2 wind = vec2(dot(air, across), dot(air, down));
    vec2 flow = (effectUv - wind * 0.025) * vec2(13.0, 9.0) + vec2(0.0, t * 1.5);
    float broad = noise(flow * 0.55 + vec2(uSeed, 0.0));
    float curl = noise(flow + vec2(broad * 2.5, 0.0)) - 0.5;
    float fine = noise(flow * vec2(3.4, 2.5) + vec2(t * 0.3, t));
    float reach = 0.045 + uIntensity * 0.135;
    vec2 field = flameField(effectUv);
    float height = field.r * ${flameFieldReach} / reach;
    // 连续供燃场经一次卷曲重采样生成火舌，焰根不位移，越靠焰尖扰动越大。
    float bend = smoothstep(0.0, 0.7, height);
    vec2 warped = effectUv + vec2(curl * 0.045 * bend, (broad - 0.5) * 0.018 * bend);
    // 气流同时带动细纹和火舌，越靠焰尖越柔软；焰根和字形保持稳定。
    warped -= wind * (0.075 * bend * bend);
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
