import json

from app.core.registry import examples_for, role_names
from app.models import Job, PlanConstraints, Profile

SYSTEM_PROMPT = """你是大学生职业成长规划助手。根据岗位原文、画像和约束，生成一份可执行的分学期计划。

输出要求：
1. 只输出 JSON，不要 Markdown 或解释。
2. 结构：{"strategy": "...", "skills": [{"id","name","evidence":[{"jobId","sentence","kind"}]}], "periods": [...]}
3. skills 从岗位原文中提取，id 用小写英文/数字/连字符，别名尽量归并；evidence.sentence 必须是岗位原文中的原句片段。
4. periods 每项：{"kind":"semester|winter|summer","semester":1-8,"title","goal","output","decision","items":[...]}
   - semester 填学期；winter 填前一个学期（1/3/5/7）；summer 填前一个学期（2/4/6/8）
   - 不要输出当前学期之前的假期
5. items 每项必须包含完整字段：{"id","title","skillIds":[...],"course","outcome","acceptance","example","prerequisites":[...],"hours":1-8,"weeks":1-4,"kind":"基础|专项|项目|可选|备考","weekNote":"约 N 周"}
   - id 用英文小写短横线，全局唯一；prerequisites 只能引用本次任务 id
6. 任务总数 10—15；阶段 4—6 个；每学期 3—5 项，寒暑假 2—4 项
7. 前置任务必须排在更早阶段，或同一阶段更靠前；不能有环
8. 同一阶段内 Σ(hours/weeks) 不超过画像的每周小时数；不要排满
9. 任务并集必须覆盖 skills 中至少 60% 的技能
10. course/outcome/acceptance/example 都必须具体可检查；课程与实践是 AI 生成示例，不要声称来自真实培养方案
11. profile.path=graduate 时优先保证数学、英语备考；hours=0 时仍输出完整任务清单，但说明当前暂停排期
12. 遵守用户约束：addSkills 必须安排，removeSkills 不再出现，keepTaskTitles 尽量沿用标题
13. 每条任务的所有字段都必须填写，尤其是 course、outcome、acceptance、example，不允许省略或留空
14. 每个学期至少 3 项，寒暑假至少 2 项；总任务 10—15 条，阶段 4—6 个

示例（仅示范字段，不要照抄任务）：
{"strategy":"先补基础，再用项目串起来。","skills":[{"id":"javascript","name":"JavaScript","evidence":[{"jobId":"one","sentence":"掌握 JavaScript","kind":"明确要求"}]}],"periods":[{"kind":"semester","semester":3,"title":"打牢基础","goal":"完成页面与交互。","output":"一个可用页面。","decision":"","items":[{"id":"page-basics","title":"搭建页面骨架","skillIds":["javascript"],"course":"Web 程序设计","outcome":"完成页面结构与基础交互","acceptance":"手机和桌面都能正常操作","example":"做一个社团报名页并记录验证。","prerequisites":[],"hours":2,"weeks":2,"kind":"基础","weekNote":"约 2 周"}]}]}
"""


def build_dynamic_messages(
    profile: Profile,
    jobs: list[Job],
    direction: str,
    constraints: PlanConstraints,
) -> list[dict]:
    samples = examples_for(direction, 10)
    payload = {
        "profile": profile.model_dump(),
        "directionHint": direction,
        "directionName": role_names().get(direction, direction),
        "constraints": constraints.model_dump(),
        "jobs": [
            {
                "id": job.id,
                "title": job.title,
                "role": job.role,
                "text": job.text[:1600],
            }
            for job in jobs
        ],
        "taskStyleExamples": [
            {
                "title": item.get("title", ""),
                "skillIds": item.get("skillIds", []),
                "course": item.get("course", ""),
                "outcome": item.get("outcome", ""),
                "acceptance": item.get("acceptance", ""),
                "example": item.get("example", ""),
                "hours": item.get("hours", 2),
                "weeks": item.get("weeks", 2),
                "kind": item.get("kind", "专项"),
            }
            for item in samples
        ],
    }
    user_prompt = "请生成计划，只输出 json：\n" + json.dumps(payload, ensure_ascii=False, indent=2)
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]


def build_feedback(messages: list[dict], errors: list[str]) -> list[dict]:
    shown = "\n".join(f"- {error}" for error in errors[:12])
    return [
        *messages,
        {
            "role": "user",
            "content": f"上次输出未通过校验：\n{shown}\n请修正后只输出 json。",
        },
    ]
