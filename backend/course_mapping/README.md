# 课程与实践映射（course_mapping）

把技能归并结果映射为「技能 → 课程 → 实践」，并回填课程/项目来源。对应需求 FR-09 与分工中「课程与实践映射（调用大模型）」的交付：课程/项目资料、映射表与来源。

## 1. 模块定位与边界

```text
岗位原文 → 技能归并（SkillStat[]）→ 本模块：技能 + 画像 + 课程/项目资料 → 模型选课 → 校验 → 映射表（含来源）
```

| 角色 | 负责 | 不在本模块 |
| --- | --- | --- |
| 本模块（刘奕辰） | 课程/项目示例资料表、提示词、模型响应解析、课程—项目一致性校验、来源回填 | 不发起 HTTP 请求、不读环境变量、不打印密钥、不启动服务 |
| 模型调用方（赖叶盛） | API Key、超时、重试 1 次、错误码包装，通过 `model_caller` 注入 | 不校验课程与技能的一致性 |
| 技能归并（许韦垚） | 输出 `SkillStat[]`，可直接作为本模块输入 | 不关心课程与实践 |
| 分学期规划（陈锦尧） | 用 `courseId`/`projectId` 对齐任务目录 | 不改写本模块结果 |
| 前端（马凯） | 展示 `course`/`project`/`outcome`，需要时新增 `api.ts` | 本模块不改 `frontend/src/types.ts` |

红线：资料表全部标注「示例」；校验失败只报错，不回退本地规则；模块不改前端共享契约文件。

## 2. 目录

```text
backend/course_mapping/
├── README.md            本文档
├── requirements.txt     运行依赖（仅标准库）
├── requirements-dev.txt 测试依赖（pytest）
├── pytest.ini           注册 live 标记
├── .env.example         live 测试用的环境变量样例（不含密钥）
├── conftest.py          把模块根加入 sys.path，便于 import app
├── app/
│   ├── __init__.py      对外公开 API
│   ├── catalog.json     17 门课程 + 18 个项目的示例资料
│   ├── catalog.py       资料加载、完整性校验、来源拼装、提示词数据
│   ├── prompt.py        提示词构造
│   ├── service.py       CourseMapper：输入校验、调用、响应校验、回填
│   ├── types.py         输入/输出 TypedDict
│   └── errors.py        模块异常
└── tests/
    ├── test_catalog.py  资料表完整性与损坏反例
    ├── test_service.py  映射、校验 M1—M7 与异常
    ├── test_contract.py 与 frontend/data.ts、planning.ts、skill_merger 的一致性
    └── test_live.py     真实 DeepSeek 联调（需 DEEPSEEK_API_KEY，默认跳过）
```

## 3. 快速接入

```python
import json
from app import CourseMapper


def call_model(prompt: str) -> str:
    # 由模型调用方实现：发请求并返回文本。
    # 密钥、超时、重试、错误码都在这一层处理。
    return json.dumps(
        {
            "mappings": [
                {
                    "skillId": "javascript",
                    "courseId": "web-programming",
                    "projectId": "campus-signup-app",
                    "reason": "岗位要求交互与表单校验，课程覆盖 DOM 与校验，项目要求完整报名流程。",
                }
            ]
        },
        ensure_ascii=False,
    )


rows = CourseMapper(model_caller=call_model).map(
    [
        {
            "id": "javascript",
            "count": 2,
            "evidence": [
                {"jobId": "fe-01", "sentence": "掌握 HTML/CSS、JavaScript", "kind": "明确要求"},
                {"jobId": "fe-03", "sentence": "掌握 JavaScript、TypeScript 和 Vue", "kind": "明确要求"},
            ],
        }
    ],
    {"semester": 3, "role": "frontend", "path": "job", "courses": "程序设计基础"},
)
```

返回（单条）：

