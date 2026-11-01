# 共享配置（shared）

前后端共用的事实来源。方向与技能只做**标签/归一化提示**；示例任务只用于提示词 few-shot，不是白名单。

| 文件 | 内容 | 消费方 |
| --- | --- | --- |
| `roles.json` | 9 类方向：id / name / aliases | 前端方向选择器、后端方向标签 |
| `skills.json` | 标准技能：id / name / aliases / regex | 后端技能归一化、前端离线分析 |
| `examples/tasks.json` | 任务 few-shot 示例（含课程/产出/验收） | 后端动态规划提示词 |

约定：
- 新增方向只改 `roles.json`，不需要写任务目录；未知方向也能走动态生成。
- 未知技能按 `slug(name)` 新建，命中 aliases 会归并到标准 id。
- 修改后跑后端契约测试与前端 `typecheck`/`test`；前端通过 Vite 直接导入（`server.fs.allow` 已放开上级目录）。
