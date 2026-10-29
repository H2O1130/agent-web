# Skill Merger：AI 技能归并模块

## 1. 模块定位

本模块负责 PathPilot 工作流中的“技能归并”阶段：

```text
岗位原文 → 大模型生成归并候选 → 程序校验 → 同义归并与去重 → SkillStat[]
```

分工边界：

- 本模块负责标准技能词表、提示词、模型响应解析、证据校验、同义归并、岗位覆盖计数和结果排序。
- 模型调用方负责 API Key、HTTP 请求、超时、重试、降级及费用控制，并通过 `model_caller` 注入本模块。
- 后端联调方负责 Flask 路由、HTTP 错误映射和前后端数据传输。本模块本身不启动服务、不发送网络请求。
- 本模块不负责招聘要求提取、课程映射、分学期规划或方案差异。

只使用 Python 标准库，不需要安装额外依赖。输入输出字段与前端 `Job`、`Evidence`、`SkillStat` 契约兼容。

## 2. 目录与职责

```text
skill_merger/
├── __init__.py       对外公开 API
├── service.py        调用编排、响应校验、归并、去重和统计
├── prompt.py         受控词表与岗位数据的提示词构造
├── vocabulary.py     技能词表加载和完整性检查
├── skills.json       11 个标准技能及常见别名
├── types.py          输入、输出和模型调用函数类型
├── errors.py         模块异常
├── tests/            标准库 unittest 测试
└── README.md         本文档
```

核心对象只有 `SkillMerger`。词表加载、提示词构造和模型候选解析均作为内部实现，外部不需要组合多个服务对象。

## 3. 快速接入

### 3.1 最小示例

```python
import json
from skill_merger import SkillMerger


def call_model(prompt: str) -> str:
    # 由模型调用方实现：把 prompt 发给所选模型并返回文本。
    # 密钥、超时、重试和降级均在这一层处理。
    return json.dumps(
        {
            "matches": [
                {
                    "jobId": "job-1",
                    "skillId": "javascript",
                    "sentence": "熟悉 JavaScript 和 JS",
                    "kind": "明确要求",
                }
            ]
        },
        ensure_ascii=False,
    )


jobs = [
    {
        "id": "job-1",
        "text": "熟悉 JavaScript 和 JS。",
        "role": "frontend",
        "title": "前端开发实习生",
    }
]

skills = SkillMerger(model_caller=call_model).merge(jobs)
```

返回：

```json
[
  {
    "id": "javascript",
    "name": "JavaScript",
    "count": 1,
    "evidence": [
      {
        "jobId": "job-1",
        "sentence": "熟悉 JavaScript 和 JS",
        "kind": "明确要求"
      }
    ]
  }
]
```

`jobs` 可以传入完整的前端 `Job` 对象。模块只读取 `id` 和 `text`，其他字段不会发送给模型，也不会出现在结果中。

### 3.2 与成员 1 的模型入口对接

`model_caller` 的类型为 `Callable[[str], str]`：

- 输入：本模块生成的完整提示词字符串。
- 输出：模型返回的文本，必须是符合第 5 节契约的 JSON 对象字符串。
- 异常：调用方抛出的网络、鉴权、超时等异常会原样传给上层，避免本模块误改成员 1 的错误处理策略。

调用方只需保证“传入 prompt，返回模型文本”，因此可以适配任意模型供应商，也可以在测试中注入假模型。

### 3.3 与现有 `/api/analyze` 对接

后端联调方取得 `jobs` 后调用：

```python
skills = skill_merger.merge(jobs)
```

再把结果作为现有响应中的 `skills` 数组：

```json
{
  "skills": [
    {
      "id": "javascript",
      "name": "JavaScript",
      "count": 1,
      "evidence": []
    }
  ]
}
```

本包不包含 Flask 路由。HTTP 层的 `{code, message}` 错误包装由联调方完成。

## 4. Python API

### `SkillMerger(model_caller)`

创建一个归并器并加载包内默认词表。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `model_caller` | `Callable[[str], str]` | 必填。接收提示词并返回模型文本；不可调用时抛出 `TypeError` |

### `SkillMerger.merge(jobs)`

| 项 | 内容 |
| --- | --- |
| 参数 | `jobs: Sequence[JobInput]`；每项至少包含非空字符串 `id` 和 `text` |
| 返回 | `list[SkillStat]`；只包含至少有一条有效证据的技能 |
| 空输入 | 返回 `[]`，不会调用 `model_caller` |
| 重复岗位 ID | 与现有前端规则一致，同 ID 的最后一条岗位生效 |
| 模型调用次数 | 非空输入每次调用一次；重试由外部模型调用方决定 |

`SkillStat` 字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `str` | 标准技能 ID，如 `javascript` |
| `name` | `str` | 标准技能名称，如 `JavaScript` |
| `count` | `int` | 提及该技能的去重岗位数，不是关键词出现次数 |
| `evidence` | `list[Evidence]` | 该技能的原文证据 |

