# 学途 PathPilot

大学生职业成长规划 Web 项目：选岗位、填画像 → 看技能与课程关联 → 生成分学期计划 → 条件变化后重规划。

- 前端：Vue 3 + TypeScript + Vite，本地规则，可独立运行。
- 后端：仅「分学期规划」模块，计划接入 DeepSeek V4.1 Flash，尚未接入前端。

## 快速开始

需要 Node.js 20.19+ 或 22.12+。

```sh
cd frontend
npm ci
npm run dev        # http://127.0.0.1:5173/
```

| 命令 | 用途 |
| --- | --- |
| `npm run typecheck` | 类型检查 |
| `npm test` | 规划逻辑单测 |
| `npm run test:e2e` | 浏览器回归（先起 5173，用本机 Chrome） |
| `npm run build` | 构建到 `frontend/dist/` |
| `npm run preview` | 预览构建产物 |

固定端口加 `-- --port 5173 --strictPort`；手机访问加 `-- --host 0.0.0.0`。部署把 `frontend/dist/` 交给静态托管，访问形如 `/#/roadmap`。

## 项目结构

```text
agent-web/
├── README.md                 项目入口
├── 需求与分工.md              分工、需求、规则、具体任务
├── frontend/
│   ├── 开发说明.md            页面、文件、耦合点、排错
│   └── src/ tests/
└── backend/
    ├── 开发说明.md            后端运行与约定
    └── semester-planning/
        └── README.md         接口、校验、DeepSeek 配置
```

## 文档

| 文档 | 内容 |
| --- | --- |
| [`需求与分工.md`](./需求与分工.md) | 分工、范围、需求、规则、前后端任务、验收 |
| [`frontend/开发说明.md`](./frontend/开发说明.md) | 运行、页面、文件归属、耦合点、排错 |
| [`backend/开发说明.md`](./backend/开发说明.md) | 后端目录、运行、密钥约定 |
| [`backend/semester-planning/README.md`](./backend/semester-planning/README.md) | `/api/plan`、错误码、DeepSeek、校验 |

分工与需求只写 `需求与分工.md`；前后端细节各写自己的开发说明；模块细节只写模块 README。
