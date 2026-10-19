# 开发指南

## 项目

Coinage 是纯前端造字工具，使用 React、TypeScript、Vite 和 Tailwind CSS。图片在本机处理，手稿保存在浏览器 localStorage；界面保持简洁中文，不添加无关说明文案。

## 目录

```text
src/
├── main.tsx                    # React 入口与全局样式加载
├── app/
│   ├── App.tsx                # 工作台组装、菜单、字符切换与弹窗状态
│   └── App.css                # 提示动画关键帧，由 App.tsx 导入
├── core/
│   ├── model.ts               # 数据类型、ID 与空字形/笔画工厂
│   ├── geometry.ts            # 几何工具、中心线、连接关系与填充轮廓
│   ├── svg.ts                 # SVG 文档输出与 XML 转义
│   ├── validation.ts          # 手稿格式与节点引用校验
│   ├── demo.ts                # 初始示例手稿
│   └── brush.ts               # 笔锋预设、全局配置、旧数据迁移与端部轮廓
├── features/
│   ├── editor/
│   │   ├── EditorCanvas.tsx    # 画布视口、工具栏、标尺与视图快捷键
│   │   ├── EditorCanvas.css    # 画布纹理、标尺背景与组合光标状态
│   │   ├── canvasTypes.ts     # 画布工具与组件接口
│   │   ├── useCanvasInteraction.ts # 节点、分支、控制柄、钢笔与拖拽历史
│   │   ├── GlyphArtwork.tsx   # SVG 字形、节点与控制柄渲染
│   │   ├── GlyphSidebar.tsx   # 字符集与笔画列表
│   │   ├── useEditorCommands.ts # 删除、复制、撤销重做与编辑快捷键
│   │   ├── Properties.tsx      # 节点、笔画、笔锋和外观属性
│   │   ├── EditorContextMenu.tsx # 字符、笔画与节点操作右键菜单
│   │   ├── BrushControls.tsx   # 全局起收笔与快捷预设
│   │   ├── BrushTuning.tsx     # 折叠式笔锋长度、张开调节与拖动历史
│   │   └── GlyphPreview.tsx    # 字形缩略预览
│   ├── tracing/
│   │   ├── ImportDialog.tsx    # 图片导入与识别参数预览
│   │   ├── trace.ts            # 前景分离、骨架提取、路径简化与图片读取
│   │   ├── createTraceWorker.ts # 标准网页 Worker 工厂
│   │   ├── createTraceWorker.offline.ts # 离线包内嵌 Worker 工厂
│   │   └── trace.worker.ts     # 后台转换入口
│   └── project/
│       ├── useProject.ts      # 手稿状态、撤销重做和本地保存
│       └── useProjectFiles.ts # 图片读取、JSON 导入及 JSON/SVG/PNG 导出
├── shared/
│   ├── components/
│   │   ├── Icon.tsx           # 图标
│   │   ├── controls.tsx       # 通用控件与共享按钮/分段选择状态类
│   │   ├── RangeInput.tsx     # 标准滑块与扩大拖动区域的行式滑块
│   │   └── RangeInput.css     # 带专属类名的浏览器滑块伪元素
│   └── utils/files.ts          # 文件下载与文件名处理
├── styles/
│   ├── index.css              # Tailwind 入口与保留原边界的断点变体
│   └── base.css               # 全局重置、主题变量、最小页面宽度与减少动画规则
└── static/                     # 原始素材：文字/、笔锋/
public/reference.png            # 可直接访问的导入示例
tests/core.test.ts              # 几何、描摹、导出与数据校验测试
```

## 开发约定

- 新业务代码放入对应 `features` 子目录；跨功能复用的控件或工具放 `shared`。`app` 负责组装，`core` 不依赖 React 或业务界面。
- 按职责直接导入核心模块：数据类型与工厂用 `model`，路径计算用 `geometry`，SVG 文档用 `svg`，手稿校验用 `validation`，示例数据用 `demo`；不在 `model` 中重新汇总这些模块。
- 使用 TypeScript 和显式的相对导入；类型使用 `import type`。调整目录时同步更新测试、README 和本文档中的路径。
- 样式优先使用 Tailwind CSS；仅在使用 Tailwind CSS 实现较为繁琐时编写自定义 CSS。
- 组件常规样式写在 JSX 的 Tailwind 类中；语义类名用于组合状态和少量复杂选择器。响应式使用 `wide`（≥1600px）、`laptop`（≤1150px）、`tablet`（≤900px）、`compact`（≤760px）、`phone`（≤490px），保留现有断点的包含边界及覆盖顺序。全局重置放在 `base` 层，避免覆盖工具类。
- `src/styles` 只放全局规则。模块专属样式优先写成组件内的 Tailwind 类；确需自定义 CSS 时与组件就近放置、由组件显式导入，并使用专属类名限定范围。跨模块复用的样式与控件归 `shared`，不要为少量可直接表达的样式另建 CSS 文件。
- 滑块统一使用 `shared/components/RangeInput.tsx`，笔锋微调使用其 `row` 变体；保留原生 input 的属性、ref 和事件透传，不通过全局 `input[type="range"]` 选择器设置业务外观。
- 节点按 ID 存储，多条笔画可引用同一节点。修改几何或连接关系时保持引用有效，尊重笔画锁定状态。
- 通过 `useProject` 的更新接口修改手稿；连续拖拽作为一次撤销操作，不逐帧写入历史。
- 手稿级笔锋存于 `Project.brush`，所有笔画统一使用全局配置，锁定仅保护几何和连接关系；全局修改通过 `changeGlobalBrush`，加载与导入通过 `migrateProjectBrush` 清理旧的局部笔锋字段。画布、缩略图和导出均传入全局配置。
- 保持 `coinage.studio.v1` 本地存储和 `Project.version` 的兼容性；修改数据格式时同步更新校验并处理旧手稿迁移。
- 描摹计算放在 Worker 中；保留 `new Worker(new URL("./trace.worker.ts", import.meta.url), { type: "module" })` 的 Vite 打包方式。SVG 导出使用真实路径。
- 离线构建使用 `npm run build:offline`，输出 `dist/offline/Coinage.html`；仅此构建将 Worker 工厂替换为 `?worker&inline` 版本。运行时资源须使用可打包的导入，不能写死根路径或依赖网络；保留标准网页构建。
- 保留已有素材及其文件名；未经需求授权，不引入后端或上传用户图片。
