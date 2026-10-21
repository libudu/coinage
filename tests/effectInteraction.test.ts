import { test } from "node:test";
import assert from "node:assert/strict";
import { createEffectPointer } from "../src/features/styles/effectInteraction";
import { defaultInkSettings } from "../src/core/glyphEffects";
import {
  createInkFlow,
  inkPointerRadius,
} from "../src/features/styles/inkEffect";
import {
  createFireAirflow,
  fireGustCount,
  smoothFireWind,
} from "../src/features/styles/fireEffect";
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

function inkFixture() {
  const size = 64;
  const mask = new Float32Array(size * size);
  for (let y = 14; y < 50; y++)
    for (let x = 26; x < 38; x++) mask[y * size + x] = 1;
  return { size, mask, flow: createInkFlow(mask, size) };
}

test("ink bleeds outside strokes, rapidly fades to empty space and stays at equilibrium without stirring", () => {
  const { size, flow } = inkFixture();
  const at = (x: number) => flow.rest[32 * size + x];
  assert.ok(at(32) > 0.99);
  assert.ok(at(25) > at(24) && at(24) > 0);
  assert.ok(at(20) < 1 / 255);
  assert.equal(at(0), 0);
  assert.equal(flow.update([0.5, 0.5, 0, 0], 0.05, defaultInkSettings), false);
  assert.deepEqual(flow.density, flow.rest);
  const empty = createInkFlow(new Float32Array(size * size), size);
  for (let i = 0; i < 15; i++)
    empty.update([0.5, 0.5, 2, 1], 0.025, defaultInkSettings);
  assert.ok(empty.density.every((value) => value === 0));
});

test("stirring carries ink outside the glyph and clear water inside, retains a wake, then restores the source", () => {
  const { size, mask, flow } = inkFixture();
  flow.update([0.25, 0.5, 1.4, 0], 0, defaultInkSettings);
  for (let i = 1; i <= 20; i++)
    flow.update([0.25 + i * 0.025, 0.5, 1.4, 0], 0.025, defaultInkSettings);
  const deficit = () =>
    flow.density.reduce(
      (sum, value, i) =>
        sum + (mask[i] ? Math.max(0, flow.rest[i] - value) : 0),
      0,
    );
  const displaced = flow.density.reduce(
    (sum, value, i) => sum + (!mask[i] ? Math.max(0, value - flow.rest[i]) : 0),
    0,
  );
  const disturbed = deficit();
  assert.ok(disturbed > 3, `clear flow should enter the stroke: ${disturbed}`);
  assert.ok(displaced > 1, `ink should leave the stroke: ${displaced}`);
  const atRelease = Float32Array.from(flow.density);
  flow.update([-10, -10, 0, 0], 0.1, defaultInkSettings);
  assert.notDeepEqual(flow.density, atRelease);
  assert.ok(deficit() > 1);
  for (let i = 0; i < 240; i++)
    flow.update([-10, -10, 0, 0], 0.025, defaultInkSettings);
  assert.ok(deficit() < disturbed * 0.02);
  assert.ok(
    flow.density.every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 1,
    ),
  );
  for (let i = 0; i < size; i++) {
    assert.equal(flow.density[i], 0);
    assert.equal(flow.density[(size - 1) * size + i], 0);
  }
});

test("resting ink keeps a narrow transition around the source without a broad wash", () => {
  const size = 192;
  const mask = new Float32Array(size * size);
  for (let y = 50; y < 140; y++)
    for (let x = 90; x < 102; x++) mask[y * size + x] = 1;
  const flow = createInkFlow(mask, size);
  const at = (x: number) => flow.density[96 * size + x];
  assert.ok(at(90) > 0.78, "the inside of the edge should remain dense");
  assert.ok(at(89) > 0, "some natural diffusion should remain outside");
  assert.ok(at(88) < 0.06, "ink should fall off within two grid cells");
  assert.ok(at(87) < 0.015, "the distant wash should be almost transparent");
});

