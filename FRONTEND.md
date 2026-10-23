# 学途 PathPilot · 前端 README（分工版）

面向需要接手前端代码的队友：读完第 0—3 节即可动手，第 4 节以后按工作包与契约查。

产品说明、功能清单与演示边界见根目录 `README.md`；课程层面的方案设计、7 阶段工作流与 6 人阶段分工见 `../docs/方向A-技术栈分工与前端提示词.md` 与 `../docs/方向A-Vue3响应式前端生成提示词.md`。

一条贯穿全篇的硬规则：本仓按「禁止超前设计」编写，只为当前页面的当前需求写代码。不要引入后端接口、服务层、请求封装、模型适配器、空实现、UI 组件库或占位异步。汇报需要的内容写进文档，不写进工程。

## 0. 怎么读这份文档

| 你的角色 | 先读 | 然后 |
| --- | --- | --- |
| 刚接手前端 | 第 1、2、3 节 | 按第 5 节领工作包 |
| 只改一个页面 | 第 3 节页面地图、第 4 节文件表 | 第 5.4 节「文件独占表」确认没有人和你同时改同一文件 |
| 对接后端 / Agent 成员 | 第 6 节交付契约 | 第 11 节缺口清单 |
| 负责验收与汇报 | 第 9 节验收清单 | 第 10 节演示路径 |

## 1. 当前状态（本次核对结论）

| 项 | 状态 |
| --- | --- |
| 技术栈 | TypeScript 5.9 + Vue 3.5 + Vite 7；vue-router 4（Hash 模式）；Pinia 3；ECharts 6（SVG 渲染，按需引入）；@lucide/vue 图标 |
| 页面 | 6 个真实路由 + 404，全部可访问（`/`、`/plan`、`/analysis`、`/roadmap`、`/adjust`、`/history`） |
| 代码规模 | `src/` 20 个文件 1536 行（其中 `style.css` 750 行、`planning.test.ts` 99 行）；`tests/` 1 个文件 129 行 8 条用例 |
| 类型检查 | `npm run typecheck`（vue-tsc）通过，0 错误 |
| 单元测试 | `npm test` 通过，`src/planning.test.ts` 12/12 |
| 构建 | `dist/` 已有产物；图表单独分块 `charts-*.js` ≈ 486 KB，其余主包 ≈ 128 KB |
| 浏览器回归 | 8 条 Playwright 用例已写好，依赖本机 Chrome 与 5173 端口开发服务；本轮未重跑 |
| 数据与边界 | 12 条标注为演示的招聘样本（前端 6 / 后端 6）；无后端、无 AI 调用、无网络请求；数据存 `localStorage` |
| 版本管理 | 目录尚不是 Git 仓库；`.gitignore` 已就绪（忽略 `node_modules/`、`dist/`、`tmp/`、`test-results/`、`playwright-report/`） |
| 运行环境 | 已在 Node.js 22.20 / npm 10.9 验证；`package.json` 要求 Node 22.12+；锁文件 `package-lock.json` |

## 2. 一分钟跑起来

```sh
npm install
npm run dev        # http://127.0.0.1:5173/
```

| 命令 | 用途 | 关键说明 |
| --- | --- | --- |
| `npm run dev` | 本地开发 | 固定 `--host 127.0.0.1`；端口被占用时 Vite 会换端口，要固定加 `-- --port 5173 --strictPort` |
| `npm run typecheck` | 类型检查 | 必须单独跑；Vite 构建不做完整类型检查 |
| `npm test` | 规则单元测试 | Vitest，只收集 `src/**/*.test.ts` |
| `npm run test:e2e` | 浏览器回归 | 必须先起 5173 开发服务；用本机 Chrome（`playwright.config.ts` 的 `channel: 'chrome'`）；首跑会在 `output/screenshots/` 生成 390 / 768 / 1440 三档整页截图 |
| `npm run build` | 生产构建 | 先 `vue-tsc --noEmit` 再 `vite build`，产物 `dist/` |
| `npm run preview` | 预览产物 | 静态文件必须经 HTTP 服务访问，不要双击 `dist/index.html` |

部署口径：`vite.config.ts` 中 `base: './'` + Hash 路由，可直接放在任意静态子目录；路由地址形如 `/#/roadmap`，直接访问 `/roadmap` 会 404。

## 3. 页面地图与数据流

### 3.1 路由与页面职责

| 路由 | 文件 | 页面职责 | 页面状态来源 |
| --- | --- | --- | --- |
| `/` | `src/views/Home.vue` | 首页：品牌、主标题、「开始我的规划 / 继续我的规划」、「载入演示画像」、四步流程说明 | `store.hasDraft` |
| `/plan` | `src/views/Wizard.vue` | 六步画像向导 + 岗位样本选择；第 5 步后有「基础画像已完成」过渡页 | `store.profile`、`store.step`、`store.selectedIds` |
| `/analysis` | `src/views/Analysis.vue` | 岗位能力清单（技能 / 学历条件 / 项目经验三个标签页）、频次图表、技能→课程→成果映射、招聘原文证据 | `store.selectedJobs` 或 `?plan=<id>` 快照样本；`?skill=<id>` 深链选中项 |
| `/roadmap` | `src/views/Roadmap.vue` | 8 学期手风琴路线、任务卡（成果 / 验收 / 课程 / 前置 / 依据）、完成勾选、待安排区、导出 Markdown | `store.activePlan`、`store.completed`、`store.stale` |
| `/adjust` | `src/views/Adjust.vue` | 改目标岗位 / 每周时间 / 发展路径后重算，展示「保留 / 推迟 / 新增 / 移除」差异与原因、一键演示 12→6 小时 | 挂载时深拷贝 `store.activePlan`，新方案写入 `store.plans` |
| `/history` | `src/views/History.vue` | 方案版本列表、勾选两份做差异对比、查看 / 删除 | `store.plans`、`store.activeId` |
| 其他 | `src/views/NotFound.vue` | 404 兜底 | — |

