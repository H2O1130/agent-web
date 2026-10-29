import json

from app.data.tasks import TaskTemplate
from app.models import Profile, SkillStat

SYSTEM_PROMPT = """你是大学生职业成长规划助手。根据学生画像、岗位技能和任务目录，安排分学期任务。

规则：
1. 只能使用 taskCatalog 中的任务 id，不得重复。
2. 必须包含 requiredTaskIds 中的全部任务。
3. semester 必须在 profile.semester 到 8 之间且为整数。
4. startWeek 必须在 1 到 16 之间，且 startWeek + weeks - 1 <= 16，任务不得跨学期。
5. 前置任务必须已经安排，且其结束周早于当前任务的开始周。
6. 同一学期同一周内，所有并行任务的 hours 之和不得超过 profile.hours。
7. 放不下的任务把 semester 和 startWeek 设为 null，并在 reason 说明原因。
8. 每项任务都要写非空 reason。
9. 只输出 JSON，不要输出解释或 Markdown。

输出格式：
{"tasks":[{"id":"foundation","semester":3,"startWeek":1,"reason":"..."}]}
"""


def build_messages(
    profile: Profile,
    analysis: list[SkillStat],
    catalog: list[TaskTemplate],
    required_ids: set[str],
) -> list[dict]:
    payload = {
        "profile": profile.model_dump(),
        "skills": [
            {
                "id": stat.id,
                "name": stat.name,
                "count": stat.count,
                "jobIds": sorted({item.jobId for item in stat.evidence}),
            }
            for stat in analysis
        ],
        "requiredTaskIds": sorted(required_ids),
        "taskCatalog": [task.to_prompt() for task in catalog],
    }

    user_prompt = "请根据以下输入安排任务，只输出 json：\n" + json.dumps(
        payload, ensure_ascii=False, indent=2
    )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]


def build_feedback(messages: list[dict], errors: list[str]) -> list[dict]:
    shown = "\n".join(f"- {error}" for error in errors[:12])
    feedback = f"上次输出未通过校验：\n{shown}\n请修正后只输出 json。"
    return [*messages, {"role": "user", "content": feedback}]
