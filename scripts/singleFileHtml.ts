import type { Plugin } from "vite";

export function singleFileHtml(): Plugin {
  return {
    name: "coinage-single-file-html",
    enforce: "post",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const page = bundle["index.html"];
        if (!page || page.type !== "asset")
          throw new Error("缺少单文件页面入口");
        let html = String(page.source);
        for (const [filename, asset] of Object.entries(bundle)) {
          if (filename === "index.html") continue;
          if (asset.type === "chunk") {
            // Rolldown 内联动态模块后仍可能记录自身文件名；不允许外部依赖。
            if (
              !asset.isEntry ||
              asset.imports.length ||
              asset.dynamicImports.some((name) => name !== filename)
            )
              throw new Error(`单文件页面存在外部脚本：${filename}`);
            const script = /<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g;
            let replaced = false;
            html = html.replace(script, (tag, source: string) => {
              if (source !== `./${filename}`) return tag;
              replaced = true;
              return `<script type="module">${asset.code.replace(/<\/script/gi, "<\\/script")}</script>`;
            });
            if (!replaced) throw new Error(`未找到页面脚本：${filename}`);
          } else if (filename.endsWith(".css")) {
            let replaced = false;
            html = html.replace(
              /<link\b[^>]*\bhref="([^"]+)"[^>]*>/g,
              (tag, source: string) => {
                if (source !== `./${filename}`) return tag;
                replaced = true;
                return `<style>${String(asset.source).replace(/<\/style/gi, "<\\/style")}</style>`;
              },
            );
            if (!replaced) throw new Error(`未找到页面样式：${filename}`);
          } else {
            throw new Error(`单文件页面存在外部资源：${filename}`);
          }
          delete bundle[filename];
        }
        page.source = html;
      },
    },
  };
}