### 3.2 数据流

1. `Home`：「载入演示画像」调用 `store.loadDemo()`；「开始规划」直接进 `/plan`。
2. `Wizard`：六步边填边改 `store.profile`（`store` 里的 deep watch 自动写入 `localStorage`）；第 6 步选择岗位样本。
3. 点「分析岗位并生成路线」→ `store.generate(profile, selectedIds)` → `planning.createPlan(profile, jobs, 现有最大版本 + 1)` → 新方案 `unshift` 进 `store.plans`，`activeId` 指向它，跳转 `/roadmap`。
4. 之后四个页面都只读已保存的快照：
   - `/roadmap` 读 `store.activePlan` 渲染；完成勾选写 `store.completed[planId]`；导出在前端拼 Markdown 后触发下载。
   - `/analysis?plan=<id>` 用该方案的 `jobIds` 复算证据，不改当前画像草稿；不带 `plan` 参数时读 `store.selectedJobs`。
   - `/adjust` 挂载时深拷贝 `activePlan` 作为「原方案」、再拷一份画像作为 `draft`；点「调整成长方案」重新走一次 `generate`，用 `diffPlans(原方案, 新方案)` 出差异。
   - `/history` 列全部 `store.plans`；勾选两份时直接 `diffPlans` 对比。

页面之间的跳转（改导航或任务卡时别断链）：路线任务卡的「查看岗位依据」→ `/analysis?skill=<id>&plan=<id>`；调整页「查看完整新路线」→ `/roadmap`；历史卡「查看这份路线」→ `/roadmap`；分析页查看快照时的「分析当前样本」→ `/analysis`。

状态归属约定：只有画像草稿、岗位样本、方案列表与当前方案、完成标记进 Pinia（`src/store.ts`）；其余（标签页、展开项、筛选、表单临时值）留在页面内 `ref`。新增共享状态前先问「是否真的跨页面」。

## 4. 文件职责表

| 文件 | 行数 | 职责 | 主要依赖 | 改动风险 |
| --- | ---: | --- | --- | --- |
| `index.html` | 15 | 文档头、viewport、描述、favicon | — | 低 |
| `src/main.ts` | 7 | 挂载 Pinia + Router + 全局样式 | — | 低 |
| `src/App.vue` | 44 | 站点外壳：顶栏、桌面导航、手机折叠菜单（Esc / Tab 焦点管理）、存储告警条、`<RouterView>`、页脚 | `store` | 中：导航数组与路由必须同步 |
| `src/router.ts` | 16 | Hash 路由表；首页静态导入，其余懒加载 | `views/*` | 中：与 `App.vue` 的 `nav` 两处一起改 |
| `src/store.ts` | 73 | 跨页状态 + `localStorage` 读写与损坏恢复 + `generate` / `loadDemo` / `reset` + `stale` 判断 | `data.ts`、`planning.ts` | 高：第 25 行是一整行字段校验，改类型必须同步 |
| `src/types.ts` | 75 | 7 个业务类型：`Profile`、`Job`、`Evidence`、`SkillStat`、`PlannedTask`、`Plan`、`TaskChange` | — | 高：契约文件，单点修改 |
| `src/data.ts` | 29 | 12 条演示样本入口、`roleNames` / `pathNames` / `scoreLabels` / `defaultProfile`、11 条技能映射表、`taskPeriod()` 文案 | `data/jobs.json` | 中：技能表是分析与映射的唯一来源 |
| `src/data/jobs.json` | 14 | 12 条招聘样本原文（前端 6 / 后端 6，企业为「示例企业 A—L」） | — | 低：改文本会影响统计结果与用例断言 |
| `src/planning.ts` | 113 | 需要独立验证的三条规则：`analyzeJobs`（证据与频次）、`createPlan`（任务模板 + 学期排期 + 预算与前置约束）、`diffPlans`（新旧差异） | `data.ts`、`types.ts` | 高：被 12 条单测锁死，改规则必须同步改用例 |
| `src/planning.test.ts` | 99 | 12 条规则测试：同岗位去重、必备/加分分句、前置保留、预算上限、12→6、0 小时、第 8 学期、岗位切换、快照保护、路径原因、兴趣排序 | `planning.ts` | — |
| `src/views/Wizard.vue` | 74 | 六步向导全部表单与校验、步骤条、过渡页 | `ChoiceCard`、`JobsPicker`、`store` | 中：模板为单行压缩写法，编辑需整行替换 |
| `src/views/Analysis.vue` | 39 | 三个标签页、技能频次条、图表、映射三段、证据网格、快照上下文 | `SkillChart`、`JobsPicker`、`planning.analyzeJobs` | 中 |
| `src/views/Roadmap.vue` | 39 | 学期手风琴、任务卡、峰值工时、完成勾选、Markdown 导出 | `store`、`data.taskPeriod` | 中：导出文案与用例断言相关 |
| `src/views/Adjust.vue` | 33 | 条件表单、对比条件卡、差异筛选与列表、一键演示 | `diffPlans`、`ChoiceCard` | 中：快照不可变纪律在此最关键 |
| `src/views/History.vue` | 25 | 版本卡、两份对比、删除确认 | `diffPlans` | 低 |
| `src/views/Home.vue` | 32 | 首屏 hero 与流程预览 | `store` | 低：文案被用例断言 |
| `src/views/NotFound.vue` | 4 | 404 | — | 低 |
| `src/components/ChoiceCard.vue` | 8 | 可访问的单/多选卡片（原生 radio / checkbox + `:has(:focus-visible)`） | — | 低：改结构影响几乎全部表单页 |
| `src/components/JobsPicker.vue` | 33 | 样本多选、全选、展开原文、导入岗位表单（必填原文、http(s) 链接校验） | `store` | 中：向导第 6 步与分析页共用，注意不要触发所在页 submit |
| `src/components/SkillChart.vue` | 29 | ECharts 前 6 项条形图，SVG 渲染 + `ResizeObserver` + `dispose` + `prefers-reduced-motion` | ECharts | 中：容器必须有高度 |
| `src/style.css` | 750 | 设计令牌、全局重置、全部页面样式、6 档媒体查询 | — | 高：单文件共享热点，见 5.5 |
| `tests/app.spec.ts` | 129 | 8 条 E2E：桌面主流程+导出、手机主流程、样本不误提交、草稿恢复与损坏重置、skip-link、手机输入不被遮挡、旧方案证据隔离、6 宽度无横向溢出 | — | — |
| `playwright.config.ts` | 17 | 5173 端口、Chrome 通道、单 worker、失败截图 | — | 低 |
| `vite.config.ts` | 13 | `base: './'`、Vue 插件、ECharts 独立分块、Vitest 收集规则 | — | 低 |
| `tsconfig.json` | 20 | `strict` + `noUnusedLocals` + `noUnusedParameters` + `verbatimModuleSyntax` | — | 低：删到未用变量会直接构建失败 |

