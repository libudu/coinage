import { test } from "node:test";
import assert from "node:assert/strict";
import { createEffectPointer } from "../src/features/styles/effectInteraction";
import { smoothFireWind } from "../src/features/styles/fireEffect";
import {
  hitRune,
  runeLocalPoint,
  runePerspective,
  runePointerTilt,
  runeRippleCount,
  runeRippleDuration,
  writeRuneRipples,
} from "../src/features/styles/runeEffect";

const bounds = { x: 100, y: 200, size: 200 };

test("fire wind softens onset and reversal with frame-rate independent easing", () => {
  const wind = [0, 0];
  smoothFireWind(wind, 3, 0, 0.025);
  assert.ok(wind[0] > 0 && wind[0] < 0.4);
  const rising = wind[0];
  smoothFireWind(wind, -3, 0, 0.01);
  assert.ok(wind[0] > 0 && wind[0] < rising);
  for (let i = 0; i < 20; i++) smoothFireWind(wind, -3, 0, 0.025);
  assert.ok(wind[0] < -2);
  for (let i = 0; i < 80; i++) smoothFireWind(wind, 0, 0, 0.025);
  assert.ok(Math.abs(wind[0]) < 0.001);
  const slow = [0, 0],
    fast = [0, 0];
  for (let i = 0; i < 10; i++) smoothFireWind(slow, 1, -2, 0.05);
  for (let i = 0; i < 40; i++) smoothFireWind(fast, 1, -2, 0.0125);
  assert.ok(slow.every((value, i) => Math.abs(value - fast[i]) < 1e-12));
  smoothFireWind(wind, 3, 3, 0);
  assert.ok(Math.abs(wind[0]) < 0.001 && wind[1] === 0);
});

test("fire pointer tracks speed and direction outside the host, decays at rest and resets without a jump", () => {
  const pointer = createEffectPointer();
  pointer.move(50, 150, 100);
  assert.deepEqual(pointer.frame(bounds, 100).pointer, [-0.25, -0.25, 0, 0]);
  pointer.move(60, 170, 120);
  const moving = pointer.frame(bounds, 120).pointer;
  assert.ok(moving[2] > 0 && moving[3] > moving[2]);
  assert.ok(Math.hypot(moving[2], moving[3]) <= 3);
  assert.ok(pointer.frame(bounds, 260).pointer[2] < moving[2]);
  assert.deepEqual(pointer.frame(bounds, 920).pointer.slice(2), [0, 0]);
  pointer.move(40, 140, 940);
  assert.deepEqual(pointer.frame(bounds, 940).pointer.slice(2), [0, 0]);
  pointer.move(30, 130, 960);
  assert.ok(pointer.frame(bounds, 960).pointer[2] < 0);
  pointer.reset();
  assert.deepEqual(pointer.frame(bounds, 960).pointer, [-10, -10, 0, 0]);
  pointer.move(2000, 2000, 980);
  assert.deepEqual(pointer.frame(bounds, 980).pointer.slice(2), [0, 0]);
});

test("pointer speed is independent of event rate and normalizes to the rendered glyph width", () => {
  const sample = (distance: number, elapsed: number, size = 200) => {
    const pointer = createEffectPointer();
    pointer.move(100, 200, 100);
    pointer.move(100 + distance, 200, 100 + elapsed);
    return pointer.frame({ ...bounds, size }, 100 + elapsed).pointer[2];
  };
  assert.equal(sample(4, 10), sample(8, 20));
  assert.equal(sample(2, 4), sample(10, 20));
  assert.equal(sample(8, 20), sample(16, 20, 400));
  assert.ok(sample(8, 20) > sample(4, 20));
});

test("rune tilt remains subtle, follows pointer position and returns to neutral outside its range", () => {
  const pointer = createEffectPointer();
  pointer.move(200, 300, 0);
  assert.ok(
    runePointerTilt(pointer.frame(bounds, 0).pointer).every((v) => v === 0),
  );
  pointer.move(300, 400, 10);
  const tilt = runePointerTilt(pointer.frame(bounds, 10).pointer);
  assert.ok(tilt[0] < 0 && tilt[1] > 0);
  assert.ok(tilt.every((value) => Math.abs(value) <= 0.12));
  pointer.move(600, 300, 20);
  assert.ok(
    runePointerTilt(pointer.frame(bounds, 20).pointer).every((v) => v === 0),
  );
});

// 将遮罩上的点投影到屏幕，再验证点击逆变换，不靠矩形包围盒命中。
function projectRune(point: { x: number; y: number }, tilt: number[]) {
  const sx = Math.sin(tilt[0]),
    cx = Math.cos(tilt[0]);
  const sy = Math.sin(tilt[1]),
    cy = Math.cos(tilt[1]);
  const x = point.x - 0.5,
    y = point.y - 0.5;
  const z = -sy * x + cy * sx * y;
  const scale = runePerspective / (runePerspective - z);
  return {
    x: (cy * x + sy * sx * y) * scale + 0.5,
    y: cx * y * scale + 0.5,
  };
}

test("rune clicks hit visible ink after perspective, while transparent holes, edges and outside clicks do nothing", () => {
  const size = 100;
  const pixels = new Uint8ClampedArray(size * size * 4);
  pixels[(70 * size + 30) * 4 + 3] = 255;
  pixels[(50 * size + 50) * 4 + 3] = 20;
  const ink = { x: 0.305, y: 0.705 };
  for (const tilt of [
    [0, 0],
    [0.12, -0.12],
    [-0.1, 0.08],
  ]) {
    const projected = projectRune(ink, tilt);
    const local = runeLocalPoint(projected, tilt);
    assert.ok(Math.abs(local.x - ink.x) < 1e-12);
    assert.ok(Math.abs(local.y - ink.y) < 1e-12);
    const hit = hitRune(
      {
        x: bounds.x + projected.x * bounds.size,
        y: bounds.y + projected.y * bounds.size,
      },
      bounds,
      tilt,
      pixels,
      size,
    );
    assert.ok(hit);
    assert.ok(Math.abs(hit.x - ink.x) < 1e-12);
    for (const point of [
      { x: 200, y: 300 },
      { x: 50, y: 100 },
      { x: 299, y: 399 },
    ])
      assert.equal(hitRune(point, bounds, tilt, pixels, size), null);
  }
  assert.equal(
    hitRune(ink, { ...bounds, size: 0 }, [0, 0], pixels, size),
    null,
  );
});

test("rune rings originate at the click, expand across all corners, support repeat clicks and expire", () => {
  const output = new Float32Array(runeRippleCount * 4);
  const origin = { x: 0.2, y: 0.75 };
  const ripple = { origin, started: 10 };
  writeRuneRipples(output, [ripple], 10);
  assert.ok(Math.abs(output[0] - origin.x) < 1e-6);
  assert.equal(output[2], 0);
  assert.equal(output[3], 1);
  writeRuneRipples(
    output,
    [ripple, { origin: { x: 0.7, y: 0.4 }, started: 10.5 }],
    10.8,
  );
  assert.ok(output[2] > output[6]);
  assert.ok(output[3] > 0 && output[7] > 0);
  writeRuneRipples(output, [ripple], 10 + runeRippleDuration * 0.9);
  assert.ok(output[2] > Math.hypot(0.8, 0.75));
  assert.ok(output[3] < 1);
  writeRuneRipples(output, [ripple], 10 + runeRippleDuration + 0.01);
  assert.ok(output.every((v) => v === 0));
  writeRuneRipples(output, [ripple], 9);
  assert.ok(output.every((v) => v === 0));
});
