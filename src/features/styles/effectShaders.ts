import { flameFieldReach, flameFieldScale } from "./flameField";

export const effectVertex = `
in vec2 aPosition;
out vec2 vUv;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vUv = aPosition;
}`;

// 字形纹理保留透明边距；采样只读取真实笔画，不依赖矩形底图。
export const effectFragment = `
precision highp float;
in vec2 vUv;
out vec4 finalColor;
uniform sampler2D uMask;
uniform sampler2D uFlame;
uniform float uTime;
uniform float uKind;
uniform float uIntensity;
uniform float uSpeed;
uniform float uAngle;
uniform float uSeed;
uniform vec3 uCold;
uniform vec3 uWarm;
uniform vec3 uHot;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0, amplitude = 0.55;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = p * 2.07 + vec2(17.3, 8.9);
    amplitude *= 0.48;
  }
  return value;
}
float mask(vec2 uv) {
  if (min(uv.x, uv.y) < 0.0 || max(uv.x, uv.y) > 1.0) return 0.0;
  return texture(uMask, uv).a;
}
vec2 flameField(vec2 uv) {
  vec2 p = (uv - 0.5) * ${flameFieldScale} + 0.5;
  if (min(p.x, p.y) < 0.0 || max(p.x, p.y) > 1.0) return vec2(1.0, 0.0);
  return texture(uFlame, p).rg;
}
void main() {
  vec2 uv = vUv;
  float t = uTime * uSpeed + uSeed;
  vec2 across = vec2(cos(uAngle), sin(uAngle));
  vec2 down = vec2(-sin(uAngle), cos(uAngle));
  vec2 centered = uv - 0.5;
  vec2 effectUv = vec2(dot(centered, across), dot(centered, down)) + 0.5;
  float core = mask(uv);
  vec3 color;
  float alpha;
  if (uKind < 1.5) {
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
  } else {
    effectUv = vec2(dot(uv, across), dot(uv, down));
    float pulse = 0.83 + 0.17 * sin(t * 1.7);
    float veins = fbm(effectUv * 26.0 + vec2(0, t * 0.35));
    float sweep = pow(0.5 + 0.5 * sin(-effectUv.y * 17.0 - t * 2.0), 16.0);
    float radiance = clamp(0.3 + veins * 0.35 + sweep * 0.6, 0.0, 1.0);
    color = mix(uWarm, uHot, radiance);
    alpha = core * pulse;
    color *= 0.8 + uIntensity * 0.4;
  }
  finalColor = vec4(color * alpha, alpha);
}`;