## 5. 前端分工

### 5.1 分解原则

按「页面 + 其专属样式区段」切，而不是按技术层切：每个包可以独立跑通一个页面，不依赖别人先合代码才能看效果。三条约束：

1. 一个包只拥有若干文件；跨包文件（`types.ts`、`store.ts`、`data.ts`、`style.css` 的公共段）实行单点修改，见 5.4。
2. 包与包之间只通过已有契约交互（第 6 节），不允许为「方便并行」新增共享工具、公共组件或状态字段。
3. 每个包自带验收口径（第 9 节），负责人自己跑通再交给验收。

### 5.2 工作包总表

| 编号 | 工作包 | 覆盖文件 | 交付物 | 前置 | 估算 |
| --- | --- | --- | --- | --- | ---: |
| FE-A | 站点外壳与设计系统 | `index.html`、`src/main.ts`、`src/App.vue`、`src/router.ts`、`src/views/Home.vue`、`src/views/NotFound.vue`、`src/style.css` 1—141 行、287—289 行与 431—750 行 | 导航 / 手机菜单 / 页脚 / 演示模式标识 / 首页 / 404 / 设计令牌与断点单一来源 | 无（最先冻结令牌） | 2 人日 |
| FE-B | 画像向导与岗位样本 | `src/views/Wizard.vue`、`src/components/ChoiceCard.vue`、`src/components/JobsPicker.vue`、`src/style.css` 173—286 行 | 六步表单与校验、过渡页、8 学期选择卡、技能 chips、自评滑块、时间双向输入、路径与兴趣上限、样本选择与导入 | FE-A 的令牌 | 2.5 人日 |
| FE-C | 岗位分析与证据 | `src/views/Analysis.vue`、`src/components/SkillChart.vue`、`src/planning.ts` 的 `analyzeJobs`、`src/data.ts` 技能表、`src/style.css` 142—172 行 | 三标签页、频次条与图表、技能→课程→成果映射、证据网格、`?plan` / `?skill` 深链 | FE-A 令牌；FE-B 的样本状态 | 2 人日 |
| FE-D | 成长路线、调整与历史 | `src/views/Roadmap.vue`、`src/views/Adjust.vue`、`src/views/History.vue`、`src/planning.ts` 的 `createPlan` / `diffPlans`、`src/types.ts`、`src/style.css` 290—429 行 | 8 学期路线、任务卡、完成勾选、待安排区、Markdown 导出、条件调整与差异、历史对比与删除、快照保护 | FE-B（画像）、FE-C（证据字段） | 3 人日 |
| QA | 验证与验收（横向） | `tests/app.spec.ts`、`playwright.config.ts`，并 review 各包的单元测试；只提缺陷不改业务代码 | 每轮 6 档宽度截图、缺陷单（复现步骤 + 截图）、验收记录 | 各包提交后 | 1.5 人日 |