`Evidence` 字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `jobId` | `str` | 证据所属岗位 ID |
| `sentence` | `str` | 对应岗位 `text` 中逐字存在的原文片段 |
| `kind` | `明确要求 / 加分项 / 表述不明` | 证据分类 |

### 公开类型与异常

```python
from skill_merger import (
    Evidence,
    EvidenceKind,
    JobInput,
    JobValidationError,
    ModelCaller,
    ModelResponseError,
    SkillMergeError,
    SkillMerger,
    SkillStat,
)
```

| 异常 | 含义 | 建议 HTTP 映射（由联调方决定） |
| --- | --- | --- |
| `JobValidationError` | 岗位数组、岗位 ID 或原文不符合输入契约 | 400 |
| `ModelResponseError` | 模型响应不是约定 JSON，或包含未知 ID、伪造证据、非法分类 | 502 |
| `SkillMergeError` | 上述两类模块异常的共同基类 | 按具体子类处理 |

所有模块异常消息均为中文。模型调用方自身异常不属于上述异常，会原样传播。

## 5. 模型输入与输出契约

提示词包含：

1. 任务规则：同义归并、技能边界、原文证据和输出格式。
2. 标准技能词表：`id`、`name`、`aliases`。
3. 仅含 `id`、`text` 的岗位数组。

模型只返回归并候选，不直接返回覆盖数：

```json
{
  "matches": [
    {
      "jobId": "job-1",
      "skillId": "javascript",
      "sentence": "掌握 JavaScript，熟悉 JS",
      "kind": "明确要求"
    }
  ]
}
```

要求：

- `matches` 必须是数组；没有匹配时返回 `{"matches": []}`。
- `jobId` 必须来自本次输入岗位。
- `skillId` 必须来自 `skills.json`，不能直接创造新技能。
- `sentence` 去除首尾空白后，必须是对应岗位 `text` 的子字符串。
- `kind` 只能是三个固定中文值。
- 推荐直接返回 JSON；以 `json` 标记或无标记的完整 Markdown 代码块也可解析。

程序负责最终统计，避免模型生成无法复核的频次。任一候选校验失败时整次归并抛出 `ModelResponseError`，不会静默返回部分结果。

## 6. 归并与统计规则

1. **同义归并**：模型依据受控词表把 JS、JavaScript 等别名映射为同一个 `skillId`。
2. **技能隔离**：JavaScript 与 TypeScript 等不同 ID 不合并。
3. **岗位覆盖计数**：`count = len({evidence.jobId})`；同一岗位同一技能出现多次仍计 1。
4. **证据去重**：以 `(jobId, skillId, sentence)` 为键去重；同一句同一技能只保留第一条候选及其分类。
5. **多句证据**：同一岗位的不同原文句子可全部保留，但不会增加岗位覆盖数。
6. **排序**：先按 `count` 降序；覆盖数相同时按 `skills.json` 中的词表顺序排列。
7. **无命中**：没有有效证据的技能不出现在结果中，不生成 0 计数项。

## 7. 标准技能词表

| ID | 名称 | 常见别名示例 |
| --- | --- | --- |
| `programming` | 编程基础 | 编程、程序设计 |
| `html` | HTML / CSS | HTML、CSS、HTML/CSS |
| `javascript` | JavaScript | JS、ECMAScript |
| `typescript` | TypeScript | TS |
| `vue` | Vue | Vue.js、VueJS |
| `git` | Git | 版本控制 |
| `python` | Python | Python3 |
| `sql` | SQL | 数据库、关系型数据库 |
| `api` | API / 接口 | 接口开发、RESTful API |
| `testing` | 软件测试 | 自动化测试、单元测试 |
| `communication` | 沟通协作 | 沟通、团队协作 |

词表与当前前端的 11 个技能 ID 保持一致。增删 ID 属于共享数据契约变更，需要先与前端及规划负责人确认；仅补充别名不会改变返回结构。

## 8. 人工抽查建议

每次调整词表或提示词后，至少抽查以下样本：

- 同义句：`掌握 JavaScript，熟悉 JS`，应归并为一个技能且岗位计数为 1。
- 相邻技能：`JavaScript 与 TypeScript`，应返回两个不同技能。
- 多岗位：两个岗位都提 Python，`python.count` 应为 2。
- 加分项：`有 TypeScript 经验者优先`，证据应为 `加分项`。
- 无命中：岗位只提学历要求时，应返回空数组。
- 证据定位：逐条确认返回的 `sentence` 能在对应 `jobId` 的原文中直接找到。

测试使用可控假模型，用于验证程序归并和异常处理，不代表真实模型已完成质量评测或供应商联调。

## 9. 测试

在仓库根目录 `agent-web/` 执行：

```sh
python -m unittest discover -s skill_merger/tests -v
```

测试不访问网络、不读取 API Key，也不依赖 Flask 或其他第三方包。
