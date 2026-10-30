# 分学期规划模块

输入画像与岗位样本，输出与前端同构的 `Plan`。只提供 `POST /api/plan`。

需求：[`../../需求与分工.md`](../../需求与分工.md) · 运行：[`../开发说明.md`](../开发说明.md)

## 接口

```json
请求: { "profile": {}, "jobs": [], "version": 1 }
成功: { "plan": { "id": "uuid", "version": 1, "createdAt": "...", "profile": {}, "jobIds": [], "tasks": [] } }
失败: { "code": "...", "message": "中文提示" }
```

| 场景 | HTTP | code |
| --- | --- | --- |
| 学期/时间越界 | 400 | `INVALID_PROFILE` |
| 无岗位 | 400 | `NO_JOBS` |
| 无技能 | 422 | `NO_SKILLS` |
| 未配置密钥 | 503 | `LLM_NOT_CONFIGURED` |
| 超时 | 504 | `LLM_TIMEOUT` |
| 网络/上游错误 | 502 | `LLM_UNAVAILABLE` |
| 两次校验失败 | 502 | `LLM_INVALID_PLAN` |
| 其他 | 500 | `INTERNAL` |

`GET /health` → `{ "status": "ok" }`；CORS 放行 5173。

## DeepSeek V4.1 Flash

| 项 | 值 |
| --- | --- |
| base_url | `https://api.deepseek.com` |
| model | `deepseek-flash`（V4.1-Flash-1017） |
| 输出 | `response_format={"type":"json_object"}` |
| 思考 | `extra_body={"thinking":{"type":"disabled"}}` |
| 参数 | temperature `0.2`，max_tokens `16384` |
| 超时/重试 | 90 秒 / 1 次 |

```dotenv
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_TIMEOUT_SECONDS=90
DEEPSEEK_MAX_TOKENS=16384
DEEPSEEK_TEMPERATURE=0.2
```

模型只输出：

```json
{ "tasks": [ { "id": "foundation", "semester": 3, "startWeek": 1, "reason": "..." } ] }
```

## 校验

| 规则 | 内容 |
| --- | --- |
| V1 | 任务 id 来自目录且不重复 |
| V2 | R4 必需任务齐全 |
| V3 | 前置存在且早于当前任务 |
| V4 | `semester ∈ [当前学期, 8]` |
| V5 | `startWeek ∈ [1,16]`，不跨学期 |
| V6 | 同周工时 ≤ 预算 |
| V7 | `hours = 0` 时全部待安排 |
| V8 | 待安排必须有原因 |
| V9 | `jobIds` 由后端重算 |

解析失败、字段缺失、输出被截断都算不合法；重试 1 次仍失败返回 502。

## 测试

```sh
cd backend/semester-planning
pytest                 # 模型全部 mock
pytest -m live         # 仅在设置 DEEPSEEK_API_KEY 时跑
```

验收：演示画像 + 12 条样本能生成可渲染 `Plan`；0 小时全待安排；12→6 后移；第 8 学期不越界。

## 对接前端

服务默认 `http://127.0.0.1:8000`；前端配 `VITE_API_BASE`，新增 `api.ts` 并把 `store.generate` 改 async。未配置时仍用本地 `createPlan`，远程失败不静默回退。