test("diffusion range updates resting contours immediately while every range remains stirrable", () => {
  const widths: number[] = [];
  for (const diffusionRange of [0, 50, 100, 200]) {
    const { size, mask, flow } = inkFixture();
    const settings = { ...defaultInkSettings, diffusionRange };
    flow.update([-10, -10, 0, 0], 0, settings);
    assert.deepEqual(flow.density, flow.rest);
    widths.push(flow.rest[32 * size + 25]);
    if (diffusionRange === 0) assert.deepEqual(flow.rest, mask);
    flow.update([0.25, 0.5, 1.4, 0], 0, settings);
    for (let i = 1; i <= 20; i++)
      flow.update([0.25 + i * 0.025, 0.5, 1.4, 0], 0.025, settings);
    assert.ok(
      flow.density.some((value, i) => mask[i] && value < flow.rest[i] - 0.08),
      `flow should open the stroke at ${diffusionRange}%`,
    );
    assert.ok(
      flow.density.some((value, i) => !mask[i] && value > flow.rest[i] + 0.01),
    );
    const displaced = Float32Array.from(flow.density);
    flow.update([-10, -10, 0, 0], 0, {
      ...settings,
      diffusionRange: diffusionRange === 0 ? 200 : 0,
    });
    assert.deepEqual(
      flow.density,
      displaced,
      "changing diffusion must preserve ink already in motion",
    );
    flow.reset();
    assert.deepEqual(flow.density, flow.rest);
    assert.ok(
      flow.pixels.every(
        (value, i) =>
          i % 4 === 3 ||
          value === Math.round(flow.density[Math.floor(i / 4)] * 255),
      ),
    );
  }
  assert.equal(widths[0], 0);
  assert.ok(
    widths[1] > widths[0] && widths[2] > widths[1] && widths[3] > widths[2],
  );
});

test("stir size changes the affected water area and omission keeps the default radius", () => {
  const size = 96;
  const mask = new Float32Array(size * size);
  for (let y = 20; y < 76; y++)
    for (let x = 36; x < 60; x++) mask[y * size + x] = 1;
  const simulate = (stirSize: number | undefined) => {
    const flow = createInkFlow(mask, size);
    for (let i = 0; i < 12; i++)
      flow.update([0.375 + i * 0.005, 0.5, 1, 0], 0.025, {
        ...defaultInkSettings,
        stirSize,
      });
    return flow;
  };
  const small = simulate(50),
    large = simulate(200);
  const affected = (flow: typeof small) =>
    flow.density.reduce(
      (sum, value, i) => sum + (Math.abs(value - flow.rest[i]) > 0.01 ? 1 : 0),
      0,
    );
  assert.ok(affected(small) > 0);
  assert.ok(affected(large) > affected(small) * 4);
  assert.deepEqual(simulate(undefined).density, simulate(100).density);
});

test("ink instances stir independently, zero strength disables injection and reset clears every pending flow", () => {
  const { mask, size, flow } = inkFixture();
  const other = createInkFlow(mask, size);
  for (let i = 0; i < 10; i++)
    flow.update([0.5, 0.5, 2, -1], 0.025, defaultInkSettings);
  assert.notDeepEqual(flow.density, flow.rest);
  assert.deepEqual(other.density, other.rest);
  const disabled = { ...defaultInkSettings, disturbance: 0 };
  assert.equal(other.update([0.5, 0.5, 2, -1], 0.025, disabled), false);
  other.reset();
  assert.equal(other.update([5, 5, 2, -1], 0.025, defaultInkSettings), false);
  flow.reset();
  assert.deepEqual(flow.density, flow.rest);
  assert.equal(flow.update([0.5, 0.5, 0, 0], 0.025, defaultInkSettings), false);
  assert.deepEqual(flow.density, flow.rest);
  assert.deepEqual(flow.pixels, other.pixels);
});

test("ink is supplied only by the glyph source and vanishes rapidly without a source", () => {
  const { flow, size } = inkFixture();
  flow.density.fill(0);
  flow.update([0.5, 0.5, 1, 0], 0, defaultInkSettings);
  flow.update([-10, -10, 0, 0], 0.025, defaultInkSettings);
  const center = 32 * size + 32;
  assert.ok(flow.density[center] > 0 && flow.density[center] < 0.1);
  for (let i = 0; i < 100; i++)
    flow.update([-10, -10, 0, 0], 0.025, defaultInkSettings);
  assert.ok(flow.density[center] > flow.rest[center] * 0.99);
  const empty = createInkFlow(new Float32Array(size * size), size);
  empty.density.fill(1);
  empty.update([0.5, 0.5, 1, 0], 0, defaultInkSettings);
  for (let i = 0; i < 40; i++)
    empty.update([-10, -10, 0, 0], 0.025, defaultInkSettings);
  assert.ok(Math.abs(empty.density[center] - Math.exp(-2.8 * 0.8)) < 1e-5);
});