合计约 11 人日（估算，仅用于排期，不含课程文档与汇报材料）。

**认领表（复制到群里或打印填写，填完即分工生效）**

| 工作包 | 负责人 | 分支名 | 开始 | 预计完成 | 状态 |
| --- | --- | --- | --- | --- | --- |
| FE-A 站点外壳与设计系统 | | `fe/a-shell` | | | 未开始 |
| FE-B 画像向导与岗位样本 | | `fe/b-wizard` | | | 未开始 |
| FE-C 岗位分析与证据 | | `fe/c-analysis` | | | 未开始 |
| FE-D 成长路线、调整与历史 | | `fe/d-roadmap` | | | 未开始 |
| QA 验证与验收（可轮值） | | `fe/qa-round1` | | | 未开始 |

填表时的三条约束：一人可同时认领多个包，但同一时刻不要有两人的分支在改同一个文件（对照 5.4 节）；认领 FE-A 的人必须当天先交出令牌与外壳，否则其余包无法并行；QA 不是「最后检查」，每个包合并前就要过一轮第 9 节清单。

### 5.3 工作包卡片

**FE-A 站点外壳与设计系统**

- 必须产出：顶栏（品牌 / 桌面导航 / 演示模式徽标 / 开始规划 / 手机菜单按钮）、手机菜单的 Esc 与 Tab 焦点环回、`storageWarning` 告警条与「重置本地记录」、页脚、首页 hero 与四步流程、404。
- 令牌与断点只有这一处：`style.css` 1—42 行定义 `--bg / --surface / --text / --muted / --border / --gold / --gold-ink / --selected / --primary`；断点集中在 431—750 行（`min-width:1600px`、`max-width:1100px`、`640—1023px`、`max-width:639px`、`max-width:359px`、`prefers-reduced-motion`）。新写页面样式请放回各自区段，断点仍写在媒体查询区，不要另起断点。
- 不许做：往产品页加「关于项目 / 团队 / 分工 / 汇报」入口；换 UI 组件库；改 `src/router.ts` 之外的导航数据来源（`App.vue` 的 `nav` 数组是桌面与手机菜单共用的唯一来源，手机菜单额外追加「开始规划」）。
- 完成标准：320 / 390 / 768 / 1024 / 1440 / 1920 六档无横向溢出；手机菜单可开可关、Esc 关闭、焦点回到菜单按钮；`跳到主要内容` 链接有效；首页两个按钮都可用。

**FE-B 画像向导与岗位样本**

- 必须产出：步骤条（桌面完整节点 / 手机「第 X / 6 步 + 进度条」）、六步内容、第 5 步后的「基础画像已完成」过渡页、上一步 / 下一步与自动保存提示。
- 校验只有两处（`Wizard.vue` 的 `next()`）：第 1 步专业非空、第 4 步每周时间 0—30 且有限；错误显示在 `.form-error` 并用 `role="alert"`。改校验口径要同时想清楚用例是否覆盖。
- 交互纪律：`ChoiceCard` 一律基于原生 `radio` / `checkbox`，不要改成 `div` + `@click`；兴趣最多 3 项、选中已达上限时其余项为 `disabled` 并在 `.selection-count` 说明原因；自评滑块初始为 `null`（显示「待确认」），不要把默认 5 分当成测评结果。
- 导入岗位：原文必填、链接必须 `http(s)://` 开头；导入项标「用户导入，待核验」并自动选中。注意 `JobsPicker` 在向导与分析页复用，按钮都用 `type="button"`，避免触发表单提交（有用例守着）。
- 完成标准：刷新后回到原步骤且输入保留；手机 390px 下输入框不被底部操作栏遮挡；键盘能走完六步。

**FE-C 岗位分析与证据**

- 必须产出：能力清单（技能 / 学历条件 / 项目经验）、每条技能的「N / 总数 条样本提及」、ECharts 前 6 项频次图、技能→对应课程→实践成果三段流程、该技能的招聘原文证据（带「明确要求 / 加分项 / 表述不明」标签）。
- 规则归属：频次与证据由 `analyzeJobs` 计算——同一岗位同一技能只计一次；必备 / 加分按逗号分句判定（含「优先 / 加分」为加分项，含「掌握 / 熟悉 / 熟练 / 具备 / 能够 / 要求」为明确要求）。改这些词表就是改产品口径，必须同时补 `planning.test.ts`。
- 样本上下文：带 `?plan=<id>` 时用该方案保存的 `jobIds` 复算，且不得改写当前画像草稿；不带参数时用 `store.selectedJobs`。
- 完成标准：空样本有空状态引导；图表随容器 resize、卸载时 `dispose`；`?skill=` 深链能定位到具体技能；`prefers-reduced-motion` 下无动画。

**FE-D 成长路线、调整与历史**

