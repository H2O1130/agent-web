from collections.abc import Iterable
from typing import Any

from analysis.models import AnalyzeJob
from analysis.prompt import build_feedback, build_messages
from app.core.errors import ApiError
from app.llm.client import LLMInvalidOutput, LLMTimeout, LLMUnavailable
from app.models import Profile
from app.services.skill_registry import normalize_id, normalize_skills

SOURCE_COURSE = "AI 生成示例：需按本校培养方案核对"
SOURCE_PROJECT = "AI 生成示例：需按真实项目资料核对"
SOURCE_KIND = "AI 生成示例"
MAX_ATTEMPTS = 2


class _JobLike:
    def __init__(self, job: AnalyzeJob) -> None:
        self.id = job.id
        self.title = ""
        self.role = ""
        self.text = job.text


def analyze(jobs: list[AnalyzeJob], profile: Profile | None, client) -> dict[str, object]:
    if client is None:
        raise ApiError(503, "LLM_NOT_CONFIGURED", "还没有填写模型密钥，请先在模型设置里保存。")
    if not jobs:
        raise ApiError(400, "NO_JOBS", "请先选择至少一条岗位样本。")

    messages = build_messages([_JobLike(job) for job in jobs], profile)
    texts = {job.id: job.text for job in jobs}
    last_status, last_code = 502, "LLM_INVALID_ANALYZE"
    last_error = "岗位分析结果不可用，请稍后重试。"

    for _ in range(MAX_ATTEMPTS):
        try:
            raw = client.complete_json(messages)
        except LLMTimeout:
            last_status, last_code = 504, "LLM_TIMEOUT"
            last_error = "岗位分析响应超时，请稍后重试。"
            continue
        except LLMUnavailable:
            last_status, last_code = 502, "LLM_UNAVAILABLE"
            last_error = "岗位分析服务暂时不可用，请稍后重试。"
            continue
        except LLMInvalidOutput as exc:
            messages = build_feedback(messages, [exc.message])
            last_status, last_code = 502, "LLM_INVALID_REPLY"
            last_error = "岗位分析结果格式不正确，请稍后重试。"
            continue

        if not isinstance(raw, dict):
            messages = build_feedback(messages, ["输出必须是 JSON 对象"])
            continue

        skills = normalize_skills(_as_list(raw.get("skills")))
        errors = _check_evidence(skills, texts)
        mappings = _build_mappings(_as_list(raw.get("mappings")), skills, errors)
        if errors:
            messages = build_feedback(messages, errors)
            last_status, last_code = 502, "LLM_INVALID_ANALYZE"
            last_error = "岗位分析结果未通过校验，请稍后重试。"
            continue

        return {"skills": skills, "mappings": mappings}

    raise ApiError(last_status, last_code, last_error)


def _as_list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _check_evidence(skills: list[dict], texts: dict[str, str]) -> list[str]:
    errors: list[str] = []
    for skill in skills:
        if not skill.get("evidence"):
            errors.append(f"技能 {skill['id']} 缺少原文证据")
            continue
        for evidence in skill["evidence"]:
            text = texts.get(evidence["jobId"])
            if text is None:
                errors.append(f"技能 {skill['id']} 引用了未知岗位")
            elif evidence["sentence"].strip() not in text:
                errors.append(f"技能 {skill['id']} 的证据不是原文")
    return errors


def _build_mappings(
    rows: Iterable[object],
    skills: list[dict],
    errors: list[str],
) -> list[dict]:
    by_id = {skill["id"]: skill for skill in skills}
    result: dict[str, dict] = {}
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            errors.append(f"第 {index + 1} 条映射不是对象")
            continue
        skill_id = normalize_id(str(row.get("skillId") or ""))
        skill = by_id.get(skill_id)
        if skill is None:
            errors.append(f"第 {index + 1} 条映射引用了本次技能之外的 id")
            continue
        course = str(row.get("course") or "").strip()
        project = str(row.get("project") or "").strip()
        outcome = str(row.get("outcome") or "").strip()
        acceptance = str(row.get("acceptance") or "").strip()
        reason = str(row.get("reason") or "").strip()
        if not (course and project and outcome and acceptance and reason):
            errors.append(f"技能 {skill_id} 的课程映射字段不完整")
            continue
        if len(reason) > 200:
            errors.append(f"技能 {skill_id} 的推荐理由超过 200 字")
            continue
        semester = row.get("courseSemester")
        if semester is not None and (
            isinstance(semester, bool) or not isinstance(semester, int) or not 1 <= semester <= 8
        ):
            errors.append(f"技能 {skill_id} 的课程学期不合法")
            continue
        result[skill_id] = {
            "skillId": skill_id,
            "skillName": skill["name"],
            "skillCount": len(skill["evidence"]),
            "jobIds": list(dict.fromkeys(item["jobId"] for item in skill["evidence"])),
            "courseId": normalize_id(course),
            "course": course,
            "courseSemester": semester,
            "projectId": normalize_id(project),
            "project": project,
            "outcome": outcome,
            "acceptance": acceptance,
            "reason": reason,
            "alreadyTaken": bool(row.get("alreadyTaken")),
            "courseSource": SOURCE_COURSE,
            "projectSource": SOURCE_PROJECT,
            "sourceKind": SOURCE_KIND,
        }

    missing = [skill["id"] for skill in skills if skill["id"] not in result]
    if missing:
        errors.append("缺少课程映射：" + "、".join(missing))
    return [result[skill["id"]] for skill in skills if skill["id"] in result]
