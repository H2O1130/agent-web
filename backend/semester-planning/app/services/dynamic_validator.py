"""动态计划校验：只依赖结构与预算，不依赖任何目录白名单。"""

import hashlib
import math
import re
from typing import Any

from app.llm.dynamic_schema import DynamicPlan
from app.models import Profile
from app.services.skill_registry import normalize_id

TASK_MIN = 8
TASK_MAX = 20
PERIOD_MIN = 3
PERIOD_MAX = 7
SEMESTER_DENSITY = (2, 6)
VACATION_DENSITY = (1, 5)
SEMESTER_MAX = 8
SKILL_COVERAGE = 0.6
WINTER_SEMESTERS = {1, 3, 5, 7}
SUMMER_SEMESTERS = {2, 4, 6, 8}
ID_PATTERN = re.compile(r"^[a-z0-9\u4e00-\u9fff][a-z0-9\u4e00-\u9fff-]*$")


def task_key(title: str) -> str:
    digest = hashlib.sha1(title.strip().lower().encode("utf-8")).hexdigest()
    return f"task-{digest[:8]}"


def period_position(kind: str, semester: int) -> int:
    if kind == "winter":
        return semester * 2 - 1
    if kind == "summer":
        return semester * 2
    return (semester - 1) * 2


def validate_dynamic_plan(
    plan: DynamicPlan,
    profile: Profile,
    skill_ids: set[str],
) -> list[str]:
    errors: list[str] = []
    tasks = [task for period in plan.periods for task in period.items]

    if not TASK_MIN <= len(tasks) <= TASK_MAX:
        errors.append(f"任务总数应为 {TASK_MIN}—{TASK_MAX} 条，当前 {len(tasks)} 条")
    if not PERIOD_MIN <= len(plan.periods) <= PERIOD_MAX:
        errors.append(f"阶段应为 {PERIOD_MIN}—{PERIOD_MAX} 个，当前 {len(plan.periods)} 个")

    seen_ids: set[str] = set()
    seen_periods: set[tuple[str, int]] = set()
    positions: dict[str, tuple[int, int]] = {}

    for period in plan.periods:
        _validate_period(period, profile, errors, seen_periods)
        low, high = (
            SEMESTER_DENSITY if period.kind == "semester" else VACATION_DENSITY
        )
        if not low <= len(period.items) <= high:
            errors.append(
                f"{_period_label(period.kind, period.semester)}应有 {low}—{high} 项，当前 {len(period.items)} 项"
            )
        position = period_position(period.kind, period.semester)
        for index, task in enumerate(period.items):
            if task.id in seen_ids:
                errors.append(f"任务 id 重复：{task.id}")
            seen_ids.add(task.id)
            positions[task.id] = (position, index)
            _validate_task(task, profile, errors)

    for period in plan.periods:
        if period.kind != "semester":
            continue
        budget = 0.0
        for task in period.items:
            hours = max(0.0, float(task.hours or 0))
            weeks = max(1, int(task.weeks or 1))
            budget += hours / weeks
        if profile.hours > 0 and budget > profile.hours + 0.001:
            errors.append(
                f"{_period_label(period.kind, period.semester)}每周约 {budget:g} 小时，超出预算 {profile.hours:g} 小时"
            )

    for task in tasks:
        if task.id not in positions:
            continue
        for prerequisite in task.prerequisites:
            if prerequisite not in positions:
                errors.append(f"{task.title} 的前置任务 {prerequisite} 不存在")
            elif positions[prerequisite] >= positions[task.id]:
                errors.append(f"{task.title} 排在前置任务 {prerequisite} 之前")

    if _has_cycle(tasks):
        errors.append("前置依赖存在环")

    covered = {
        normalize_id(skill_id)
        for task in tasks
        for skill_id in task.skillIds
        if normalize_id(skill_id)
    }
    expected = {normalize_id(skill_id) for skill_id in skill_ids if normalize_id(skill_id)}
    if expected:
        hit = len(expected & covered)
        if hit / len(expected) < SKILL_COVERAGE:
            errors.append(
                f"任务只覆盖 {hit}/{len(expected)} 个识别技能，低于 60%"
            )

    return errors


def _validate_period(period, profile: Profile, errors: list[str], seen: set[tuple[str, int]]) -> None:
    label = _period_label(period.kind, period.semester)
    key = (period.kind, period.semester)
    if key in seen:
        errors.append(f"{label}重复")
    seen.add(key)

    if period.kind == "semester":
        if not profile.semester <= period.semester <= SEMESTER_MAX:
            errors.append(f"{label}不在 {profile.semester}—{SEMESTER_MAX} 之间")
    else:
        allowed = WINTER_SEMESTERS if period.kind == "winter" else SUMMER_SEMESTERS
        if period.semester not in allowed:
            errors.append(f"{label}的学期位置不正确")
        if period.semester < profile.semester:
            errors.append(f"{label}已经过去，不应再安排")

    if not period.title.strip():
        errors.append(f"{label}缺少 title")
    elif len(period.title.strip()) > 30:
        errors.append(f"{label}的 title 太长")
    if not period.goal.strip():
        errors.append(f"{label}缺少 goal")
    elif len(period.goal.strip()) > 60:
        errors.append(f"{label}的 goal 太长")
    if not period.output.strip():
        errors.append(f"{label}缺少 output")
    elif len(period.output.strip()) > 80:
        errors.append(f"{label}的 output 太长")


def _validate_task(task, profile: Profile, errors: list[str]) -> None:
    label = task.title.strip() or task.id
    if not ID_PATTERN.match(task.id.strip()):
        errors.append(f"{label} 的任务 id 不合法（只允许小写字母、数字、中文与连字符）")
    if not task.title.strip() or len(task.title.strip()) > 40:
        errors.append(f"{label} 的标题缺失或超过 40 字")
    if len(task.outcome.strip()) > 120:
        errors.append(f"{label} 的 outcome 超过 120 字")
    if len(task.acceptance.strip()) > 120:
        errors.append(f"{label} 的 acceptance 超过 120 字")
    if len(task.example.strip()) > 200:
        errors.append(f"{label} 的 example 超过 200 字")
    if not task.course.strip():
        errors.append(f"{label} 缺少课程建议")
    if not task.outcome.strip() or not task.acceptance.strip():
        errors.append(f"{label} 缺少 outcome 或 acceptance")
    if not math.isfinite(float(task.hours)) or not 1 <= float(task.hours) <= 8:
        errors.append(f"{label} 的 hours 应为 1—8")
    if not 1 <= int(task.weeks) <= 4:
        errors.append(f"{label} 的 weeks 应为 1—4")
    if task.kind not in {"基础", "专项", "项目", "可选", "备考"}:
        errors.append(f"{label} 的 kind 不合法")
    if not task.skillIds:
        errors.append(f"{label} 没有关联技能")


def _has_cycle(tasks) -> bool:
    graph = {task.id: [p for p in task.prerequisites if p] for task in tasks}
    state: dict[str, int] = {}

    def visit(node: str) -> bool:
        if state.get(node) == 1:
            return True
        if state.get(node) == 2:
            return False
        state[node] = 1
        for next_node in graph.get(node, []):
            if next_node in graph and visit(next_node):
                return True
        state[node] = 2
        return False

    return any(visit(node) for node in graph)


def _period_label(kind: str, semester: int) -> str:
    if kind == "winter":
        return f"第 {semester} 学期后的寒假"
    if kind == "summer":
        return f"第 {semester} 学期后的暑假"
    return f"第 {semester} 学期"
