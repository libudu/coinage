import { fireUniforms, fireSampling, fireFragment } from "./fireEffect";
import { inkUniforms, inkFragment } from "./inkEffect";
import {
  runeUniforms,
  runeProjection,
  runeSurface,
  runeFragment,
} from "./runeEffect";

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
${fireUniforms}
${runeUniforms}
${inkUniforms}

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
${fireSampling}
${runeProjection}
${runeSurface}
void main() {
  vec2 uv = uKind > 1.5 && uKind < 2.5 ? runeUv(vUv) : vUv;
  float t = uTime * uSpeed + uSeed;
  vec2 across = vec2(cos(uAngle), sin(uAngle));
  vec2 down = vec2(-sin(uAngle), cos(uAngle));
  vec2 centered = uv - 0.5;
  vec2 effectUv = vec2(dot(centered, across), dot(centered, down)) + 0.5;
  float core = mask(uv);
  vec3 color;
  float alpha;
  if (uKind < 1.5) {
${fireFragment}
  } else if (uKind < 2.5) {
${runeFragment}
  } else {
${inkFragment}
  }
  finalColor = vec4(color * alpha, alpha);
}`;
