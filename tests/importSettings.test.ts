import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultImportSettings,
  importSettingLimits,
  isImportSettings,
  normalizeImportSettings,
} from "../src/core/importSettings";
import {
  loadImportSettings,
  saveImportSettings,
} from "../src/features/tracing/traceSettings";

test("import settings validate every numeric limit and reject incomplete or untrusted fields", () => {
  assert.equal(defaultImportSettings.width, 24);
  assert.equal(defaultImportSettings.crop, 0);
  assert.equal(isImportSettings(defaultImportSettings), true);
  for (const [key, { min, max }] of Object.entries(importSettingLimits)) {
    assert.equal(
      isImportSettings({ ...defaultImportSettings, [key]: min }),
      true,
    );
    assert.equal(
      isImportSettings({ ...defaultImportSettings, [key]: max }),
      true,
    );
    for (const invalid of [min - 1, max + 1, NaN, Infinity, "1", null])
      assert.equal(
        isImportSettings({ ...defaultImportSettings, [key]: invalid }),
        false,
        key,
      );
  }
  for (const invalid of [
    null,
    [],
    {},
    { ...defaultImportSettings, polarity: "invalid" },
    { ...defaultImportSettings, colorOnly: 1 },
    { ...defaultImportSettings, extra: 1 },
  ])
    assert.equal(isImportSettings(invalid), false);
});

test("reading preferences retains supported values, removes unrelated fields and clamps current slider limits", () => {
  assert.deepEqual(normalizeImportSettings({}), defaultImportSettings);
  const settings = normalizeImportSettings({
    ...defaultImportSettings,
    width: 65,
    colorOnly: true,
    offsetX: -15,
    offsetY: 180,
  });
  assert.deepEqual(settings, {
    ...defaultImportSettings,
    width: 65,
    offsetX: -15,
    offsetY: 100,
  });
  assert.equal(isImportSettings(settings), true);
  assert.throws(() => normalizeImportSettings(null));
});

test("settings saves are serialized and reopening waits for the latest backend write", async (t) => {
  const calls: string[] = [];
  const firstSettings = { ...defaultImportSettings, offsetX: 10 },
    latest = { ...defaultImportSettings, offsetX: 20 };
  let releaseFirst!: (response: Response) => void,
    releaseSecond!: (response: Response) => void;
  let secondStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    secondStarted = resolve;
  });
  const firstResponse = new Promise<Response>((resolve) => {
    releaseFirst = resolve;
  });
  const secondResponse = new Promise<Response>((resolve) => {
    releaseSecond = resolve;
  });
  t.mock.method(
    globalThis,
    "fetch",
    async (url: unknown, init?: RequestInit) => {
      assert.equal(url, "/api/import-settings");
      if (init?.method === "PUT") {
        const value = JSON.parse(String(init.body));
        calls.push(`PUT ${value.offsetX}`);
        if (value.offsetX === 20) secondStarted();
        return value.offsetX === 10 ? firstResponse : secondResponse;
      }
      calls.push("GET");
      return new Response(JSON.stringify(latest));
    },
  );
  const first = saveImportSettings(firstSettings),
    second = saveImportSettings(latest),
    opened = loadImportSettings();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, ["PUT 10"]);
  releaseFirst(new Response("{}"));
  await first;
  await started;
  assert.deepEqual(calls, ["PUT 10", "PUT 20"]);
  releaseSecond(new Response("{}"));
  await second;
  assert.deepEqual(await opened, latest);
  assert.deepEqual(calls, ["PUT 10", "PUT 20", "GET"]);
});

test("backend read and save failures stay visible to callers and later retries can succeed", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("{}", { status: 500 }),
  );
  await assert.rejects(loadImportSettings(), /读取导入配置失败/);
  await assert.rejects(
    saveImportSettings(defaultImportSettings),
    /保存导入配置失败/,
  );
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify({ width: 40 })),
  );
  await assert.rejects(loadImportSettings(), /配置格式不正确/);
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) =>
      new Response(
        JSON.stringify(init?.method === "PUT" ? {} : defaultImportSettings),
      ),
  );
  await saveImportSettings(defaultImportSettings);
  assert.deepEqual(await loadImportSettings(), defaultImportSettings);
});
