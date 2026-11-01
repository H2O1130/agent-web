import logging

from pydantic import ValidationError

from app.core.errors import ApiError
from app.core.registry import role_aliases, role_names
from app.llm.client import LLMInvalidOutput, LLMTimeout, LLMUnavailable
from app.llm.dynamic_prompt import build_dynamic_messages, build_feedback
from app.llm.dynamic_schema import DynamicPlan
from app.models import Plan, PlanRequest
from app.services.dynamic_plan_builder import build_dynamic_plan, validate_profile
from app.services.dynamic_validator import period_position, validate_dynamic_plan
from app.services.skill_registry import normalize_id, normalize_skills

MAX_ATTEMPTS = 3
logger = logging.getLogger(__name__)


def resolve_direction(request: PlanRequest) -> str:
    raw = (request.directionHint or "").strip()
    if not raw:
        raw = request.jobs[0].role if request.jobs else request.profile.role
    alias = role_aliases().get(raw.lower())
    if alias:
        return alias
    if raw in role_names():
        return raw
    return normalize_id(raw)


def create_plan(request: PlanRequest, client) -> Plan:
    problem = validate_profile(request.profile)
    if problem:
        raise ApiError(400, "INVALID_PROFILE", problem)
    if not request.jobs:
        raise ApiError(400, "NO_JOBS", "请先选择至少一条岗位样本。")

    direction = resolve_direction(request)

    if client is None:
        raise ApiError(503, "LLM_NOT_CONFIGURED", "还没有填写模型密钥，请先在模型设置里保存。")

    messages = build_dynamic_messages(
        request.profile, request.jobs, direction, request.constraints
    )
    job_texts = {job.id: job.text for job in request.jobs}
    last_status = 502
    last_code = "LLM_INVALID_PLAN"
    last_error = "规划服务暂时不可用，请稍后重试。"

    for attempt in range(MAX_ATTEMPTS):
        try:
            raw = client.complete_json(messages)
        except LLMTimeout:
            logger.warning("attempt %s timeout", attempt + 1)
            last_status, last_code = 504, "LLM_TIMEOUT"
            last_error = "规划服务响应超时，请稍后重试。"
            continue
        except LLMUnavailable:
            logger.warning("attempt %s unavailable", attempt + 1)
            last_status, last_code = 502, "LLM_UNAVAILABLE"
            last_error = "规划服务暂时不可用，请稍后重试。"
            continue
        except LLMInvalidOutput as exc:
            logger.warning("attempt %s invalid output: %s", attempt + 1, exc.message)
            messages = build_feedback(messages, [exc.message])
            last_status, last_code = 502, "LLM_INVALID_REPLY"
            last_error = "规划结果格式不正确，请稍后重试。"
            continue

        try:
            plan = DynamicPlan.model_validate(raw)
        except ValidationError as exc:
            logger.warning("attempt %s schema error: %s", attempt + 1, exc)
            messages = build_feedback(messages, ["输出结构不符合要求"])
            last_status, last_code = 502, "LLM_INVALID_REPLY"
            last_status, last_code = 502, "LLM_INVALID_PLAN"
            last_error = "规划结果格式不正确，请稍后重试。"
            continue

        skills = normalize_skills([item.model_dump() for item in plan.skills])
        evidence_errors = _check_evidence(skills, job_texts)
        _sanitize(plan, skills)
        skill_ids = {item["id"] for item in skills}

        errors = [*evidence_errors, *validate_dynamic_plan(plan, request.profile, skill_ids)]
        if not errors:
            return build_dynamic_plan(request, plan, skills)

        logger.warning("attempt %s validation errors: %s", attempt + 1, errors[:8])
        messages = build_feedback(messages, errors)
        last_status, last_code = 502, "LLM_INVALID_PLAN"
        last_error = "规划结果未通过校验，请稍后重试。"

    raise ApiError(last_status, last_code, last_error)


def _check_evidence(skills: list[dict], job_texts: dict[str, str]) -> list[str]:
    errors: list[str] = []
    for skill in skills:
        for evidence in skill.get("evidence", []):
            text = job_texts.get(evidence["jobId"])
            if text is None:
                errors.append(f"技能 {skill['id']} 的证据引用了未知岗位 {evidence['jobId']}")
                continue
            if evidence["sentence"].strip() not in text:
                errors.append(
                    f"技能 {skill['id']} 的证据不是岗位原文：{evidence['sentence'][:20]}"
                )
    return errors


def _sanitize(plan: DynamicPlan, skills: list[dict]) -> None:
    """在严格校验前做一小组容错：模型偶尔漏字段/写错顺序，不因此整份作废。"""
    names = {item["id"]: item["name"] for item in skills}

    for period in plan.periods:
        for task in period.items:
            task.skillIds = [normalize_id(value) for value in task.skillIds if value]
            if not task.skillIds and skills:
                task.skillIds = [skills[0]["id"]]
            if not task.course.strip():
                primary = names.get(task.skillIds[0], task.skillIds[0])
                task.course = f"{primary} 相关课程（AI 生成示例）"
            if not task.example.strip():
                task.example = task.outcome.strip() or task.title.strip()
            if not task.weekNote.strip():
                task.weekNote = f"约 {task.weeks} 周"
            task.hours = min(8, max(1, int(round(float(task.hours or 2)))))
            task.weeks = min(4, max(1, int(task.weeks or 2)))
            if task.kind not in {"基础", "专项", "项目", "可选", "备考"}:
                task.kind = "专项"
            task.title = task.title.strip()[:40]
            task.outcome = task.outcome.strip()[:120]
            task.acceptance = task.acceptance.strip()[:120]
            task.example = task.example.strip()[:200]

    position: dict[str, tuple[int, int]] = {}
    for period in plan.periods:
        base = period_position(period.kind, period.semester)
        for index, task in enumerate(period.items):
            position[task.id] = (base, index)

    for period in plan.periods:
        for task in period.items:
            cleaned: list[str] = []
            for prerequisite in task.prerequisites:
                if prerequisite == task.id or prerequisite not in position:
                    continue
                if position[prerequisite] >= position[task.id]:
                    continue
                if prerequisite not in cleaned:
                    cleaned.append(prerequisite)
            task.prerequisites = cleaned
