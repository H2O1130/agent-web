import math

from pydantic import ValidationError

from app.core.errors import ApiError
from app.llm.client import LLMInvalidOutput, LLMTimeout, LLMUnavailable
from app.llm.prompt import build_feedback, build_messages
from app.llm.schema import LLMPlan
from app.models import Plan, PlanRequest
from app.services.job_analysis import extract_skills
from app.services.plan_builder import build_plan
from app.services.task_catalog import catalog_for_profile, required_task_ids
from app.services.validator import validate_tasks

MAX_ATTEMPTS = 2


def create_plan(request: PlanRequest, client) -> Plan:
    _validate_profile(request)

    if not request.jobs:
        raise ApiError(400, "NO_JOBS", "请先选择至少一条岗位样本。")

    analysis = extract_skills(request.jobs)
    if not analysis:
        raise ApiError(
            422,
            "NO_SKILLS",
            "暂未识别到支持的技能，请补充岗位文本或选择示例样本。",
        )

    catalog = catalog_for_profile(request.profile)
    required_ids = required_task_ids(
        request.profile,
        {stat.id for stat in analysis},
    )
    messages = build_messages(request.profile, analysis, catalog, required_ids)

    last_timeout = False
    last_unavailable = False

    for _ in range(MAX_ATTEMPTS):
        try:
            raw = client.complete_json(messages)
        except LLMTimeout:
            last_timeout = True
            last_unavailable = False
            continue
        except LLMUnavailable:
            last_unavailable = True
            last_timeout = False
            continue
        except LLMInvalidOutput as exc:
            last_timeout = False
            last_unavailable = False
            messages = build_feedback(messages, [exc.message])
            continue

        last_timeout = False
        last_unavailable = False

        try:
            llm_plan = LLMPlan.model_validate(raw)
        except ValidationError:
            messages = build_feedback(messages, ["输出结构不符合要求"])
            continue

        errors = validate_tasks(
            llm_plan.tasks,
            request.profile,
            catalog,
            required_ids,
        )
        if not errors:
            return build_plan(request, analysis, catalog, llm_plan.tasks)

        messages = build_feedback(messages, errors)

    if last_timeout:
        raise ApiError(504, "LLM_TIMEOUT", "规划服务响应超时，请稍后重试。")
    if last_unavailable:
        raise ApiError(502, "LLM_UNAVAILABLE", "规划服务暂时不可用，请稍后重试。")
    raise ApiError(
        502,
        "LLM_INVALID_PLAN",
        "规划结果未通过校验，请稍后重试。",
    )


def _validate_profile(request: PlanRequest) -> None:
    semester = request.profile.semester
    hours = request.profile.hours
    semester_ok = isinstance(semester, int) and 1 <= semester <= 8
    hours_ok = math.isfinite(hours) and 0 <= hours <= 30

    if not semester_ok or not hours_ok:
        raise ApiError(
            400,
            "INVALID_PROFILE",
            "请检查学期和每周时间，时间应为 0—30 小时。",
        )
