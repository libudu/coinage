# 开发指南

## 项目

Coinage 是纯前端造字工具，使用 React、TypeScript、Vite 和 Tailwind CSS。图片在本机处理，手稿保存在浏览器 localStorage；界面保持简洁中文，不添加无关说明文案。

## 目录

```text
src/
├── main.tsx                    # React 入口与全局样式加载
├── app/App.tsx                 # 工作台组装、字符集、导入导出与全局快捷键
├── core/model.ts               # 数据类型、字形几何、SVG 输出、校验与示例数据
├── core/brush.ts               # 笔锋预设、全局配置、旧数据迁移与端部轮廓
├── features/
│   ├── editor/
│   │   ├── EditorCanvas.tsx    # 画布、节点、分支、控制柄和钢笔交互
│   │   ├── Properties.tsx      # 节点、笔画、连接关系和外观属性
│   │   ├── BrushControls.tsx   # 全局起收笔与快捷预设
│   │   ├── BrushTuning.tsx     # 折叠式笔锋长度、张开调节与拖动历史
│   │   └── GlyphPreview.tsx    # 字形缩略预览
│   ├── tracing/
│   │   ├── ImportDialog.tsx    # 图片导入与识别参数预览
│   │   ├── trace.ts            # 前景分离、骨架提取、路径简化与图片读取
│   │   └── trace.worker.ts     # 后台转换入口
│   └── project/useProject.ts   # 手稿状态、撤销重做和本地保存
├── shared/
│   ├── components/             # Icon.tsx 图标；controls.tsx 通用控件
│   └── utils/files.ts          # 文件下载与文件名处理
├── styles/index.css            # 全局样式、工作台布局和响应式规则
└── static/                     # 原始素材：文字/、笔锋/
public/reference.png            # 可直接访问的导入示例
tests/core.test.ts              # 几何、描摹、导出与数据校验测试
```

## 开发约定

- 新业务代码放入对应 `features` 子目录；跨功能复用的控件或工具放 `shared`。`app` 负责组装，`core` 不依赖 React 或业务界面。
- 使用 TypeScript 和显式的相对导入；类型使用 `import type`。调整目录时同步更新测试、README 和本文档中的路径。
- 节点按 ID 存储，多条笔画可引用同一节点。修改几何或连接关系时保持引用有效，尊重笔画锁定状态。
- 通过 `useProject` 的更新接口修改手稿；连续拖拽作为一次撤销操作，不逐帧写入历史。
- 手稿级笔锋存于 `Project.brush`，所有笔画统一使用全局配置，锁定仅保护几何和连接关系；全局修改通过 `changeGlobalBrush`，加载与导入通过 `migrateProjectBrush` 清理旧的局部笔锋字段。画布、缩略图和导出均传入全局配置。
- 保持 `coinage.studio.v1` 本地存储和 `Project.version` 的兼容性；修改数据格式时同步更新校验并处理旧手稿迁移。
- 描摹计算放在 Worker 中；保留 `new Worker(new URL("./trace.worker.ts", import.meta.url), { type: "module" })` 的 Vite 打包方式。SVG 导出使用真实路径。
- 保留已有素材及其文件名；未经需求授权，不引入后端或上传用户图片。
