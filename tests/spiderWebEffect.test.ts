import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSpiderWeb,
  createSpiderWeb,
  drawSpiderWeb,
  spiderWebGridSize,
  spiderWebLocalPoint,
} from "../src/features/styles/spiderWebEffect";
import { defaultSpiderWebSettings } from "../src/core/glyphEffects";

function fixture(density = 100) {
  const size = 192;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 32; y < 160; y++)
    for (let x = 40; x < 152; x++) pixels[(y * size + x) * 4 + 3] = 255;
  const geometry = buildSpiderWeb(pixels, size, density);
  return { pixels, size, geometry, web: createSpiderWeb(pixels, size) };
}

test("web silk is deterministic, sparse, confined to the glyph and preserves holes and separate strokes", () => {
  const { size, pixels } = fixture();
  for (let y = 55; y < 135; y++)
    for (let x = 70; x < 125; x++) pixels[(y * size + x) * 4 + 3] = 0;
  for (let y = 25; y < 42; y++)
    for (let x = 165; x < 179; x++) pixels[(y * size + x) * 4 + 3] = 255;
  const mesh = buildSpiderWeb(pixels, size, 100);
  assert.deepEqual(buildSpiderWeb(pixels, size, 100), mesh);
  assert.ok(mesh.threads.length > 100);
  assert.ok(mesh.nodes.some((node) => node.x > 165 / size));
  assert.ok(mesh.nodes.some((node) => node.boundary));
  for (const thread of mesh.threads) {
    const a = mesh.nodes[thread.a],
      b = mesh.nodes[thread.b];
    for (let i = 0; i <= 12; i++) {
      const x = Math.floor((a.x + ((b.x - a.x) * i) / 12) * size);
      const y = Math.floor((a.y + ((b.y - a.y) * i) / 12) * size);
      assert.equal(pixels[(y * size + x) * 4 + 3], 255);
      const t = i / 12,
        s = 1 - t;
      const cx = Math.floor(
        (s * s * a.x + 2 * s * t * thread.control.x + t * t * b.x) * size,
      );
      const cy = Math.floor(
        (s * s * a.y + 2 * s * t * thread.control.y + t * t * b.y) * size,
      );
      assert.equal(pixels[(cy * size + cx) * 4 + 3], 255);
    }
  }
  assert.deepEqual(
    buildSpiderWeb(new Uint8ClampedArray(pixels.length), size, 100),
    { nodes: [], threads: [] },
  );
  const counts = [25, 100, 200].map(
    (density) => fixture(density).geometry.threads.length,
  );
  assert.ok(counts[0] < counts[1] && counts[1] < counts[2]);
});

test("dragging stretches nearby silk and soft edges independently for repeated glyphs, then settles and idles", () => {
  const { pixels, size, web } = fixture();
  const other = createSpiderWeb(pixels, size);
  const rest = Float32Array.from(web.positions);
  assert.equal(web.grab({ x: 0.05, y: 0.05 }), false);
  assert.equal(web.grab({ x: 0.5, y: 0.5 }), true);
  web.move({ x: 0.66, y: 0.57 });
  for (let i = 0; i < 20; i++) web.update(1 / 40, 65);
  const stretched = Float32Array.from(web.positions);
  assert.ok(stretched.some((value, i) => Math.abs(value - rest[i]) > 0.03));
  assert.deepEqual(other.positions, rest);
  const edge = (16 * (spiderWebGridSize + 1) + 7) * 2;
  assert.ok(
    web.restoring[edge / 2] > web.restoring[16 * (spiderWebGridSize + 1) + 16],
  );
  assert.ok(Math.abs(stretched[edge] - rest[edge]) > 0.001);
  web.release();
  web.update(1 / 40, 65);
  assert.notDeepEqual(web.positions, stretched);
  let returned = false;
  for (let i = 0; i < 480; i++) {
    if (!web.update(1 / 40, 65)) {
      returned = true;
      break;
    }
    assert.ok(web.positions.every(Number.isFinite));
  }
  assert.equal(returned, true);
  assert.deepEqual(web.positions, rest);
  web.move({ x: 1, y: 1 });
  assert.equal(web.update(0.025, 65), false);
});

test("edge silk can be grabbed, deformed coordinates can be picked again, and a held stationary drag sleeps and wakes", () => {
  const { web } = fixture();
  const edge = (16 * (spiderWebGridSize + 1) + 7) * 2;
  const start = { x: web.rest[edge], y: web.rest[edge + 1] };
  assert.equal(web.grab(start), true);
  web.move({ x: start.x - 0.15, y: start.y + 0.06 });
  for (let i = 0; i < 240; i++) web.update(0.025, 65);
  assert.ok(web.positions[edge] < start.x - 0.03);
  assert.equal(web.active, false);
  const point = { x: web.positions[edge], y: web.positions[edge + 1] };
  const local = spiderWebLocalPoint(web.positions, point)!;
  assert.ok(Math.abs(local.x - start.x) < 0.0001);
  assert.ok(Math.abs(local.y - start.y) < 0.0001);
  web.release();
  assert.equal(web.grab(point), true);
  web.move({ x: point.x - 0.02, y: point.y });
  assert.equal(web.active, true);
  web.release();
  for (let i = 0; i < 400; i++) web.update(0.025, 65);
  assert.deepEqual(web.positions, web.rest);
});

