# Coinage

简洁的 React + TypeScript + Tailwind CSS 前端脚手架，使用 Vite 开发和构建。

## 启动

Node.js 20.19+（20.x）或 22.12+。

```bash
npm install
npm run dev
```

打开终端中显示的本地地址，默认是 http://localhost:5173。

## 常用命令

- `npm run dev`：启动开发服务，支持热更新。
- `npm run build`：检查 TypeScript 类型并打包到 `dist/`。
- `npm run preview`：本地预览打包结果，需先运行构建。

## 开始开发

- `src/App.tsx`：首页组件，直接在这里开始写页面。
- `src/main.tsx`：React 入口。
- `src/index.css`：Tailwind CSS 入口和全局样式。
- `vite.config.ts`：Vite、React 和 Tailwind 插件配置。

在 TSX 中使用 `className` 编写 Tailwind 样式。页面增多后可按需添加 `src/pages/` 和 `src/components/` 目录。
