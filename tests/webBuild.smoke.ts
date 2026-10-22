import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

test("纯前端产物只有一个 HTML，脚本、样式和描摹 Worker 全部内嵌", async () => {
  assert.deepEqual(await readdir("dist/web"), ["index.html"]);
  const html = await readFile("dist/web/index.html", "utf8");
  const document = new JSDOM(html, { virtualConsole: new VirtualConsole() })
    .window.document;
  assert.equal(document.querySelectorAll("script[src], link[href]").length, 0);
  assert.equal(document.querySelectorAll('script[type="module"]').length, 1);
  assert.ok(
    document.querySelector("style")?.textContent?.includes("text-center"),
  );
  const script = document.querySelector("script")!.textContent!;
  assert.ok(script.includes("浏览器手稿"));
  assert.ok(script.includes("请下载桌面版"));
  assert.ok(script.includes("https://github.com/libudu/coinage"));
  assert.ok(script.includes("data:text/javascript;charset=utf-8,"));
  assert.ok(script.includes("new Worker("));
  assert.ok(!/\bimport\s*\(/.test(script));
  assert.ok(!script.includes("/api/project"));
  assert.ok(!script.includes("/api/import-settings"));
});