- 必须产出：8 个学期手风琴（已过去学期标「已过去，待核对」且不自动完成、当前学期默认展开并标「从这里开始」、无任务学期说明原因）、任务卡（第几周、每周工时、交付成果、如何验收、课程关联、前置、查看岗位依据）、完成勾选与进度、待安排区与不排入原因、导出 Markdown（文件名 `学途-成长计划-V{n}.md`）。
- 排期规则（`createPlan`）：任务模板按角色取；前置任务必须先排；同一周并行任务工时之和不得超过每周预算；任务不得跨学期；放不下的任务留在待安排并给出原因，绝不排到毕业之后。
- 调整页纪律：挂载时 `JSON.parse(JSON.stringify(store.activePlan))` 深拷贝原方案，用户改的是 `draft`；点「调整成长方案」才 `store.generate` 生成新版本，原方案不动。差异状态为 `保留 / 推迟 / 新增 / 移除`，界面按状态筛选并显示前后学期与原因。
- 完成标准：12→6 小时能演示出「推迟」且基础任务仍在当前学期；0 小时全部待安排；切换目标岗位时保留通用基础、替换专项任务；旧方案不随草稿编辑改变（有用例守着）。

**QA 验证与验收**

- 每轮最小动作：`npm run typecheck` → `npm test` →（起 dev 后）`npm run test:e2e` → 6 档宽度看溢出 → 归档截图到 `output/screenshots/`。
- 缺陷单格式：页面路由 + 复现步骤 + 期望 / 实际 + 截图 + 相关文件。只描述问题，由包负责人改代码。

### 5.4 文件独占表

| 文件 / 区段 | 所有者 | 其他人如何改 |
| --- | --- | --- |
| `src/router.ts`、`src/App.vue`、`src/views/Home.vue`、`src/views/NotFound.vue`、`index.html`、`src/main.ts` | FE-A | 提需求给 FE-A |
| `src/style.css` 1—141、287—289、431—750 行（令牌、通用类、外壳、首页、提示条、全部媒体查询） | FE-A | 只在对应页面的区段内追加；令牌与断点不动 |
| `src/style.css` 173—286 行（向导、选择卡、样本、导入） | FE-B | 同上 |
| `src/style.css` 142—172 行（分析、图表、映射、证据） | FE-C | 同上 |
| `src/style.css` 290—429 行（路线、调整、历史、空状态） | FE-D | 同上 |
| `src/views/Wizard.vue`、`src/components/ChoiceCard.vue`、`src/components/JobsPicker.vue` | FE-B | 提需求给 FE-B（`JobsPicker` 被分析页复用，改 props 需先同步 FE-C） |
| `src/views/Analysis.vue`、`src/components/SkillChart.vue` | FE-C | 提需求给 FE-C |
| `src/views/Roadmap.vue`、`src/views/Adjust.vue`、`src/views/History.vue` | FE-D | 提需求给 FE-D |
| `src/types.ts` | FE-D（契约守护） | 单点修改：先在群里说明字段增删，改完立刻跑 typecheck + test |
| `src/store.ts` | FE-D（契约守护） | 同上；改 `Profile` / `Plan` 字段必须同步第 25 行的校验 |
| `src/data.ts`、`src/data/jobs.json`、`src/planning.ts`、`src/planning.test.ts` | FE-C + FE-D 共同面 | 规则改动必须由改动方补测试，另一位 review |
| `tests/app.spec.ts`、`playwright.config.ts` | QA | 只是执行，不改断言口径 |
| `package.json`、`vite.config.ts`、`tsconfig.json`、`package-lock.json` | 负责人 1（与后端对齐） | 加依赖必须先说明对应当前哪个功能 |

### 5.5 `style.css` 分区与归属

单文件 750 行，行序即区块顺序，按行段认领可避免互相覆盖：

| 行段 | 内容 | 归属 |
| --- | --- | --- |
| 1—42 | `:root` 设计令牌、重置、`focus-visible`、`progress`、表单控件基础 | FE-A |
| 43—51 | `.sr-only`、`.skip-link`、`.page-container`、`.narrow`、文本工具类 | FE-A |
| 52—66 | `.button` 家族（primary / secondary / large / small / active-button）、`.text-button`、`.icon-button` | FE-A |
| 67—77 | `.tag` / `.soft-tag` / `.gold-tag`、`.panel`、`.section-heading`、`.mb-24` | FE-A |
| 78—97 | 顶栏、品牌、桌面导航、演示徽标、手机菜单、`.storage-warning`、页脚 | FE-A |
| 98—116 | 首页 hero、流程预览四卡 | FE-A |
| 117—141 | 工作区页头、工具栏、分段控件、分析汇总（跨页共享） | FE-A 主导，FE-C 提需求 |
| 142—172 | 标签页、技能条、`.skill-chart`、映射三段、证据网格 | FE-C |
| 173—258 | 步骤条、字段、选择卡、技能 chips、滑块锚点、时间显示、过渡页、画像复核 | FE-B |
| 259—286 | 样本选择器工具条、岗位卡、导入表单、错误文本 | FE-B |
| 287—289 | `.notice-bar` 提示条（分析 / 路线 / 调整共用） | FE-A |
| 290—361 | 路线 hero、学期折叠、任务卡、侧栏、待安排区 | FE-D |
| 362—429 | `.empty-state`、调整页控件、对比条件、变更筛选与变更卡、历史页 | FE-D |
| 431—492 | `min-width:1600px`、`max-width:1100px`、平板 640—1023px | FE-A |
| 494—727 | 手机 `max-width:639px` 全部覆盖 | FE-A |
| 729—750 | 极窄屏 `max-width:359px`、`prefers-reduced-motion` | FE-A |

