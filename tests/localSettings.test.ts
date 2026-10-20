import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadLocalSettings,
  saveLocalSettings,
} from "../src/shared/utils/localSettings";

test("local settings default to visible grids and retain explicit false across reads", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  assert.deepEqual(loadLocalSettings(storage), { showSentenceGrid: true });
  saveLocalSettings({ showSentenceGrid: false }, storage);
  assert.deepEqual(loadLocalSettings(storage), { showSentenceGrid: false });
  saveLocalSettings({}, storage);
  assert.deepEqual(loadLocalSettings(storage), { showSentenceGrid: false });
  saveLocalSettings({ showSentenceGrid: true }, storage);
  assert.deepEqual(loadLocalSettings(storage), { showSentenceGrid: true });
  assert.equal(values.size, 1);
  assert.ok(values.has("coinage.settings"));
});

test("invalid or inaccessible local settings fall back to defaults without throwing", () => {
  for (const value of [
    null,
    "{",
    "null",
    "[]",
    "42",
    "{}",
    '{"showSentenceGrid":"false"}',
    '{"showSentenceGrid":0}',
  ]) {
    assert.deepEqual(loadLocalSettings({ getItem: () => value }), {
      showSentenceGrid: true,
    });
  }
  const blocked = {
    getItem: () => {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(loadLocalSettings(blocked), { showSentenceGrid: true });
  assert.doesNotThrow(() =>
    saveLocalSettings(
      { showSentenceGrid: false },
      {
        ...blocked,
        setItem: () => {
          throw new Error("quota");
        },
      },
    ),
  );
  const first = loadLocalSettings({ getItem: () => null });
  first.showSentenceGrid = false;
  assert.equal(
    loadLocalSettings({ getItem: () => null }).showSentenceGrid,
    true,
  );
});
