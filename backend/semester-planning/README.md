# 分学期规划模块

输入画像与岗位样本，输出与前端同构的 `Plan`。提供 `POST /api/plan` 与 `POST /api/llm/verify`。

状态：T1—T8 已实现，按学期与寒暑假组织，含规划总览、微任务与折叠详情；`pytest` 52 passed、1 skipped；前端 29 项单测；真实 DeepSeek 与本地/远程 E2E 均已通过。

需求：[`../../需求与分工.md`](../../需求与分工.md) · 运行：[`../开发说明.md`](../开发说明.md)

## 微任务方案

- 15 个模块拆成 42 个 1—2 周微任务；每个微任务固定标题、做什么、完成标准、周数、模块与前置。
- LLM 只选择微任务 id 与周数，任务说明由目录回填，避免自由发挥和套话。
- 密度：学期目标 3—4 项（校验 3—5），寒暑假目标 2—3 项（校验 2—4）。
- 卡片只显示标题、周数、做什么、完成标准；示例、为什么、课程、岗位依据收进「详情」折叠。

## 接口

```json
请求: { "profile": {}, "jobs": [], "version": 1 }
成功: { "plan": { "id": "uuid", "version": 1, "createdAt": "...", "profile": {}, "jobIds": [], "overview": {}, "semesters": [], "vacations": [], "tasks": [] } }
失败: { "code": "...", "message": "中文提示" }
```

`Plan.overview` 含 `goal`、`strategy`、`principles`、`stack`、`milestones`、`decisionPoint`；`Plan.semesters` 与 `Plan.vacations` 分别按学期、寒暑假分组，含 `title`、`goal`、`output`、`decision`、`itemIds`；每项任务含 `moduleName`、`outcome`（做什么）、`acceptance`（完成标准）、`weekNote`，以及折叠用的 `example` / `reason`。

| 场景 | HTTP | code |
| --- | --- | --- |
| 学期/时间越界 | 400 | `INVALID_PROFILE` |
| 无岗位 | 400 | `NO_JOBS` |
| 无技能 | 422 | `NO_SKILLS` |
| 未配置密钥 | 503 | `LLM_NOT_CONFIGURED` |
| 超时 | 504 | `LLM_TIMEOUT` |
| 网络/上游错误 | 502 | `LLM_UNAVAILABLE` |
| 重试后仍失败 | 502 | `LLM_INVALID_PLAN` |
| 其他 | 500 | `INTERNAL` |

`GET /health` → `{ "status": "ok" }`；CORS 放行 5173。

## 浏览器自带密钥

前端页头的「模型设置」可以填自己的 DeepSeek 密钥，存在 `localStorage`，每次请求通过请求头发给本机后端，优先于 `.env`：

| 请求头 | 作用 |
| --- | --- |
| `X-DeepSeek-Key` | 覆盖 `DEEPSEEK_API_KEY`，留空则回退 `.env` |
| `X-DeepSeek-Model` | 覆盖 `DEEPSEEK_MODEL` |
| `X-DeepSeek-Base-URL` | 覆盖 `DEEPSEEK_BASE_URL` |

`POST /api/llm/verify`（同上述请求头，无请求体）→ `{ "ok": true, "model": "deepseek-chat" }`；失败：503 `LLM_NOT_CONFIGURED`、401 `LLM_UNAUTHORIZED`、504 `LLM_TIMEOUT`。校验只发一次 4 token 的探测请求。

## DeepSeek V4.1 Flash

| 项 | 值 |
| --- | --- |
| base_url | `https://api.deepseek.com` |
| model | `deepseek-flash`（V4.1-Flash-1017） |
| 输出 | `response_format={"type":"json_object"}` |
| 思考 | `extra_body={"thinking":{"type":"disabled"}}` |
| 参数 | temperature `0.2`，max_tokens `16384` |
| 超时/重试 | 90 秒 / 最多 2 次重试 |

```dotenv
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_TIMEOUT_SECONDS=90
DEEPSEEK_MAX_TOKENS=16384
DEEPSEEK_TEMPERATURE=0.2
```

模型输出：

```json
{
  "strategy": "学期内补基础和类型，寒假集中练可访问性，第 4 学期用项目把技能串起来。",
  "periods": [
    {
      "kind": "semester",
      "semester": 3,
      "title": "打牢前端基础",
      "goal": "完成响应式页面与报名表单。",
      "output": "一个手机和桌面都能用的社团报名页。",
      "decision": "",
      "items": [
        {
          "id": "html-semantic",
          "weeks": "第 1 周"
        }
      ]
    },
    {
      "kind": "winter",
      "semester": 3,
      "title": "集中补交互",
      "goal": "用一个完整表单练熟校验与保存。",
      "output": "一个支持校验和本地保存的报名表单。",
      "decision": "",
      "items": [
        {
          "id": "js-validate",
          "weeks": "约 2 周"
        }
      ]
    }
  ]
}
```

## 校验

| 规则 | 内容 |
| --- | --- |
| V1 | 微任务 id 来自目录，跨学期/假期不重复 |
| V2 | 必需微任务齐全 |
| V3 | 每个阶段有 title / goal / output；学期 3—5 项，寒暑假 2—4 项 |
| V4 | 学期 `semester ∈ [当前学期, 8]`；寒假在前一学期 1/3/5/7，暑假在前一学期 2/4/6/8；不早于当前学期 |
| V5 | 前置微任务在更早阶段，或同一阶段更靠前 |
| V6 | title ≤ 30 字、goal ≤ 60 字、output ≤ 80 字 |
| V7 | `hours = 0` 不生成阶段，全部任务待安排 |
| V8 | 同一学期或同一假期只出现一次；`jobIds` 由后端重算 |

解析失败、字段缺失、输出被截断都算不合法；最多重试 2 次仍失败返回 502。

## 测试

```sh
cd backend/semester-planning
pytest                                  # 模型全部 mock
RUN_LIVE_TESTS=1 pytest -m live         # 需要 DEEPSEEK_API_KEY
```

Windows PowerShell 用 `$env:RUN_LIVE_TESTS=1; pytest -m live`。

验收：演示画像 + 12 条样本能生成 4—6 个阶段的 `Plan`；每学期 3—4 项、寒暑假 2—3 项；0 小时全待安排；同一任务不重复。

## 对接前端

已接入：服务默认 `http://127.0.0.1:8000`；前端在 `.env` 配置 `VITE_API_BASE`，`src/api.ts` 调用 `/api/plan`，`store.generate` 为 async。未配置时仍用本地 `createPlan`，远程失败不静默回退。