### 5.6 排期与人手组合

| 前端人数 | 组合 | 建议顺序 |
| --- | --- | --- |
| 4 人 | FE-A / FE-B / FE-C / FE-D 各一，QA 轮值 | 第 1 天由 FE-A 冻结令牌与外壳，其余三人并行页面；第 3—4 天进入联调与缺陷修复 |
| 3 人 | 甲 = A + B，乙 = C，丙 = D + QA | 甲先出外壳与向导，丙等乙的 `SkillStat` 字段确认后再做路线证据链接 |
| 2 人 | 甲 = A + B，乙 = C + D，QA 轮流 | 甲第 1 天先交令牌，乙当天可动 C 的样式 |
| 1 人（当前分工表的情形） | 按 A → B → C → D → QA 串行 | A 先冻结令牌，避免后面反复改样式；C 在 B 的样本状态稳定后再动 |

与课程 6 人分组的衔接建议（仅建议，可协商）：`成员 6（前端、联调与展示验证）` 主责 FE-A 与 FE-D，并担任契约守护；技能归并相关的展示口径与 FE-C 对齐；岗位资料口径与 FE-B 的样本字段对齐。无论怎么分，前端只通过第 6 节的契约与后端 / Agent 成员交接。

## 6. 交付契约（与后端、Agent 成员的接缝）

### 6.1 三个纯函数（`src/planning.ts`）

| 函数 | 签名 | 输入 / 输出 | 谁依赖 |
| --- | --- | --- | --- |
| `analyzeJobs` | `(jobs: Job[]) => SkillStat[]` | 选中的样本原文 → 按 `data.ts` 技能表归并，返回每项技能的岗位覆盖数与原文证据，按覆盖数降序 | Analysis 页、`createPlan` |
| `createPlan` | `(profile: Profile, jobs: Job[], version: number) => Plan` | 画像 + 选中样本 + 版本号 → 带 `semester` / `startWeek` / `jobIds` / `reason` 的完整方案；参数非法抛中文 `Error`（界面直接展示） | Wizard 第 6 步、Adjust、store |
| `diffPlans` | `(before: Plan, after: Plan) => TaskChange[]` | 两份方案 → 按任务 `id` 对齐的 `保留 / 推迟 / 新增 / 移除` 与原因 | Adjust 页、History 对比 |

这三条是唯一「需要独立验证的业务规则」，因此拆成纯函数并有 12 条单测。任何把它们挪进组件、或改成异步 / 依赖 DOM 的改动都会被拒绝。

### 6.2 `store` 对外 API（`src/store.ts`）

| 名称 | 类型 | 含义 |
| --- | --- | --- |
| `profile` | `Profile` | 画像草稿，向导边填边改；方案内保存的是快照副本 |
| `jobs` | `Job[]` | 12 条演示样本 + 用户导入项 |
| `selectedIds` | `string[]` | 选中的样本 id（可包含导入项） |
| `plans` / `activeId` | `Plan[]` / `string` | 历史方案（新的在前）与当前查看的方案 |
| `step` / `hasDraft` | `number` / `boolean` | 向导步骤与「是否已有草稿」，用于首页按钮文案 |
| `completed` | `Record<planId, taskId[]>` | 任务完成标记，按方案隔离 |
| `storageWarning` | `string` | 本地记录损坏 / 无法写入时的提示 |
| `selectedJobs` | computed | 当前角色下被选中的样本 |
| `activePlan` | computed | `plans` 中 `activeId` 对应方案 |
| `stale` | computed | 草稿或选中样本与当前方案快照不一致（路线页提示「条件已更新，待重新生成」） |
| `generate(profile, ids)` | action | 生成新版本并设为当前方案，返回新方案 |
| `loadDemo()` | action | 载入演示画像（第 3 学期、前端、每周 12 小时、示例自评与兴趣） |
| `reset()` | action | 清空本地记录与状态 |

### 6.3 规则数据在哪

| 内容 | 位置 | 改动影响 |
| --- | --- | --- |
| 技能词表（11 条：id、名称、匹配正则、课程、项目、成果） | `src/data.ts` 的 `skills` | 分析与路线同时变化，必须补 `planning.test.ts` |
| 演示样本 12 条 | `src/data/jobs.json` | 频次统计与 E2E 断言 |
| 任务模板（基础 2 条、前端 6 条、后端 5 条 + 作品集） | `src/planning.ts` 的 `common` / `frontend` / `backend` / `portfolio` | 学期容量 `(9 - semester) * 16` 周、工时与前置关系 |
| 路径 / 角色 / 自评标签文案 | `src/data.ts` | 界面文案，用例中的可见文本 |

### 6.4 `Profile` 字段字典（哪些字段真的参与规则）

