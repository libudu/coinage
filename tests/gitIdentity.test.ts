import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("Husky checks effective author and committer names before creating a commit", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "coinage-identity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("GIT_")) delete env[key];
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(root, "no-global-config"),
    XDG_CONFIG_HOME: join(root, "config"),
    HUSKY: "1",
  });
  const git = (args: string[], overrides: NodeJS.ProcessEnv = {}) =>
    spawnSync("git", args, {
      cwd: root,
      env: { ...env, ...overrides },
      encoding: "utf8",
      windowsHide: true,
    });
  for (const args of [
    ["init", "--quiet"],
    ["config", "user.name", "Contributor"],
    ["config", "user.email", "contributor@example.invalid"],
    ["config", "commit.gpgsign", "false"],
  ]) {
    const result = git(args);
    assert.equal(result.status, 0, result.stderr);
  }
  await mkdir(join(root, ".husky"));
  await mkdir(join(root, "scripts"));
  for (const file of [
    ".husky/pre-commit",
    ".husky/prepare-commit-msg",
    "scripts/checkGitIdentity.mjs",
  ])
    await copyFile(resolve(file), join(root, file));
  const install = spawnSync(
    process.execPath,
    [resolve("node_modules/husky/bin.js")],
    { cwd: root, env, encoding: "utf8", windowsHide: true },
  );
  assert.equal(install.status, 0, install.stderr);
  assert.equal(git(["config", "core.hooksPath"]).stdout.trim(), ".husky/_");

  for (const [label, args, overrides] of [
    ["author environment", [], { GIT_AUTHOR_NAME: "测试作者" }],
    ["committer environment", [], { GIT_COMMITTER_NAME: "测试提交者" }],
    ["explicit author", ["--author=测试作者 <author@example.invalid>"], {}],
    ["extended Han", [], { GIT_AUTHOR_NAME: "Author𠀀" }],
    ["no-verify", ["--no-verify"], { GIT_AUTHOR_NAME: "测试作者" }],
  ] as const) {
    const result = git(
      ["commit", "--allow-empty", "-m", "identity guard", ...args],
      overrides,
    );
    assert.notEqual(result.status, 0, label);
    assert.match(result.stdout + result.stderr, /姓名不能包含汉字/u, label);
    assert.notEqual(git(["rev-parse", "--verify", "HEAD"]).status, 0, label);
  }

  assert.equal(git(["config", "user.name", "测试配置"]).status, 0);
  const blockedConfig = git([
    "commit",
    "--allow-empty",
    "-m",
    "identity guard",
  ]);
  assert.notEqual(blockedConfig.status, 0);
  assert.match(
    blockedConfig.stdout + blockedConfig.stderr,
    /姓名不能包含汉字/u,
  );

  // 实际身份覆盖本机中文配置后可以提交，中文提交说明也不受限制。
  const allowed = git(["commit", "--allow-empty", "-m", "允许中文提交说明"], {
    GIT_AUTHOR_NAME: "Contributor",
    GIT_COMMITTER_NAME: "Contributor",
  });
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(
    git(["log", "-1", "--format=%s"]).stdout.trim(),
    "允许中文提交说明",
  );
});
