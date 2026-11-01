import json

from app.models import Job, Profile

SYSTEM_PROMPT = """你是岗位分析与课程映射助手。根据岗位原文和画像，输出技能清单与学习映射。

要求：
1. 只输出 JSON，不要 Markdown 或解释。
2. 结构：{"skills":[{"id","name","evidence":[{"jobId","sentence","kind"}]}],
   "mappings":[{"skillId","course","courseSemester","project","outcome","acceptance","reason","alreadyTaken"}]}
3. 技能 id 用小写英文/数字/连字符；同一技能只出现一次；evidence.sentence 必须是原文原句片段，kind 取「明确要求 / 加分项 / 表述不明」。
4. mappings 必须与 skills 一一对应且同序；course/project/outcome/acceptance/reason 必须具体；reason 不超过 200 字。
5. courseSemester 为 1—8 的整数或 null；alreadyTaken 根据画像里的已修课程判断。
6. 课程与实践是 AI 生成示例，不要声称来自真实培养方案或真实项目库。
7. 技能数量控制在 4—10 个，优先岗位反复提到的能力。
"""


def build_messages(jobs: list[Job], profile: Profile | None) -> list[dict]:
    payload = {
        "profile": profile.model_dump() if profile is not None else None,
        "jobs": [
            {"id": job.id, "title": job.title, "role": job.role, "text": job.text[:1600]}
            for job in jobs
        ],
    }
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": "请输出分析结果，只输出 json：\n" + json.dumps(payload, ensure_ascii=False, indent=2)},
    ]


def build_feedback(messages: list[dict], errors: list[str]) -> list[dict]:
    shown = "\n".join(f"- {error}" for error in errors[:10])
    return [*messages, {"role": "user", "content": f"上次输出未通过校验：\n{shown}\n请修正后只输出 json。"}]
