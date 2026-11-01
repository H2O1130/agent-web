# 岗位分析模块（analysis，动态版）

负责「岗位洞察」的后端能力：把选中的岗位原文变成**标准技能统计**，再映射到**课程与实践**。对应 FR-07 / FR-08 / FR-09。

## 1. 边界

| 本模块负责 | 不在本模块 |
| --- | --- |
| `POST /api/analyze`：动态技能提取 + AI 课程映射、错误码与超时 | 岗位列表、导入、生命周期（目前仍在前端） |
| 技能归一化（共享词表提示）与原文证据校验 | 分学期排期（见 [`../semester-planning`](../semester-planning/README.md)） |
| 把画像、课程/项目来源与「示例」标识透给前端 | 对话调整（见 [`../ai-chat`](../ai-chat/README.md)） |

调用链：

```text
POST /api/analyze {jobs, profile}
  → 一次模型调用：{skills(开放词表+原文证据), mappings(技能→课程/项目)}
  → 归一化 + 原文证据校验 + 映射结构校验
  → {skills, mappings}（课程/项目均为 AI 生成示例）
```

技能词表来自 `shared/skills.json`，只做别名归一化提示；未知技能按 slug 新建。

## 2. 目录

```text
backend/analysis/
├── analysis/
│   ├── __init__.py
│   ├── api.py        POST /api/analyze
│   ├── models.py     请求模型（只取岗位 id/text 与画像）
│   └── service.py    模型适配、异常映射、编排两个库
├── tests/            pytest（假客户端，不发真实请求）
├── pytest.ini        pythonpath 含本模块、../semester-planning 与 backend 根
├── requirements-dev.txt
└── README.md
```

## 3. 运行

与规划、对话**同进程**：`semester-planning/app/main.py` 把 `backend/analysis` 与 `backend` 根加入 `sys.path` 并挂载路由，不需要第二个端口。

```sh
cd backend/semester-planning
uvicorn app.main:app --port 8000
```

依赖与 `semester-planning` 相同；`skill_merger` 无需安装，`course_mapping` 也是同仓库纯库。

## 4. 接口

```json
请求: {
  "jobs": [{"id": "nc-467328", "text": "岗位要求原文…"}],
  "profile": {"major": "…", "semester": 3, "role": "frontend", "courses": "…"}
}
成功: {
  "skills": [
    {"id": "javascript", "name": "JavaScript", "count": 2,
     "evidence": [{"jobId": "nc-467328", "sentence": "熟悉 JavaScript", "kind": "明确要求"}]}
  ],
  "mappings": [
    {"skillId": "javascript", "course": "Web 程序设计", "courseSemester": 3,
     "project": "校园活动报名应用", "outcome": "…", "acceptance": "…",
     "alreadyTaken": false, "courseSource": "示例培养方案…",
     "projectSource": "示例课程项目库…", "sourceKind": "示例"}
  ]
}
```

`skills` 与 `mappings` 等长、同序，一条技能一条映射；前端按 `skillId` 对齐。

| 场景 | HTTP | code |
| --- | --- | --- |
| 未选岗位 | 400 | `NO_JOBS` |
| 岗位/画像输入不合法 | 400 | `INVALID_ANALYZE_INPUT` |
| 未配置密钥 | 503 | `LLM_NOT_CONFIGURED` |
| 模型超时 | 504 | `LLM_TIMEOUT` |
| 上游不可用 | 502 | `LLM_UNAVAILABLE` |
| 模型输出被截断/非 JSON | 502 | `LLM_INVALID_REPLY` |
| 证据不在原文、映射不合规 | 502 | `LLM_INVALID_ANALYZE` |

一次请求调用一次模型；失败重试 1 次。前端在后端不可用或失败时回退本地 `analyzeJobs()`（共享技能词表）并提示。

## 5. 测试

```sh
cd backend/analysis
pytest
```