| 字段 | 采集位置 | 参与规则 | 展示位置 |
| --- | --- | --- | --- |
| `major` | 向导第 1 步 | 否 | 路线 hero、导出 Markdown |
| `semester` | 向导第 1 步 | 是（起始学期、剩余容量） | 路线、历史、导出 |
| `role` | 向导第 2 步（并联动重选该角色样本） | 是（任务模板、岗位专项） | 分析、路线、历史 |
| `courses` | 向导第 1 步 | **否**（见缺口 #2） | 仅输入框，导出不含 |
| `skills` | 向导第 3 步 | 是（已接触「编程基础」时跳过基础任务） | 无独立展示 |
| `scores` | 向导第 3 步（四项自评） | **否**（见缺口 #3） | 仅输入框 |
| `hours` | 向导第 4 步 | 是（每周工时预算、能否排入） | 路线、调整、历史、导出 |
| `path` | 向导第 5 步 | 是（考研优先插入备考任务；差异原因） | 路线、调整、历史、导出 |
| `interests` | 向导第 5 步（最多 3） | 是（可选任务排序与原因文案） | 任务卡原因、导出 |

### 6.5 未来接真实 Agent 的映射（只做文档说明，现在不写代码）

后端 / Agent 成员接入时，前端只需把三条纯函数的调用点换成一次请求，其余页面不动：

| 前端调用点 | 现在的实现 | 将来对应 | 注意 |
| --- | --- | --- | --- |
| `store.generate` → `createPlan` | 本地规则排期 | 后端「分学期规划」接口 | 方案结构 `Plan` 必须保持可渲染；错误仍走中文 `Error` 文案展示 |
| `analyzeJobs` | 本地关键词归并 | 后端「要求提取 + 技能归并」接口 | 必须保留 `Evidence.sentence` 原文与 `jobId`，否则证据区失效 |
| `diffPlans` | 本地按 id 对比 | 后端返回差异，或仍由前端计算 | 「保留 / 推迟 / 新增 / 移除」四种状态与中文类名已固定 |
| `JobsPicker.addJob` | 写入本地状态 | 提交到后端前需先修缺口 #1（当前计划内有效） | 课程文档要求导入内容不写入本地持久存储 |

接接口时再按真实协议设计类型，不提前加请求封装、`services/` 目录或占位函数。

## 7. 改代码前必须知道的 6 个耦合点

1. E2E 锁了文案：`tests/app.spec.ts` 断言了标题「你的成长，有路可循.」「让计划，跟上你的变化.」与按钮名「载入演示画像」「分析岗位并生成路线」「一键演示：每周 12 小时改为 6 小时」「导出计划」。改这些文案必须同步改用例。
2. `localStorage` 键是 `pathpilot-workspace`，且 `src/store.ts` 第 25 行用一整行条件校验字段（学期 1—8、角色、`hours` 0—30、`plans` 必有 `id/profile/tasks` 等）。增删 `Profile` / `Plan` 字段必须同步这里，否则旧数据会被判坏并触发「上次的本地记录无法读取」。
3. 差异状态类名是中文且与字面量绑定：`.status-保留` / `.status-推迟` / `.status-新增` / `.status-移除`，其中「保留」用 `.status-tag` 基础色。改 `TaskChange['status']` 文案就要改 CSS 类名。
4. 新增页面要改两处：`src/router.ts` 的路由 + `src/App.vue` 的 `nav` 数组（桌面与手机菜单共用同一数组）。漏一处会出现「有页面没入口」或「有入口 404」。
5. `SkillChart` 的图表实例与 `ResizeObserver` 在 `onMounted` 建立、`onBeforeUnmount` 清理，`draw()` 每次 `setOption(..., true)` 全量替换。不要改成按需 `resize` 或复用实例的写法，也不要给容器去掉固定高度。
6. 快照不可变：`createPlan` 内部深拷贝 `profile`；`Adjust.vue` 挂载时深拷贝 `activePlan`。任何把 `store.profile` 引用直接塞进方案、或在路线页直接改 `plan.tasks` 的写法，都会破坏「旧方案不随草稿变化」这条验收（有用例守着）。

## 8. 协作规则

1. 先初始化仓库（缺口 #4）。分支命名 `fe/<包编号>-<一句话>`，例如 `fe/c-skill-chart`。
2. 一次提交只做一件事。禁止把「全仓格式化」和功能改动放进同一次提交（当前 `.vue` 模板是单行压缩写法，格式化会产生巨量差异，必须单独一次并提前通知全组）。
3. 每天至少跑一次 `npm run typecheck`；提交前四条命令全绿：`typecheck` → `test` →（起 dev）`test:e2e` → `build`。
4. 只改自己工作包内的文件；共享契约文件（`types.ts`、`store.ts`、`data.ts`、`planning.ts`、`style.css` 公共段）改动先在群里说明，并由契约守护 review。
5. 新增依赖必须说明用途：任何 `package.json` 依赖都要写清服务于当前哪个功能。
6. 产品页面不得出现团队、分工、贡献排名、项目介绍或汇报信息；分工与贡献只写在这里和课程材料里。

## 9. 验收清单

**功能与规则**

- [ ] 六步向导可完整走通，刷新后回到原步骤且输入保留
- [ ] 样本可选、可取消、可展开原文、可导入；导入项标「用户导入，待核验」
- [ ] 同一岗位同一技能只计一次；必备 / 加分按分句区分
- [ ] 12→6 小时演示能出现「推迟」，且基础任务仍在当前学期
- [ ] 0 小时时全部任务进「待安排」且不排入任何学期
- [ ] 切换目标岗位保留通用基础、替换岗位专项
- [ ] 任一周并行任务工时之和不超过每周预算，任务不跨学期，前置先排
- [ ] 旧方案不随画像草稿编辑而改变；路线页在草稿变化后显示「条件已更新，待重新生成」
- [ ] 导出 Markdown 文件名与字段齐全（含演示模式说明）