test("the half-sized pointer stirs velocity without coloring or diluting uniform ink", () => {
  assert.equal(inkPointerRadius, 0.095 / 2);
  const size = 64;
  const source = new Float32Array(size * size).fill(1);
  const stirred = createInkFlow(source, size);
  const still = createInkFlow(source, size);
  stirred.density.fill(0.5);
  still.density.fill(0.5);
  for (const flow of [stirred, still])
    flow.update([0.5, 0.5, 1, 0], 0, defaultInkSettings);
  for (let i = 0; i < 8; i++) {
    stirred.update([0.5, 0.5, 1, 0], 0.025, defaultInkSettings);
    still.update([-10, -10, 0, 0], 0.025, defaultInkSettings);
  }
  for (let y = 28; y <= 36; y++)
    for (let x = 28; x <= 36; x++) {
      const i = y * size + x;
      assert.ok(Math.abs(stirred.density[i] - still.density[i]) < 1e-5);
    }
});

test("ink advection and replenishment follow elapsed time across frame rates", () => {
  const run = (dt: number) => {
    const { flow } = inkFixture();
    for (let i = 0; i < Math.round(0.4 / dt); i++)
      flow.update([0.5, 0.5, 1, 0], dt, defaultInkSettings);
    for (let i = 0; i < Math.round(1 / dt); i++)
      flow.update([-10, -10, 0, 0], dt, defaultInkSettings);
    return flow.density;
  };
  const slow = run(0.05),
    fast = run(0.0125);
  assert.ok(slow.every((value, i) => Math.abs(value - fast[i]) < 1e-6));
});

test("fire airflow leaves a drifting, spreading wake that decays after the pointer has left", () => {
  const air = createFireAirflow();
  air.update([0.1, 0.5, 2, 0], 0);
  for (let i = 1; i <= 16; i++) air.update([0.1 + i * 0.025, 0.5, 2, 0], 0.025);
  assert.ok(air.motion.some((value, i) => i % 4 === 0 && value > 0));
  const origin = air.sources[0];
  const width = air.motion[2];
  const strength = air.motion[0];
  air.update([-10, -10, 0, 0], 0.1);
  assert.ok(air.sources[0] > origin);
  assert.ok(air.motion[2] > width);
  assert.ok(air.motion[0] > 0 && air.motion[0] < strength);
  assert.ok(air.motion.every((value, i) => i % 4 !== 2 || value <= 0.5));
  air.update([-10, -10, 0, 0], 1);
  assert.ok(air.sources.every((value) => value === 0));
  assert.ok(air.motion.every((value) => value === 0));
});

test("fire airflow preserves both directions during reversal, bounds storage and clears all transient state", () => {
  const air = createFireAirflow();
  air.update([0.5, 0.5, 3, 0], 0);
  for (let i = 0; i < 25; i++) air.update([0.5, 0.5, 3, 0], 0.025);
  for (let i = 0; i < 12; i++) air.update([0.5, 0.5, -3, 0], 0.025);
  const velocities = [...air.motion].filter((_, i) => i % 4 === 0);
  assert.ok(velocities.some((value) => value > 0));
  assert.ok(velocities.some((value) => value < 0));
  assert.equal(air.sources.length, fireGustCount * 4);
  assert.ok([...air.sources, ...air.motion].every(Number.isFinite));
  air.reset();
  assert.ok([...air.sources, ...air.motion].every((value) => value === 0));
  air.update([0.5, 0.5, 0, 0], 0.025);
  assert.ok(air.motion.every((value) => value === 0));
  for (let i = 0; i < 40; i++) air.update([5, 5, 3, 3], 0.025);
  assert.ok(air.motion.every((value) => value === 0));
});

test("airflow emission and diffusion follow elapsed time rather than frame count", () => {
  const sample = (dt: number) => {
    const air = createFireAirflow();
    air.update([0.1, 0.5, 1, 0], 0);
    for (let i = 1; i <= Math.round(0.7 / dt); i++)
      air.update([0.1 + i * dt, 0.5, 1, 0], dt);
    return [...air.sources, ...air.motion];
  };
  const slow = sample(0.05);
  const fast = sample(0.01);
  assert.ok(slow.some((value) => value !== 0));
  assert.ok(slow.every((value, i) => Math.abs(value - fast[i]) < 1e-6));
});

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
