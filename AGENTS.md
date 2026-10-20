# 开发指南

## 项目

Coinage 是本地造字工具，使用 React、TypeScript、Vite 和 Tailwind CSS。图片在浏览器中处理，轻量 Node 本地服务把手稿保存为 JSON 文件。界面保持简洁中文，不添加无关说明文案。

## 目录

```text
src/
├── main.tsx                    # React 入口与全局样式加载
├── app/
│   ├── App.tsx                # 页面切换、工作台组装、菜单与弹窗状态
│   ├── AppNavigation.tsx      # 左侧字库、造字与特效导航
│   └── App.css                # 提示动画关键帧，由 App.tsx 导入
├── core/
│   ├── model.ts               # 数据类型、ID 与空字形/笔画工厂
│   ├── geometry.ts            # 几何工具、中心线、连接关系与填充轮廓
│   ├── svg.ts                 # SVG 文档输出与 XML 转义
│   ├── validation.ts          # 手稿格式与节点引用校验
│   ├── projectPatch.ts        # 按 ID 和字段生成、校验与合并增量补丁
│   ├── demo.ts                # 初始示例手稿
│   └── brush.ts               # 笔锋预设、全局配置与端部轮廓
├── features/
│   ├── library/
│   │   └── GlyphLibrary.tsx   # 造句预览、缺字空格与全部字形入口
│   ├── editor/
│   │   ├── EditorCanvas.tsx    # 画布视口、工具栏、标尺与视图快捷键
│   │   ├── EditorCanvas.css    # 画布纹理、标尺背景与组合光标状态
│   │   ├── canvasTypes.ts     # 画布工具与组件接口
│   │   ├── useCanvasInteraction.ts # 节点、分支、控制柄、钢笔与拖拽事务
│   │   ├── GlyphArtwork.tsx   # SVG 字形、节点与控制柄渲染
│   │   ├── GlyphSidebar.tsx   # 字符集与笔画列表
│   │   ├── AddGlyphMenu.tsx   # 新建空白字符与图片导入菜单
│   │   ├── useEditorCommands.ts # 删除、复制、撤销重做与编辑快捷键
│   │   ├── nodeSelection.ts    # 节点集合、锁定保护、整体位移与批量删除
│   │   ├── Properties.tsx      # 节点、笔画、笔锋和外观属性
│   │   ├── GlyphExport.tsx     # 属性栏导出按钮与格式菜单状态
│   │   ├── EditorContextMenu.tsx # 字符、笔画与节点操作右键菜单
│   │   ├── GlyphBasicInfoDialog.tsx # 字符对应汉语与描述编辑弹窗
│   │   ├── BrushControls.tsx   # 全局起收笔与快捷预设
│   │   ├── BrushTuning.tsx     # 折叠式笔锋长度、张开调节
│   │   ├── TransactionalRange.tsx # 手稿滑块的指针、键盘与事务边界
│   │   └── GlyphPreview.tsx    # 字形缩略预览
│   ├── tracing/
│   │   ├── ImportDialog.tsx    # 图片导入与识别参数预览
│   │   ├── trace.ts            # 前景分离、骨架提取、路径简化与图片读取
│   │   ├── traceSettings.ts    # 导入参数的本地记忆与校验读取
│   │   ├── createTraceWorker.ts # 描摹 Worker 工厂
│   │   └── trace.worker.ts     # 后台转换入口
│   └── project/
│       ├── projectStore.ts    # Zustand 手稿、会话、历史与编辑事务
│       ├── projectAutosave.ts # 已提交手稿的三秒节流保存、重试与状态
│       ├── useProject.tsx     # 状态 Provider、按需订阅与控件事务
│       ├── projectStorage.ts  # 本地服务增量存储、确认基线、重试与保存队列
│       └── useProjectFiles.ts # 图片读取、应急 JSON 副本及 SVG/PNG 导出
├── server/
│   ├── app.ts                 # 本机 API、手稿校验、版本冲突与原子文件写入
│   └── index.ts               # 静态托管、端口与重复启动检查、打开浏览器
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
tests/nodeSelection.test.ts     # 多节点移动、边界、锁定与删除测试
tests/server.test.ts            # 本地读写、备份、版本冲突与访问限制测试
tests/projectStorage.test.ts    # 初始化、增量保存队列与错误测试
tests/projectPatch.test.ts      # 字段增量、原图省略、顺序与补丁校验测试
tests/projectStore.test.ts      # 状态、事务、历史、选择与锁定测试
tests/projectAutosave.test.ts   # 保存触发、重试、冲突与过期响应测试
tests/editorTransactions.test.ts # jsdom 组件事件与事务边界回归测试
tests/workspaceNavigation.test.ts # 字库预览、基本信息、页面切换与快捷键隔离测试
tests/support/domLoader.mjs     # 组件测试中的样式导入适配
tests/package.smoke.ts          # 解压分发 ZIP 后验证便携 Node、重启与端口
tests/packageZip.test.ts        # 分发清单、中文文件名、排除手稿与 ZIP 替换测试
scripts/package.mjs             # 复制 Windows Node 与许可证，生成便携目录和版本 ZIP
scripts/createPackageZip.mjs    # 只打包运行所需文件，保留空 data 目录
dist-template/双击运行.bat       # 使用包内 Node 启动
vite.server.config.ts           # 无第三方运行依赖的服务端打包
```

