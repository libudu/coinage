import { execFileSync } from "node:child_process";

try {
  for (const [variable, label] of [
    ["GIT_AUTHOR_IDENT", "作者"],
    ["GIT_COMMITTER_IDENT", "提交者"],
  ]) {
    // 读取 Git 实际采用的身份，包含环境变量和 --author 的覆盖值。
    const identity = execFileSync("git", ["var", variable], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }).trim();
    const match = identity.match(/^(.+) <[^<>]*> -?\d+ [+-]\d{4}$/u);
    if (!match) throw new Error(`无法解析${label}身份`);
    if (/\p{Script=Han}/u.test(match[1])) {
      console.error(`[Husky] ${label}姓名不能包含汉字，避免真实姓名泄露。`);
      console.error('请设置：git config --local user.name "Your Name"');
      console.error(
        "同时检查 GIT_AUTHOR_NAME、GIT_COMMITTER_NAME 和 --author 参数。",
      );
      process.exit(1);
    }
  }
} catch {
  console.error("[Husky] 无法读取有效的 Git 作者或提交者身份，已停止提交。");
  process.exit(1);
}
