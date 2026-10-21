import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadLocalSettings,
  saveLocalSettings,
} from "../src/shared/utils/localSettings";

const defaults = {
  sentence: "",
  showSentenceGrid: true,
  showSentenceEffects: true,
  sentenceGlyphSize: "small",
};

test("local settings default to visible grids and retain explicit false across reads", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  assert.deepEqual(loadLocalSettings(storage), defaults);
  saveLocalSettings({ showSentenceGrid: false }, storage);
  assert.deepEqual(loadLocalSettings(storage), {
    ...defaults,
    showSentenceGrid: false,
  });
  saveLocalSettings({}, storage);
  assert.deepEqual(loadLocalSettings(storage), {
    ...defaults,
    showSentenceGrid: false,
  });
  saveLocalSettings({ showSentenceGrid: true }, storage);
  assert.deepEqual(loadLocalSettings(storage), defaults);
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
    '{"showSentenceEffects":"false","sentenceGlyphSize":"huge"}',
    '{"showSentenceEffects":0,"sentenceGlyphSize":150}',
    '{"sentence":false}',
    '{"sentence":123}',
    '{"sentence":null}',
    '{"sentence":[]}',
    '{"sentence":{}}',
  ]) {
    assert.deepEqual(loadLocalSettings({ getItem: () => value }), defaults);
  }
  const blocked = {
    getItem: () => {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(loadLocalSettings(blocked), defaults);
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

test("sentence effects and size preferences are validated independently", () => {
  let value =
    '{"showSentenceGrid":false,"showSentenceEffects":false,"sentenceGlyphSize":"medium"}';
  const storage = {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
  assert.deepEqual(loadLocalSettings(storage), {
    ...defaults,
    showSentenceGrid: false,
    showSentenceEffects: false,
    sentenceGlyphSize: "medium",
  });
  saveLocalSettings({ sentenceGlyphSize: "large" }, storage);
  assert.deepEqual(loadLocalSettings(storage), {
    ...defaults,
    showSentenceGrid: false,
    showSentenceEffects: false,
    sentenceGlyphSize: "large",
  });
  value =
    '{"showSentenceGrid":false,"showSentenceEffects":"invalid","sentenceGlyphSize":"medium"}';
  assert.deepEqual(loadLocalSettings(storage), {
    ...defaults,
    showSentenceGrid: false,
    sentenceGlyphSize: "medium",
  });
});
