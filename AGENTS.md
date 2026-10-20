# 开发指南

## 项目

Coinage 是本地造字工具，使用 React、TypeScript、Vite 和 Tailwind CSS。图片在浏览器中处理，轻量 Node 本地服务把手稿保存为 JSON 文件。界面保持简洁中文，不添加无关说明文案。

## 目录

```text
src/
├── main.tsx                    # React 入口与全局样式加载
├── app/
│   ├── App.tsx                # 页面切换、工作台组装、菜单与弹窗状态
│   └── AppNavigation.tsx      # 左侧字库、造字与特效导航
├── core/
│   ├── model.ts               # 数据类型、ID 与空字形/笔画工厂
│   ├── geometry.ts            # 几何工具、中心线、连接关系与填充轮廓
│   ├── strokeEditing.ts       # 边控制柄与普通编辑、拓扑变化的同步
│   ├── svg.ts                 # SVG 文档输出与 XML 转义
│   ├── validation.ts          # 手稿格式与节点引用校验
│   ├── importSettings.ts      # 导入参数、裁剪偏移默认值与前后端校验
│   ├── filenameInfo.ts        # 文件名占位符模板、字段提取与未匹配回退
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
│   │   ├── strokeEdges.ts      # 笔画边定位、中点插入与曲线拆分
│   │   ├── Properties.tsx      # 节点、笔画、笔锋和外观属性
│   │   ├── GlyphExport.tsx     # 属性栏导出按钮与格式菜单状态
│   │   ├── EditorContextMenu.tsx # 字符、笔画与节点操作右键菜单
│   │   ├── GlyphBasicInfoDialog.tsx # 字符对应汉语与描述编辑弹窗
│   │   ├── ShortcutsDialog.tsx  # 快捷键帮助弹窗
│   │   ├── useContextMenuActions.ts # 右键菜单的字形、笔画和节点编辑动作
│   │   ├── GlyphDeleteDialog.tsx # 字符删除二次确认弹窗
│   │   ├── BrushControls.tsx   # 全局起收笔与快捷预设
│   │   ├── BrushTuning.tsx     # 折叠式笔锋长度、张开调节
│   │   ├── TransactionalInput.tsx # 手稿文本与数值输入的事务、撤销和目标隔离
│   │   ├── TransactionalRange.tsx # 手稿滑块的指针、键盘与事务边界
│   │   └── GlyphPreview.tsx    # 字形缩略预览
│   ├── tracing/
│   │   ├── ImportDialog.tsx    # 图片导入与识别参数预览
│   │   ├── trace.ts            # 前景分离、骨架提取、路径简化与图片读取
│   │   ├── traceSettings.ts    # 后端导入参数读取与串行保存
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
│   │   ├── Button.tsx         # 标准、主操作、危险和无外观按钮
│   │   ├── ArtboardGrid.tsx   # 编辑与导入预览共用的画布格线
│   │   ├── Modal.tsx          # 原生弹窗、焦点管理和统一关闭行为
│   │   ├── Menu.tsx           # 下拉与右键菜单、键盘导航和焦点恢复
│   │   ├── Toast.tsx          # 独立提示状态、类型与计时
│   │   ├── Toast.css          # 提示入场动画
│   │   ├── Icon.tsx           # 图标
│   │   ├── Input.tsx          # 文本输入外观与原生属性、事件和 ref 透传
│   │   ├── NumberInput.tsx    # 即时数值输入、草稿确认与取消
│   │   ├── NumberField.tsx    # 带标签和单位的数值输入，无业务默认边界
│   │   ├── SegmentedControl.tsx # 分段选择、混合值、禁用和键盘导航
│   │   ├── controls.tsx       # 图标按钮与属性分区
│   │   ├── RangeInput.tsx     # 标准滑块与扩大拖动区域的行式滑块
│   │   └── RangeInput.css     # 带专属类名的浏览器滑块伪元素
│   └── utils/
│       ├── keyboard.ts         # 弹层共用的保存快捷键判断
│       ├── files.ts            # 文件下载与文件名处理
│       └── localSettings.ts    # 前端 localStorage 配置、默认值、校验与安全读写
├── styles/
│   ├── index.css              # Tailwind 入口与保留原边界的断点变体
│   └── base.css               # 全局重置、主题变量、最小页面宽度与减少动画规则
└── static/                     # 原始素材：文字/、笔锋/
public/reference.png            # 可直接访问的导入示例
tests/core.test.ts              # 几何、描摹、导出与数据校验测试
tests/nodeSelection.test.ts     # 多节点移动、边界、锁定与删除测试
tests/strokeEdges.test.ts       # 边定位、共享曲线与笔锋、中点持久化与历史回归测试
tests/server.test.ts            # 本地读写、备份、版本冲突与访问限制测试
tests/projectStorage.test.ts    # 初始化、增量保存队列与错误测试
tests/projectPatch.test.ts      # 字段增量、原图省略、顺序与补丁校验测试
tests/projectStore.test.ts      # 状态、事务、历史、选择与锁定测试
tests/projectAutosave.test.ts   # 保存触发、重试、冲突与过期响应测试
tests/editorTransactions.test.ts # jsdom 组件事件与事务边界回归测试
tests/canvasGeometry.test.ts     # 插点后的实际指针拖动、控制柄、往返与历史回归测试
tests/canvasWheel.test.ts        # 滚轮粗细、事务、锁定与画布视图回归测试
tests/canvasSelection.test.ts    # 框选、追加选择、坐标变换、取消与整体拖动回归测试
tests/importPreview.test.ts      # 导入粗细实时预览、识别隔离与原图对齐测试
tests/importSettings.test.ts     # 导入参数校验、后端读写队列与重试测试
tests/filenameInfo.test.ts       # 文件名模板、字段顺序、字面匹配与无效模板测试
tests/workspaceNavigation.test.ts # 字库预览、基本信息、页面切换与快捷键隔离测试
tests/formControls.test.ts       # 文本、数值、分段选择与手稿输入事务回归测试
tests/sharedComponents.test.ts   # 公共弹窗、菜单、按钮、提示及导出反馈回归测试
tests/localSettings.test.ts      # 前端配置默认值、持久化、无效数据与存储异常测试
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
- 格式统一使用项目内安装的 Prettier 和根目录 `.prettierrc.json`。每轮修改完成后，必须对本次新增或修改且受 Prettier 支持、未被 `.prettierignore` 忽略的文件执行 `pnpm exec prettier --write <文件路径列表>`，格式化后再执行必要检查；不要顺带格式化无关文件。`pnpm run format` 和 `pnpm run format:check` 分别用于显式的全项目格式化与检查。
- 使用 TypeScript、显式相对导入和 `import type`；说明性注释用中文。目录变更同步更新测试、README 和本索引。
- 业务代码放对应 `features`，复用控件和工具放 `shared`，`app` 负责组装，`core` 不依赖 React。核心模块按职责直接导入，不通过 `model` 汇总。
- 常规样式使用 JSX Tailwind 类。自定义 CSS 就近放置、显式导入并限定类名范围；`src/styles` 仅放全局规则，重置放 `base` 层。
- 响应式沿用 `wide`（≥1600px）、`laptop`（≤1150px）、`tablet`（≤900px）、`compact`（≤760px）、`phone`（≤490px），保留包含边界和覆盖顺序。
- 弹窗、菜单和操作按钮复用 `shared/components` 中的 `Modal`、`Menu` 和 `Button`；提示通过独立 `ToastProvider` / `useToast` 发出。弹层隔离编辑快捷键，保留 Ctrl+S；业务编辑动作留在对应 feature。业务按钮（含导航、列表、分段选择与启动失败重试）统一用 `Button`，自定义外观用 `bare` 变体；仅公共组件内部直接渲染原生 button。弹层隔离不能阻断按键释放的清理，中文输入法组合键不触发关闭。
- 文本输入复用 `Input`，数值输入复用 `NumberInput` / `NumberField`，互斥选项复用 `SegmentedControl`；业务范围由调用方显式传入。共享控件不依赖手稿 store 或几何模块；手稿文本、坐标与宽度输入通过 `TransactionalInput` 中的 editor 适配器管理事务和过期事件，局部表单和偏好输入保留局部状态。
- 滑块统一用 `RangeInput`，笔锋微调用 `row` 变体；保留原生属性、ref 和事件透传，不用全局 range 选择器设置业务外观。

### 状态与编辑

- 状态由每个 `ProjectProvider` 独立持有；通过 `projectStore` actions 修改，组件用 `useProject(selector)` 按需订阅、`useProjectActions` 获取操作，不逐层传递整份 store/doc。
- 用 Immer 保留未变分支引用；字形、节点、笔画按 ID 派生，不重复存储。共享节点引用须有效，锁定保护几何和连接关系。
- 中点拆分的控制柄存于 `Stroke.segments`，按边的引用隔离，不改写共享节点；采样区间与笔锋边界随手稿保存，普通编辑通过 `strokeEditing` 同步。
- 连续编辑从事务开始时的边几何重算；拖回原位须恢复控制柄、采样和笔锋边界，不新增历史或清空重做。笔画复制采用整体受限平移，不能逐节点裁剪坐标。
- 连续拖拽、滑块、改名使用事务，每次只记一条历史；控件复用 `useEditTransaction`，手稿滑块用 `TransactionalRange`。指针只结束自身事务，过期 token 禁止写入；分支实际移动后才创建，回源点时移除。
- 历史保留 60 步，新提交清空重做，取消或无变化不记历史。选择、工具、原图显示属于会话，不进入历史或保存。
- 撤销重做仅针对造字编辑。字符新建、导入、基本信息编辑、复制和删除同步到历史快照，不新增历史或清空有效重做；删除字符时清理仅影响该字符的历史。字符删除须二次确认且无法撤销，节点和笔画删除仍可撤销。
- 撤销重做、字符或选择目标切换须结束旧事务并清理失效选择；撤销优先保留当前仍存在的字符。事务内选中新建节点须传入所属 token。
- 笔锋统一存于 `Project.brush`，通过 `changeGlobalBrush` 修改。画布、缩略图、导出共用配置，笔画锁定不阻止全局笔锋修改。

### 保存与数据

- `projectAutosave` 只订阅已提交手稿，采用三秒节流：窗口内合并最新修改，后续提交不推迟计时；请求期间的新提交仍遵循三秒窗口。隐藏页面或 Ctrl+S 时先提交事务再立即 flush。
- 保留重试、离页保护和过期响应检查；并发 flush 共享保存结果，`projectStorage` 负责串行队列和 revision。失败提示持续到保存成功，撤销回旧快照不能视为已保存。
- 先从 `/api/project` 加载再挂载编辑器；读取失败禁止用示例覆盖，文件不存在时才创建初始手稿，不读取浏览器手稿存储。
- 前端偏好通过 `shared/utils/localSettings.ts` 统一存入 `coinage.settings`，与手稿和操作历史分离；读取须校验并提供默认值，存储异常不阻断界面。造句字格默认开启，关闭时仅隐藏成功匹配字符的字格。
- 图片导入参数通过 `/api/import-settings` 保存在后端 `data/import-settings.json`，独立于手稿；先加载再编辑，读取失败禁止默认值覆盖，写入串行并采用临时文件原子替换。默认粗细为 24 px；边缘裁剪使用单条百分比滑条，默认 0，从补齐短边的居中正方形向内裁剪，X/Y 偏移使用 -100–100 px 单端滑条；笔画和原图共用受边界约束的整体位移。文件名提取模板同属导入配置，默认 `{desc*}_{name}`，去掉图片扩展名后提取对应汉语和描述；占位符默认尽量少取，末尾加 `*` 可尽量多取，多个字段从左到右匹配，其他字符原样匹配。实时预览与最终导入一致，修改模板不重新描摹；留空直接使用文件名，模板无效或未匹配时提示并回退到完整文件名与空描述。
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
