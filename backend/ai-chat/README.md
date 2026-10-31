# AI 对话模块（ai-chat）

负责「和 AI 交流确认调整」：读取用户当前方案，让模型给出画像调整与补充任务建议，前端确认后再调用分学期规划生成新版本。

对应需求：FR-13「改条件并展示差异」中的对话入口。本模块只产出调整建议（`proposal`），不生成方案。

## 1. 边界

| 本模块负责 | 不在本模块 |
| --- | --- |
| `POST /api/chat`、对话提示词、模型响应解析、`proposal` 校验 | 方案生成、排期校验、差异计算（见 [`../semester-planning`](../semester-planning/README.md)） |
| 自定义任务与替换模块的建议内容（`customTasks` / `dropModules`） | 真正把任务排进方案（规划模块按目录规则处理） |
| 对话接口的错误码与重试 | 前端对话 UI、密钥存储（见 [`../../frontend`](../../frontend)） |

## 2. 目录

```text
backend/ai-chat/
├── ai_chat/
│   ├── __init__.py
│   ├── api.py        FastAPI 路由 /api/chat
│   ├── models.py     对话请求/响应模型（Profile、CustomTask 复用自规划模块）
│   ├── prompt.py     对话系统提示词与上下文拼接
│   └── service.py    校验、重试、proposal 归一化
├── tests/            pytest（client、conftest）
├── pytest.ini        pythonpath 同时包含本模块与 ../semester-planning
└── requirements-dev.txt
```

## 3. 运行

两个模块**同进程**运行：由 `semester-planning/app/main.py` 把本目录加入 `sys.path` 并挂载 `/api/chat` 路由，因此不需要第二个服务或端口。

```sh
cd backend/semester-planning
uvicorn app.main:app --port 8000
```

依赖与 `semester-planning` 相同（`fastapi`、`pydantic`、`openai`），不单独安装。

## 4. 接口

```json
请求: {
  "messages": [{"role": "user", "content": "每周只能 8 小时"}],
  "profile": {},
  "plan": {"version": 2, "profile": {}, "periods": []}
}
成功: {
  "reply": "可以，把每周时间降到 8 小时。",
  "proposal": {
    "summary": "每周 8 小时",
    "profile": {},
    "customTasks": [],
    "dropModules": []
  }
}
```

`proposal` 可以为 `null`（只是聊天，不改方案）。前端确认后把 `proposal.profile`、`customTasks`、`dropModules` 传给 `/api/plan`。

| 场景 | HTTP | code |
| --- | --- | --- |
| 没有用户消息 | 400 | `EMPTY_MESSAGE` |
| 画像学期/时间不合法 | 400 | `INVALID_PROFILE` |
| 未配置密钥 | 503 | `LLM_NOT_CONFIGURED` |
| 超时 | 504 | `LLM_TIMEOUT` |
| 上游不可用 | 502 | `LLM_UNAVAILABLE` |
| 输出格式错误（重试 1 次后） | 502 | `LLM_INVALID_REPLY` |
| 输出画像越界 | 502 | `LLM_INVALID_PROFILE` |
| 输出任务不合法 | 502 | `LLM_INVALID_TASKS` |

## 5. 测试

```sh
cd backend/ai-chat
pytest
```

测试通过依赖覆盖注入假模型客户端，不发起真实请求。