test("propagation controls distant pull and can change during an active drag", () => {
  const distant = (16 * (spiderWebGridSize + 1) + 22) * 2;
  const displacement = [0, 100, 200].map((propagation) => {
    const { web } = fixture();
    web.grab({ x: 0.3, y: 0.5 }, propagation);
    web.move({ x: 0.4, y: 0.56 });
    for (let i = 0; i < 40; i++) web.update(0.025, 65, propagation);
    return web.positions[distant] - web.rest[distant];
  });
  assert.ok(displacement[0] < 0.001);
  assert.ok(displacement[1] > 0.005);
  // 100% 设置项对应调整前 80% 的实测远端位移，界面与持久化读数不变。
  assert.ok(Math.abs(displacement[1] - 0.011076152324676514) < 0.000001);
  assert.ok(displacement[2] > displacement[1] * 2);
  const { web } = fixture();
  web.grab({ x: 0.3, y: 0.5 }, 0);
  web.move({ x: 0.4, y: 0.56 });
  for (let i = 0; i < 40; i++) web.update(0.025, 65, 0);
  for (let i = 0; i < 40; i++) web.update(0.025, 65, 200);
  assert.ok(web.positions[distant] - web.rest[distant] > 0.03);
});

test("silk drawing is batched, and dynamic mesh uploads stay small regardless of visual density", () => {
  assert.equal(defaultSpiderWebSettings.color, "#000000");
  assert.equal(defaultSpiderWebSettings.density, 100);
  assert.equal(defaultSpiderWebSettings.elasticity, 50);
  const counts = { strokes: 0, curves: 0 };
  const context = {
    canvas: { width: 1024 },
    clearRect() {},
    beginPath() {},
    moveTo() {},
    quadraticCurveTo() {
      counts.curves++;
    },
    stroke() {
      counts.strokes++;
    },
  } as unknown as CanvasRenderingContext2D;
  const samples = [25, 100, 200].map((density) => fixture(density));
  const { geometry } = samples[1];
  drawSpiderWeb(context, geometry, defaultSpiderWebSettings);
  assert.ok(counts.curves > geometry.threads.length);
  assert.ok(counts.curves < geometry.threads.length * 1.4);
  assert.ok(counts.strokes <= 37);
  assert.ok(samples.every(({ web }) => web.positions.byteLength < 16 * 1024));
  assert.ok(
    samples.every(
      ({ web }) => web.positions.length === samples[0].web.positions.length,
    ),
  );
});

test("silk has fine sagging capture strands and taut thicker supports instead of a uniform wireframe", () => {
  const { geometry } = fixture();
  const supports = geometry.threads.filter(
    (thread) => thread.kind === "support",
  );
  const captures = geometry.threads.filter(
    (thread) => thread.kind === "capture",
  );
  const average = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(supports.length > 100 && captures.length > 100);
  assert.ok(
    average(supports.map((thread) => thread.weight)) >
      average(captures.map((thread) => thread.weight)) * 1.7,
  );
  const curvature = (thread: (typeof captures)[number]) => {
    const a = geometry.nodes[thread.a],
      b = geometry.nodes[thread.b];
    return (
      Math.hypot(
        thread.control.x - (a.x + b.x) / 2,
        thread.control.y - (a.y + b.y) / 2,
      ) / thread.length
    );
  };
  assert.ok(
    captures.filter((thread) => curvature(thread) > 0.1).length >
      captures.length * 0.7,
  );
  assert.ok(supports.every((thread) => curvature(thread) < 0.02));
});

test("elasticity controls stretch and spring return, cancellation resets, and extreme drags stay finite", () => {
  const displacements: number[] = [];
  for (const elasticity of [0, 65, 100]) {
    const { web } = fixture();
    const rest = Float32Array.from(web.positions);
    web.grab({ x: 0.5, y: 0.5 });
    web.move({ x: 10000, y: -10000 });
    for (let i = 0; i < 40; i++) web.update(1 / 40, elasticity);
    assert.ok(
      web.positions.every(
        (value) => Number.isFinite(value) && Math.abs(value) < 2,
      ),
    );
    displacements.push(
      web.positions.reduce(
        (sum, value, i) => sum + Math.abs(value - rest[i]),
        0,
      ),
    );
    web.reset();
    assert.deepEqual(web.positions, rest);
    assert.equal(web.update(0.025, elasticity), false);
  }
  assert.ok(
    displacements[0] < displacements[1] && displacements[1] < displacements[2],
  );
});

test("return motion is stable across preview frame rates", () => {
  const samples = [30, 40, 60, 120].map((fps) => {
    const { web } = fixture();
    web.grab({ x: 0.5, y: 0.5 });
    web.move({ x: 0.65, y: 0.56 });
    for (let i = 0; i < fps / 2; i++) web.update(1 / fps, 65);
    web.release();
    for (let i = 0; i < fps / 2; i++) web.update(1 / fps, 65);
    return Float32Array.from(web.positions);
  });
  for (const positions of samples.slice(1))
    assert.ok(
      positions.every((value, i) => Math.abs(value - samples[0][i]) < 0.003),
    );
});
