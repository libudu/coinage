import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultFilenamePattern,
  extractFilenameInfo,
  filenamePatternMaxLength,
} from "../src/core/filenameInfo";

test("default template extracts the final underscore field as Chinese and preserves the full description", () => {
  for (const extension of ["", ".png", ".PNG", ".jpg", ".jpeg", ".webp"])
    assert.deepEqual(
      extractFilenameInfo(
        `狼族语_0002s_0038_朋友${extension}`,
        defaultFilenamePattern,
      ),
      {
        name: "朋友",
        description: "狼族语_0002s_0038",
        error: "",
      },
    );
  assert.deepEqual(
    extractFilenameInfo("族语_朋友😀.v2.PNG", defaultFilenamePattern),
    {
      name: "朋友😀.v2",
      description: "族语",
      error: "",
    },
  );
});

test("templates support either field order, fixed text, literal regex symbols and individual fields", () => {
  assert.deepEqual(
    extractFilenameInfo("朋友_狼族语_0038.png", "{name}_{desc}"),
    {
      name: "朋友",
      description: "狼族语_0038",
      error: "",
    },
  );
  assert.deepEqual(
    extractFilenameInfo("[狼族语]+(朋友).png", "[{desc}]+({name})"),
    {
      name: "朋友",
      description: "狼族语",
      error: "",
    },
  );
  assert.deepEqual(
    extractFilenameInfo("scan-族语-朋友-final.png", "scan-{desc}-{name}-final"),
    {
      name: "朋友",
      description: "族语",
      error: "",
    },
  );
  assert.deepEqual(extractFilenameInfo(" 朋友 .png", "{name}"), {
    name: "朋友",
    description: "",
    error: "",
  });
  assert.deepEqual(extractFilenameInfo("族语.png", "{desc}"), {
    name: "",
    description: "族语",
    error: "",
  });
  assert.deepEqual(extractFilenameInfo("_朋友.png", defaultFilenamePattern), {
    name: "朋友",
    description: "",
    error: "",
  });
});

test("a star controls greediness for either field while unmarked fields prefer shorter matches", () => {
  for (const [pattern, name, description] of [
    ["{desc}_{name}", "0002s_0038_朋友", "狼族语"],
    ["{desc*}_{name}", "朋友", "狼族语_0002s_0038"],
    ["{desc}_{name*}", "0002s_0038_朋友", "狼族语"],
    ["{name}_{desc}", "狼族语", "0002s_0038_朋友"],
    ["{name*}_{desc}", "狼族语_0002s_0038", "朋友"],
    ["{name}_{desc*}", "狼族语", "0002s_0038_朋友"],
    ["{desc*}_{name*}", "朋友", "狼族语_0002s_0038"],
    ["{name*}_{desc*}", "狼族语_0002s_0038", "朋友"],
  ])
    assert.deepEqual(
      extractFilenameInfo("狼族语_0002s_0038_朋友.png", pattern),
      {
        name,
        description,
        error: "",
      },
      pattern,
    );
  assert.deepEqual(extractFilenameInfo("朋友.png", "{name*}"), {
    name: "朋友",
    description: "",
    error: "",
  });
  assert.deepEqual(extractFilenameInfo("族语.png", "{desc*}"), {
    name: "",
    description: "族语",
    error: "",
  });
  assert.equal(
    extractFilenameInfo("狼族语_.png", "{desc*}_{name*}").error,
    "未匹配模板，使用原文件名",
  );
});

test("blank patterns disable extraction and failed matches retain the original name without stale description", () => {
  assert.deepEqual(extractFilenameInfo("朋友.png", ""), {
    name: "朋友",
    description: "",
    error: "",
  });
  for (const filename of ["朋友.png", "狼族语_朋友.png.bak", "狼族语_.png"])
    assert.deepEqual(extractFilenameInfo(filename, "固定-{desc}_{name}"), {
      name: filename.replace(/\.png$/, ""),
      description: "",
      error: "未匹配模板，使用原文件名",
    });
});

test("invalid templates are reported without interpreting arbitrary regex or throwing", () => {
  for (const pattern of [
    "{unknown}",
    "{name",
    "name}",
    "{{name}}",
    "{name}_{name}",
    "{desc}_{desc}",
    "{desc}{name}",
    "{name}_{name*}",
    "{desc*}_{desc}",
    "{desc*}{name}",
    "{desc**}_{name}",
    "{*name}_{desc}",
    "{unknown*}",
    "(.*)",
    "{}",
    "x".repeat(filenamePatternMaxLength + 1),
  ]) {
    const result = extractFilenameInfo("狼族语_朋友.png", pattern);
    assert.equal(result.name, "狼族语_朋友", pattern);
    assert.equal(result.description, "", pattern);
    assert.ok(result.error, pattern);
  }
  assert.equal(
    extractFilenameInfo("aX朋友.png", "a.{name}").error,
    "未匹配模板，使用原文件名",
  );
  assert.equal(extractFilenameInfo("a.朋友.png", "a.{name}").name, "朋友");
});
