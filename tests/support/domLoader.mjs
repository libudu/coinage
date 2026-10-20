// 组件回归测试由 jsdom 渲染，CSS 另由 Vite 构建。
export async function load(url, context, nextLoad) {
  if (url.endsWith(".css")) return { format: "module", source: "export {};", shortCircuit: true };
  return nextLoad(url, context);
}