## 开发约定

### 代码与样式

- 使用 pnpm，版本见 `package.json#packageManager`；只维护 `pnpm-lock.yaml`，不生成或提交 `package-lock.json`。文档命令也使用 pnpm。
- 使用 TypeScript、显式相对导入和 `import type`；说明性注释用中文。目录变更同步更新测试、README 和本索引。
- 业务代码放对应 `features`，复用控件和工具放 `shared`，`app` 负责组装，`core` 不依赖 React。核心模块按职责直接导入，不通过 `model` 汇总。
- 常规样式使用 JSX Tailwind 类。自定义 CSS 就近放置、显式导入并限定类名范围；`src/styles` 仅放全局规则，重置放 `base` 层。
- 响应式沿用 `wide`（≥1600px）、`laptop`（≤1150px）、`tablet`（≤900px）、`compact`（≤760px）、`phone`（≤490px），保留包含边界和覆盖顺序。
- 滑块统一用 `RangeInput`，笔锋微调用 `row` 变体；保留原生属性、ref 和事件透传，不用全局 range 选择器设置业务外观。

### 状态与编辑

- 状态由每个 `ProjectProvider` 独立持有；通过 `projectStore` actions 修改，组件用 `useProject(selector)` 按需订阅、`useProjectActions` 获取操作，不逐层传递整份 store/doc。
- 用 Immer 保留未变分支引用；字形、节点、笔画按 ID 派生，不重复存储。共享节点引用须有效，锁定保护几何和连接关系。
- 连续拖拽、滑块、改名使用事务，每次只记一条历史；控件复用 `useEditTransaction`，手稿滑块用 `TransactionalRange`。指针只结束自身事务，过期 token 禁止写入；分支实际移动后才创建，回源点时移除。
- 历史保留 60 步，新提交清空重做，取消或无变化不记历史。选择、工具、原图显示属于会话，不进入历史或保存。
- 撤销重做、字符或选择目标切换须结束旧事务并清理失效选择；撤销优先保留当前仍存在的字符。事务内选中新建节点须传入所属 token。
- 笔锋统一存于 `Project.brush`，通过 `changeGlobalBrush` 修改。画布、缩略图、导出共用配置，笔画锁定不阻止全局笔锋修改。

### 保存与数据

- `projectAutosave` 只订阅已提交手稿，采用三秒节流：窗口内合并最新修改，后续提交不推迟计时；请求期间的新提交仍遵循三秒窗口。隐藏页面或 Ctrl+S 时先提交事务再立即 flush。
- 保留重试、离页保护和过期响应检查；并发 flush 共享保存结果，`projectStorage` 负责串行队列和 revision。失败提示持续到保存成功，撤销回旧快照不能视为已保存。
- 先从 `/api/project` 加载再挂载编辑器；读取失败禁止用示例覆盖，文件不存在时才创建初始手稿，不读取浏览器手稿存储。
- 软件尚未发布，仅支持当前数据结构，不增加历史格式迁移或兼容分支；格式变更同步调整类型、校验和测试。`Project` 不包含名称字段，字符与笔画名称仍保留。
- 首次创建文件使用 PUT；后续基于已确认快照生成 PATCH，按字符与笔画 ID 定位、独立提交顺序，仅发送变化字段，未变化原图不得重传；无变化不请求。响应不明确时保留同一请求及 requestId，先确认基线，再保存后续修改；409 后停止覆盖。
- 服务端串行校验 revision；仅同一请求、相同内容且磁盘仍为该次结果时确认重复 PATCH。合并后校验完整手稿和 64 MB 上限，再原子落盘。
- 手稿写入 `data/project.json`，保留版本比较、串行写入、临时文件替换及 `project.backup.json`。常规界面导出 SVG/PNG，保存失败提供应急 JSON 副本。
- 服务仅监听 `127.0.0.1`，不增加数据库或服务端运行依赖。开发数据在根目录 `data/`，发布数据在 `dist/data/`，均不入库、不随构建清理；发布路径按服务文件位置定位。

### 构建与资源

- 除非修改构建配置、构建脚本或打包流程，否则不要运行 build 命令；普通业务、界面、样式和文档修改不构建。
- 构建产物为 `dist/client`、`dist/server`、`dist/runtime`、`双击运行.bat` 和根目录 `Coinage v<版本号>.zip`，运行只需包内 Node。
- ZIP 按运行文件清单打包，仅附空 `data/`，排除手稿、备份和旧产物；失败保留上一完整 ZIP。JSZip 仅作开发依赖；Node 及 LICENSE 默认取自构建机器，可用 `COINAGE_NODE_PATH` 指定 Windows Node。
- 资源使用可打包导入，不依赖外网；保留素材及文件名。图片只在浏览器处理，不上传；描摹放 Worker，保留 `new Worker(new URL("./trace.worker.ts", import.meta.url), { type: "module" })`；SVG 导出真实路径。