```json
{
  "skillId": "javascript",
  "skillName": "JavaScript",
  "skillCount": 2,
  "jobIds": ["fe-01", "fe-03"],
  "courseId": "web-programming",
  "course": "Web 程序设计",
  "courseSemester": 3,
  "projectId": "campus-signup-app",
  "project": "校园活动报名应用",
  "outcome": "完成表单、数据筛选与交互反馈",
  "acceptance": "处理空输入、重复报名和数据恢复",
  "reason": "岗位要求交互与表单校验，课程覆盖 DOM 与校验，项目要求完整报名流程。",
  "alreadyTaken": false,
  "courseSource": "示例培养方案·计算机科学与技术 2024 版 · 第 3 学期 · 必修 · 3 学分",
  "projectSource": "示例课程项目库 · 课程项目 · 12 标准小时 · 关联课程：Web 程序设计",
  "sourceKind": "示例"
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `skillId` / `skillName` | `str` | 标准技能 ID 与名称，取自资料表词表 |
| `skillCount` | `int` | 输入给出的岗位覆盖数；未给出时等于去重后的 `jobIds` 数量 |
| `jobIds` | `str[]` | 从输入证据中去重后的岗位 ID，用于回查招聘原文 |
| `courseId` / `course` / `courseSemester` | `str` / `str` / `int \| null` | 课程标识、名称、建议学期（备考课为 `null`） |
| `projectId` / `project` | `str` | 实践项目标识与名称 |
| `outcome` / `acceptance` | `str` | 成果与验收标准，兼容前端 `mapping.outcome` |
| `reason` | `str` | 模型给出的选课理由，≤200 字单行 |
| `alreadyTaken` | `bool` | 课程名或课程 ID 出现在画像 `courses` 文本中；子串匹配，需人工复核 |
| `courseSource` / `projectSource` | `str` | 来源，含「示例」字样与学期/类别/学分或项目类型/小时 |
| `sourceKind` | `str` | 固定「示例」；接入真实教务数据前不得改变 |

映射结果按输入技能顺序返回，不重新排序，便于前端与规划直接对齐。

## 4. Python API

### `CourseMapper(model_caller)`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `model_caller` | `Callable[[str], str]` | 必填。接收提示词、返回模型文本；不可调用时抛 `TypeError` |

包内自动加载 `app/catalog.json`，资料损坏时构造即抛 `CatalogError`。

### `CourseMapper.catalog`

只读资料表对象，供调试或对齐使用：`skills`、`courses`、`projects`、`course_source(course)`、`project_source(project)`、`courses_for_skill(id)`、`projects_for_skill(id)`。

### `CourseMapper.map(skills, profile=None)`

| 项 | 内容 |
| --- | --- |
| 参数 | `skills: Sequence[SkillInput]`；每项至少含非空字符串 `id` |
| 可选参数 | `profile: ProfileInput \| None`，只作提示词上下文与「已修」判断 |
| 返回 | `list[MappingRow]`，每条对应一个输入技能 |
| 空输入 | 返回 `[]`，不调用 `model_caller` |
| 重复技能 ID | 与技能归并一致，同 ID 的最后一条生效（保留首次出现的位置） |
| 调用次数 | 非空输入每次调用一次；重试由外部调用方决定 |

### 公开类型与异常

```python
from app import (
    Catalog,
    CatalogError,
    Course,
    CourseMapper,
    CourseMappingError,
    MappingInputError,
    MappingRow,
    ModelCaller,
    ModelResponseError,
    ProfileInput,
    Project,
    Skill,
    SkillInput,
)
```

| 异常 | 含义 | 建议 HTTP 映射（联调方决定） |
| --- | --- | --- |
| `MappingInputError` | 技能或画像输入不符合契约（M6/M7） | 400 |
| `ModelResponseError` | 响应不是约定 JSON、ID 越界、课程—项目不一致、理由不合法（M1—M5） | 502 |
| `CatalogError` | 资料表结构或引用关系损坏 | 500 |
| `CourseMappingError` | 上述三类共同基类 | 按子类处理 |

模型调用方自身异常（超时、网络、鉴权）不包装，原样向上传播。

## 5. 输入契约

`SkillInput`（与前端 `SkillStat` 兼容，只有 `id` 必填）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `str` | 必须是资料表 11 项标准技能之一，否则 M6 |
| `count` | `int` | 可选，非负整数 |
| `evidence` | `Evidence[]` | 可选；只读取 `jobId`，用于回填 `jobIds` |

`ProfileInput`（全部可选，未知键忽略）：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `major` | `str` | 1—80 字 |
| `semester` | `int` | 1—8 |
| `role` | `str` | `frontend` / `backend` |
| `path` | `str` | `job` / `graduate` / `undecided` |
| `courses` | `str` | ≤800 字，已修课程自由文本 |

## 6. 模型契约

提示词（`app/prompt.py`）包含：任务规则 9 条、技能数据（`id`/`name`/`count`）、课程资料（`id`/`name`/`kind`/`semester`/`prerequisites`/`topics`/`skillIds`）、项目资料（`id`/`name`/`kind`/`hours`/`courseIds`/`skillIds`/`outcome`）、画像。**不发送招聘原文**，避免模型改写或编造证据。

模型只返回选择结果，静态字段（名称、成果、验收、来源）由后端回填：

```json
{
  "mappings": [
    { "skillId": "javascript", "courseId": "web-programming", "projectId": "campus-signup-app", "reason": "…" }
  ]
}
```

规则要点：

- 每个输入技能必须且只能有一条映射；`skillId` 取自输入技能。
- `courseId` 必须存在且 `skillIds` 包含该技能；`projectId` 必须存在、覆盖该技能、且 `courseIds` 包含所选课程。
- `reason` 为单行中文，≤80 字（后端放宽到 200 字校验）。
- 允许直接输出 JSON 或以 `json` 标记的完整代码块；解析失败、字段缺失、输出被截断都算不合法。
- 模型不返回覆盖数、不返回来源、不新增课程或项目。

调用方职责：密钥仅服务端环境变量；90 秒超时；失败重试 1 次；重试仍失败返回 502，不回退本地规则。

## 7. 校验规则

| 规则 | 内容 | 反例（tests） |
| --- | --- | --- |
| M1 结构 | 响应是 JSON 对象且 `mappings` 为数组；代码块需闭合；字段为字符串 | 非 JSON、`{}`、`{"mappings": {}}`、未闭合代码块 |
| M2 完整 | 每个输入技能恰好一条；不重复、不遗漏、不越界 | 未知技能、重复技能、缺少技能 |
| M3 课程 | `courseId` 存在，且课程 `skillIds` 包含该技能 | 未知课程、课程不覆盖技能 |
| M4 项目 | `projectId` 存在、覆盖该技能、`courseIds` 包含所选课程 | 未知项目、项目不覆盖技能、项目不属于该课程 |
| M5 理由 | 去掉首尾空白后非空、≤200 字、单行 | 空白、超长、含换行、非字符串 |
| M6 输入 | 技能为对象数组；`id` 在词表内；`count` 非负整数；`evidence` 条目有 `jobId` | 字符串输入、未知技能、负数、布尔值、字符串证据 |
| M7 画像 | 字段类型与范围符合第 5 节 | 学期 0/9、未知角色、超长专业或课程文本 |
| M8 空输入 | 技能为空时直接返回 `[]`，不调用模型 | 模型不被调用 |

任一条不通过即抛异常，不返回部分结果；重试与错误码由调用方决定。

## 8. 课程/项目示例资料

来源统一写在 `app/catalog.json` 的 `meta`：

- 课程：`示例培养方案·计算机科学与技术 2024 版`，拼装为「来源 · 第 N 学期 · 必修/选修/备考 · N 学分」。
- 项目：`示例课程项目库`，拼装为「来源 · 课程项目/综合项目/拓展项目/备考记录 · N 标准小时 · 关联课程」。
- `meta.sourceKind` 固定为「示例」，`app/catalog.py` 会校验；换真实数据时必须同时修改该校验与本节说明。
- `meta.replaceGuide`：保持字段结构，`courseId`/`projectId` 只增不改名，避免历史方案与差异对比失效。

### 8.1 默认映射表（11 项技能）

| 技能 | 课程（学期 · 类别 · 学分） | 实践项目（类型 · 标准小时） |
| --- | --- | --- |
| 编程基础 `programming` | 程序设计基础（1 · 必修 · 3） | 命令行待办工具（课程项目 · 6） |
| HTML / CSS `html` | Web 开发基础（2 · 必修 · 2） | 响应式校园介绍页（课程项目 · 8） |
| JavaScript `javascript` | Web 程序设计（3 · 必修 · 3） | 校园活动报名应用（课程项目 · 12） |
| TypeScript `typescript` | Web 程序设计（拓展）（4 · 选修 · 2） | 有类型的活动数据模块（课程项目 · 8） |
| Vue `vue` | 前端框架实践（拓展）（4 · 选修 · 2） | Vue 校园活动工作台（课程项目 · 14） |
| Git `git` | 软件工程实践（4 · 必修 · 3） | 双人协作练习仓库（课程项目 · 6） |
| Python `python` | Python 程序设计（3 · 必修 · 3） | 课程数据处理工具（课程项目 · 10） |
| SQL `sql` | 数据库原理（4 · 必修 · 3） | 课程管理数据模块（课程项目 · 10） |
| API / 接口 `api` | Web 开发 / 软件工程（5 · 必修 · 3） | 校园服务接口联调（课程项目 · 12） |
| 软件测试 `testing` | 软件测试（5 · 选修 · 2） | 项目关键流程验证（课程项目 · 8） |
| 沟通协作 `communication` | 软件工程团队实践（6 · 必修 · 2） | 项目演示与复盘（课程项目 · 6） |

该表是资料表的默认组合，不等同于模型输出。**2026-10-30 决定不做「每技能固定课程」限制**：模型可以在任何覆盖该技能的课程中选课，再在该课程内选项目；因此映射的课程可能与上表或 `planning.ts` 的任务课程不同，规划侧应按 `skillId` 对齐，而不是按课程名对齐。

### 8.2 课程资料（17 门）

| courseId | 课程 | 学期 | 类别 | 学分 | 先修 | 覆盖技能 |
| --- | --- | --- | --- | --- | --- | --- |
| `programming-basics` | 程序设计基础 | 1 | 必修 | 3 | — | programming |
| `web-basics` | Web 开发基础 | 2 | 必修 | 2 | programming-basics | html |
| `web-programming` | Web 程序设计 | 3 | 必修 | 3 | web-basics | javascript, html |
| `python-programming` | Python 程序设计 | 3 | 必修 | 3 | programming-basics | python |
| `web-programming-advanced` | Web 程序设计（拓展） | 4 | 选修 | 2 | web-programming | typescript |
| `frontend-framework` | 前端框架实践（拓展） | 4 | 选修 | 2 | web-programming-advanced | vue, javascript |
| `software-engineering-practice` | 软件工程实践 | 4 | 必修 | 3 | programming-basics | git, testing, communication |
| `database-principles` | 数据库原理 | 4 | 必修 | 3 | python-programming | sql |
| `web-development` | Web 开发 / 软件工程 | 5 | 必修 | 3 | database-principles | api, python |
| `software-testing` | 软件测试 | 5 | 选修 | 2 | software-engineering-practice | testing |
| `web-development-practice` | Web 开发实践（选做） | 5 | 选修 | 1 | web-programming | html, javascript, testing |
| `software-engineering-design` | 软件工程课程设计 | 6 | 必修 | 4 | web-development | communication, testing |
| `team-practice` | 软件工程团队实践 | 6 | 必修 | 2 | software-engineering-practice | communication |
| `software-testing-optional` | 软件测试（选做） | 6 | 选修 | 1 | software-testing | python, testing |
| `team-practice-optional` | 软件工程团队实践（选做） | 6 | 选修 | 1 | software-engineering-design | communication |
| `math-exam` | 数学备考（路径假设） | — | 备考 | 0 | — | — |
| `english-exam` | 英语备考（路径假设） | — | 备考 | 0 | — | — |

### 8.3 项目资料（18 个）

| projectId | 项目 | 类型 | 小时 | 所属课程 | 覆盖技能 |
| --- | --- | --- | --- | --- | --- |
| `cli-todo` | 命令行待办工具 | 课程项目 | 6 | programming-basics | programming |
| `responsive-campus-page` | 响应式校园介绍页 | 课程项目 | 8 | web-basics | html |
| `campus-signup-app` | 校园活动报名应用 | 课程项目 | 12 | web-programming | javascript, html |
| `typed-activity-module` | 有类型的活动数据模块 | 课程项目 | 8 | web-programming-advanced | typescript |
| `vue-activity-workbench` | Vue 校园活动工作台 | 课程项目 | 14 | frontend-framework | vue, javascript |
| `collab-repo` | 双人协作练习仓库 | 课程项目 | 6 | software-engineering-practice | git |
| `course-data-tool` | 课程数据处理工具 | 课程项目 | 10 | python-programming | python |
| `course-db-module` | 课程管理数据模块 | 课程项目 | 10 | database-principles | sql |
| `campus-service-api` | 校园服务接口联调 | 课程项目 | 12 | web-development | api, python |
| `key-flow-testing` | 项目关键流程验证 | 课程项目 | 8 | software-testing | testing |
| `demo-retro` | 项目演示与复盘 | 课程项目 | 6 | team-practice | communication |
| `frontend-project-delivery` | 校园活动报名项目 | 综合项目 | 26 | software-engineering-design | vue, api, javascript |
| `backend-project-delivery` | 课程管理后端项目 | 综合项目 | 26 | software-engineering-design | python, sql, api |
| `accessibility-mini-app` | 可访问性小项目 | 拓展项目 | 10 | web-development-practice | html, javascript, testing |
| `backend-flow-tests` | 关键业务自动化验证 | 拓展项目 | 8 | software-testing-optional | python, testing |
| `portfolio-pack` | 作品集与演示材料 | 拓展项目 | 6 | team-practice-optional | communication |
| `math-drill-log` | 错题与知识点记录 | 备考记录 | 12 | math-exam | — |
| `english-reading-log` | 阅读与词汇复盘记录 | 备考记录 | 12 | english-exam | — |

## 9. 与分学期任务目录对齐

`frontend/src/planning.ts` 的 16 个任务与资料表逐一对应；`tests/test_contract.py` 会解析该文件并校验「任务课程名一致、项目覆盖任务技能、项目属于该课程」，任一侧改名都会失败。

| taskId | 任务课程 | 实践项目 |
| --- | --- | --- |
| `foundation` | 程序设计基础 | 命令行待办工具 |
| `html` | Web 开发基础 | 响应式校园介绍页 |
| `javascript` | Web 程序设计 | 校园活动报名应用 |
| `typescript` | Web 程序设计（拓展） | 有类型的活动数据模块 |
| `vue` | 前端框架实践（拓展） | Vue 校园活动工作台 |
| `git` | 软件工程实践 | 双人协作练习仓库 |
| `python` | Python 程序设计 | 课程数据处理工具 |
| `sql` | 数据库原理 | 课程管理数据模块 |
| `api` | Web 开发 / 软件工程 | 校园服务接口联调 |
| `frontend-project` | 软件工程课程设计 | 校园活动报名项目 |
| `backend-project` | 软件工程课程设计 | 课程管理后端项目 |
| `frontend-extension` | Web 开发实践（选做） | 可访问性小项目 |
| `backend-extension` | 软件测试（选做） | 关键业务自动化验证 |
| `portfolio` | 软件工程团队实践（选做） | 作品集与演示材料 |
| `math` | 数学备考（路径假设） | 错题与知识点记录 |
| `english` | 英语备考（路径假设） | 阅读与词汇复盘记录 |

## 10. 测试

```sh
cd backend/course_mapping
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
pytest              # 103 条离线用例，2 条 live 自动跳过
pytest -m live -s   # 需要 DEEPSEEK_API_KEY，打印真实映射结果
```

macOS / Linux 用 `source .venv/bin/activate`。离线用例全部使用假模型，不访问网络、不读密钥。

覆盖：资料表完整性与 12 类损坏反例；M1—M7 全部反例；空输入不调用模型；重复技能取最后一条；理由长度/换行；输入顺序与 `jobIds` 去重；`alreadyTaken`；模型异常透传；与 `data.ts`、`planning.ts`、`skill_merger/skills.json` 的契约一致性。

### live 联调

- 密钥只从环境变量 `DEEPSEEK_API_KEY` 读取，不写入文件、不打印；`.env` 已被 `.gitignore` 忽略，`.env.example` 只有字段名。
- 模型固定 `deepseek-flash`（V4.1-Flash），`response_format=json_object`、关闭思考、`temperature=0.2`、90 秒超时。
- live 用例复现产品约定：校验失败重试 1 次再报错。

2026-10-30 实测（`deepseek-flash`，11 项技能 + 演示画像）：**1 次调用通过，未触发重试，耗时约 8.5 秒**；11 条映射的课程选择合理，`programming` 因画像写了「程序设计基础」正确返回 `alreadyTaken: true`，理由中说明「可作为复习巩固」。

## 11. 验收与抽查

- [ ] 演示画像 + 12 条样本：11 项技能各返回一条映射，课程/项目/来源齐全
- [ ] 每条结果都能用 `courseId`/`projectId` 在资料表中回查，来源含「示例」
- [ ] 模型给未知 ID、跨课程项目、漏技能时直接报错，不返回部分结果
- [ ] 空技能数组返回 `[]` 且不调用模型
- [ ] `pytest` 全绿，无网络与密钥依赖

人工抽查（每次改词表、资料或提示词后至少做一遍）：

1. 同一技能换一个合法项目仍能通过，换到别的课程的项目必须被拒。
2. `alreadyTaken` 与画像 `courses` 文本一致；课程名互为前缀时记录误判。
3. 课程先修链无环、无自引用；项目所属课程存在。
4. 备考任务（`math`/`english`）不产生技能映射，但资料表仍能对齐。

## 12. 已知差异与后续

- 统一接口（端点、请求/响应、错误码、模型入口语义）见仓库根 `接口契约.md`：本模块对应第 3.2 节 `POST /api/mapping` 与第 5 节 `callModel(prompt) -> 原始文本`，`MappingRow` 字段与该文件一致。
- `frontend/src/data.ts` 中 `api` 的课程名为「软件工程 / Web 开发」，`planning.ts` 与资料表为「Web 开发 / 软件工程」。以 `planning.ts` 为准，`test_contract.py` 单独登记该差异；前端切换映射数据源时需一并统一。
- 资料表 `skillIds` 不区分「主讲该技能」与「以该技能为工具」。live 实测中，画像已修 Python 课程时模型把 `python` 映射到「软件测试（选做）」（用 Python 写测试），理由成立但不是入门课。若要收紧，可在资料表增加 `primarySkillIds` 并让提示词优先主讲课程；按 2026-10-30 决定，暂不做固定课程限制。
- 模型 `temperature=0.2`，同一输入多次调用不保证课程完全一致；历史方案对比可能因此出现课程变化，需要在展示层说明。
- 画像 `courses` 只做子串判断，未解析学期与课程号；`scores` 未参与选课（与需求 D2/D3 一致）。
- 本模块不产出 HTTP 路由；接入时由联调方包装 `{code, message}` 并映射异常。前端如需展示，需要新增课程映射端点（如 `POST /api/mapping`）并在 `api.ts` 增加对应封装；本模块只负责 `CourseMapper.map` 的结果。
- 真实培养方案到位后：替换 `catalog.json`、放宽 `meta.sourceKind` 校验、更新第 8 节来源说明，并重跑 `pytest`。