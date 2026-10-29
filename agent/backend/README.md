# PathPilot 模型调用入口（agent/backend）

成员1 赖叶盛负责的「模型调用入口」：把前端 8.4 的四个端点接到大模型上。
**零依赖**，Node ≥ 18 直接运行，无需 `npm install`。

## 端点

| 方法 | 路径 | 入参 | 出参 |
|---|---|---|---|
| POST | `/api/analyze` | `{ jobs }` | `{ skills }` |
| POST | `/api/plan` | `{ profile, jobs, version }` | `{ plan }` |
| POST | `/api/plan/replan` | `{ before, profile, jobs }` | `{ plan, changes }` |
| POST | `/api/jobs/import` | `{ url, text, role }` | `{ job }` |
| GET | `/api/health` | — | `{ ok, mock }` |

## 启动

```bash
cd agent/backend
cp .env.example .env      # Windows: copy .env.example .env
# 编辑 .env 填入 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL
npm start                 # = node --env-file=.env src/server.js
```

没有密钥时，可先用模拟数据联调：

```bash
# .env 中设 LLM_MOCK=1
npm start
```

## 设计要点

- **Provider 无关**：统一走 OpenAI 兼容的 `/chat/completions`，DeepSeek / 通义 / OpenAI 换 3 个环境变量即可。
- **超时**：`AbortController` 默认 30s；**重试**：仅对 5xx / 超时重试 1 次（4xx 不重试）。
- **错误映射**：统一为 `{ code, message }`，前端 `ModelApiError` 直接透出中文提示（不降级，按马凯确认）。
- **无状态**：每次请求独立，不落库；草稿/方案/历史由前端 localStorage 持有。
- **版本号**：`version` 由前端自增传入，后端原样写回（`/api/plan`）/ 用 `before.version + 1`（`/api/plan/replan`）。
- **密钥安全**：只在后端环境变量，前端永不接触。

## 与前端联调

前端 `frontend/` 已配置 Vite 代理：`/api` → `http://127.0.0.1:8787`。
在 `frontend/.env` 设 `VITE_USE_MODEL=true` 后，前端四个调用点自动切到本服务。
