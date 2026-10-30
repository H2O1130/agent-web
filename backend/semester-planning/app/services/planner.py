import logging
import math

from pydantic import ValidationError

from app.core.errors import ApiError
from app.llm.client import LLMInvalidOutput, LLMTimeout, LLMUnavailable
from app.llm.prompt import build_feedback, build_messages
from app.llm.schema import LLMPlan
from app.models import Plan, PlanRequest
from app.services.job_analysis import extract_skills
from app.services.micro_catalog import (
    available_micro_tasks,
    catalog_with_custom,
    normalize_custom_tasks,
    required_micro_ids,
)
from app.services.plan_builder import build_paused_plan, build_plan
from app.services.validator import validate_periods

MAX_ATTEMPTS = 3
logger = logging.getLogger(__name__)


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

    custom_tasks = normalize_custom_tasks(request.customTasks)
    catalog = catalog_with_custom(request.profile, custom_tasks, request.dropModules)
    catalog_ids = {task.id for task in catalog}
    required_ids = {
        task_id
        for task_id in required_micro_ids(request.profile, {stat.id for stat in analysis})
        if task_id in catalog_ids
    }
    if request.profile.hours == 0:
        return build_paused_plan(request, analysis, catalog, required_ids)

    messages = build_messages(request.profile, analysis, catalog, required_ids)

    last_timeout = False
    last_unavailable = False

    for attempt in range(MAX_ATTEMPTS):
        try:
            raw = client.complete_json(messages)
        except LLMTimeout:
            logger.warning("attempt %s timeout", attempt + 1)
            last_timeout = True
            last_unavailable = False
            continue
        except LLMUnavailable:
            logger.warning("attempt %s unavailable", attempt + 1)
            last_unavailable = True
            last_timeout = False
            continue
        except LLMInvalidOutput as exc:
            logger.warning("attempt %s invalid output: %s", attempt + 1, exc.message)
            last_timeout = False
            last_unavailable = False
            messages = build_feedback(messages, [exc.message])
            continue

        last_timeout = False
        last_unavailable = False

        try:
            llm_plan = LLMPlan.model_validate(raw)
        except ValidationError as exc:
            logger.warning("attempt %s schema error: %s", attempt + 1, exc)
            messages = build_feedback(messages, ["输出结构不符合要求"])
            continue

        llm_plan = _dedupe_plan(llm_plan)

        errors = validate_periods(
            llm_plan.periods,
            request.profile,
            catalog,
            required_ids,
        )
        if not errors:
            return build_plan(
                request,
                analysis,
                catalog,
                llm_plan.periods,
                llm_plan.strategy,
            )

        logger.warning("attempt %s validation errors: %s", attempt + 1, errors[:8])
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


def _dedupe_plan(plan: LLMPlan) -> LLMPlan:
    seen: set[str] = set()
    periods = []
    for period in plan.periods:
        items = []
        for item in period.items:
            if item.id in seen:
                logger.warning(
                    "drop duplicate item %s in %s %s",
                    item.id,
                    period.kind,
                    period.semester,
                )
                continue
            seen.add(item.id)
            items.append(item)
        period.items = items
        if items:
            periods.append(period)
    plan.periods = periods
    return plan


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