**工程与质量**

- [ ] `npm run typecheck` 0 错误
- [ ] `npm test` 全绿，规则改动有对应用例
- [ ] `npm run test:e2e` 全绿
- [ ] `npm run build` 成功，`dist/` 可在静态服务下经 `/#/` 访问
- [ ] 320 / 390 / 768 / 1024 / 1440 / 1920 六档无横向溢出，截图归档
- [ ] 触控目标不小于 44×44px；主要操作有可见焦点（`:focus-visible`）
- [ ] 键盘可完成向导、可操作菜单与选择卡；skip-link 有效
- [ ] 手机端底部操作栏不遮挡输入框
- [ ] `prefers-reduced-motion` 下无动画
- [ ] 页面无「关于项目 / 团队 / 分工 / 汇报」入口
- [ ] 未新增未使用的类型、组件、依赖或空实现

## 10. 演示路径（约 8 分钟，与课程材料一致）

1. 首页 →「载入演示画像」→ 六步向导，说明每一步采集什么、为什么（第 3 学期 / 前端 / 每周 12 小时）。
2. 第 6 步选择岗位样本 →「分析岗位并生成路线」。
3. 分析页：选一个技能，展示「N / 总条数」的频次、招聘原文证据、对应课程与实践成果。
4. 路线页：说明前置顺序与每周工时上限；勾选一项完成；导出 Markdown。
5. 调整页：「一键演示：每周 12 小时改为 6 小时」→ 展示「推迟」项与原因 → 说明旧方案未被修改。
6. 历史页：两份方案对比；说明本地保存、演示边界（无实时招聘、无 AI 调用、课程为示例）。
7. 手机宽度现场切换一次，说明同一套路由与组件适配。

## 11. 待办与已知缺口

| # | 问题 | 证据 | 建议负责人 | 完成标准 |
| --- | --- | --- | --- | --- |
| 1 | 用户导入的岗位被写入 `localStorage`，与课程文档「仅当前计划内有效、退出即清除」的要求不一致 | `src/store.ts` 第 27、38 行持久化 `source === 'imported'` 的样本 | FE-B 改逻辑 + 成员 1 定口径 | 退出 / 刷新后导入项清除；历史方案不引用导入项；导入前提示「仅用于当前计划」 |
| 2 | `profile.courses`（已修课程）只采集不使用，导出里也没有 | 仅 `src/views/Wizard.vue` 第 63 行读写，其余代码无引用 | 成员 4 / 成员 5 定用途 | 要么接入课程映射与导出，要么在界面标注「仅作记录」 |
| 3 | `profile.scores`（四项自评）只采集不使用 | 仅 `src/views/Wizard.vue` 第 65 行与 `store` 校验引用 | 成员 5 | 明确是否参与任务筛选 / 排序，并在界面说明自评的实际作用 |
| 4 | 目录不是 Git 仓库，多人并行会互相覆盖 | 无 `.git`；`.gitignore` 已就绪 | 负责人 1 | `git init` + 首次提交 + 分支规则（第 8 节） |
| 5 | `.vue` 模板为单行压缩写法（`Wizard.vue` 单行逾 6000 字符），评审与合并困难 | 见各 `.vue` 文件 | FE 负责人 | 单独一次格式化提交，先通知全组，不与功能改动混合 |
| 6 | `style.css` 750 行单文件，样式与页面耦合靠行段约定 | 见 5.5 | FE-A | 若拆分，一次分成令牌 / 布局 / 页面三类并同步本表 |
| 7 | 单测只覆盖 `planning.ts`；`store.ts` 的持久化校验无测试 | `src/planning.test.ts` 是唯一测试文件 | QA | 补损坏数据、字段缺失、版本回退用例 |
| 8 | E2E 依赖本机 Chrome 与 5173 端口，截图目录未归档（`output/` 当前不存在） | `playwright.config.ts` | QA | 跑一次完整 E2E 并归档 `output/screenshots/`，把他人机器的复现步骤写进本文 |

## 12. 排错

| 现象 | 原因 / 处理 |
| --- | --- |
| 直接访问 `/roadmap` 是 404 | 使用 Hash 路由，地址应为 `/#/roadmap` |
| 改了样式没生效 | 检查是否被 431 行之后的媒体查询覆盖；确认改的是对应页面区段 |
| 图表空白 | 容器必须有高度；`SkillChart` 需要 `element` 已挂载 |
| 顶部出现「上次的本地记录无法读取」 | 本地数据与校验不符（常见于刚改字段）。点「重置本地记录」，或在 DevTools 删除 `localStorage['pathpilot-workspace']` |
| 端口被占 | `npm run dev -- --port 5173 --strictPort`，否则 Playwright 的 `baseURL` 对不上 |
| `npm run test:e2e` 报浏览器缺失 | 装 Chrome，或安装 Playwright Chromium 后移除 `playwright.config.ts` 里的 `channel: 'chrome'` |
| 路线页提示「条件已更新，待重新生成」 | 草稿或选中样本与当前方案快照不一致，属预期；到向导确认后重新生成 |
