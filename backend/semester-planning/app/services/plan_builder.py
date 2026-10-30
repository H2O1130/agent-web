import re
from datetime import UTC, datetime
from uuid import uuid4

from app.data.micro_tasks import MicroTask
from app.llm.schema import LLMItem, LLMPeriod
from app.models import (
    Milestone,
    Plan,
    PlannedTask,
    PlanOverview,
    PlanRequest,
    Profile,
    SemesterPlan,
    SkillStat,
    VacationPlan,
)
from app.services.micro_catalog import module_course, module_name, prerequisites_for

ROLE_NAMES = {
    "frontend": "前端开发",
    "backend": "Python 后端开发",
}
PATH_NAMES = {
    "job": "就业优先",
    "graduate": "考研优先",
    "undecided": "暂未确定",
}
PATH_PRINCIPLES = {
    "job": "项目与作品集优先服务于实习和秋招。",
    "graduate": "数学、英语备考优先，项目服务于复试材料。",
    "undecided": "先保留可回退的基础能力，再根据项目完成度确定方向。",
}
DECISION_POINTS = {
    "job": "在大二暑假前完成一个可演示项目，作为实习和秋招材料；做不完时优先缩小范围。",
    "graduate": "大三上学期确认目标院校与考试科目；若模考差距持续过大，及时启用就业兜底。",
    "undecided": "第 4 学期结束前，根据项目完成度、课程成绩和兴趣确认就业或考研方向。",
}
PAUSED_REASON = "当前每周预算为 0 小时，课外任务暂停；有时间后再安排。"
SEMESTER_TITLE_PREFIX = re.compile(
    r"^(?:第\s*\d+\s*学期|大[一二三四][上下])\s*[·\-—:：]?\s*"
)
VACATION_TITLE_PREFIX = re.compile(
    r"^(?:大[一二三四]\s*(?:寒|暑)假|(?:寒|暑)假)\s*[·\-—:：]?\s*"
)
YEAR_NAMES = ["大一", "大二", "大三", "大四"]


def build_plan(
    request: PlanRequest,
    analysis: list[SkillStat],
    catalog: list[MicroTask],
    periods: list[LLMPeriod],
    strategy: str = "",
) -> Plan:
    catalog_map = {task.id: task for task in catalog}
    provided_ids = {item.id for period in periods for item in period.items}
    tasks: list[PlannedTask] = []
    semester_plans: list[SemesterPlan] = []
    vacation_plans: list[VacationPlan] = []

    for period in sorted(
        periods, key=lambda item: _period_index(item.kind, item.semester)
    ):
        label = _period_label(period.kind, period.semester)
        index = _period_index(period.kind, period.semester)
        title = _clean_period_title(period.title, label)
        item_ids: list[str] = []

        for item in period.items:
            task = catalog_map[item.id]
            tasks.append(
                _build_task(
                    item,
                    task,
                    analysis,
                    provided_ids,
                    request.profile,
                    period.semester,
                    index,
                    label,
                    period.kind,
                )
            )
            item_ids.append(item.id)

        if period.kind == "semester":
            semester_plans.append(
                SemesterPlan(
                    semester=period.semester,
                    title=title,
                    goal=period.goal.strip(),
                    output=period.output.strip(),
                    decision=period.decision.strip(),
                    itemIds=item_ids,
                )
            )
        else:
            vacation_plans.append(
                VacationPlan(
                    id=f"{period.kind}-{period.semester}",
                    kind=period.kind,
                    afterSemester=period.semester,
                    label=label,
                    title=title,
                    goal=period.goal.strip(),
                    output=period.output.strip(),
                    decision=period.decision.strip(),
                    itemIds=item_ids,
                )
            )

    overview = _build_overview(request.profile, analysis, tasks, strategy)

    return Plan(
        id=str(uuid4()),
        version=request.version,
        createdAt=_now(),
        profile=request.profile.model_copy(deep=True),
        jobIds=list(dict.fromkeys(job.id for job in request.jobs)),
        overview=overview,
        semesters=semester_plans,
        vacations=vacation_plans,
        tasks=tasks,
    )


def build_paused_plan(
    request: PlanRequest,
    analysis: list[SkillStat],
    catalog: list[MicroTask],
    required_ids: set[str],
) -> Plan:
    tasks = [
        _build_task(
            LLMItem(id=task.id),
            task,
            analysis,
            required_ids,
            request.profile,
            None,
            -1,
            "",
            "semester",
        )
        for task in catalog
        if task.id in required_ids
    ]

    overview = _build_overview(
        request.profile,
        analysis,
        tasks,
        "当前每周预算为 0 小时，先保留任务清单；恢复时间后再安排学期。",
    )

    return Plan(
        id=str(uuid4()),
        version=request.version,
        createdAt=_now(),
        profile=request.profile.model_copy(deep=True),
        jobIds=list(dict.fromkeys(job.id for job in request.jobs)),
        overview=overview,
        semesters=[],
        vacations=[],
        tasks=tasks,
    )


def _build_task(
    item: LLMItem,
    task: MicroTask,
    analysis: list[SkillStat],
    provided_ids: set[str],
    profile: Profile,
    semester: int | None,
    period_index: int,
    period_label: str,
    period_kind: str,
) -> PlannedTask:
    return PlannedTask(
        id=task.id,
        title=task.title,
        skillIds=list(task.skills),
        course=module_course(task),
        outcome=task.action,
        acceptance=task.done,
        example=task.example,
        prerequisites=[
            prerequisite
            for prerequisite in prerequisites_for(task, profile)
            if prerequisite in provided_ids
        ],
        hours=task.hours,
        weeks=task.weeks,
        semester=semester,
        startWeek=None,
        weekNote=item.weeks.strip() or f"约 {task.weeks} 周",
        periodIndex=period_index,
        periodLabel=period_label,
        periodKind=period_kind,
        module=task.module,
        moduleName=module_name(task),
        kind=task.kind,
        jobIds=_collect_job_ids(task, analysis),
        reason=task.why,
    )


def _build_overview(
    profile: Profile,
    analysis: list[SkillStat],
    tasks: list[PlannedTask],
    strategy: str,
) -> PlanOverview:
    stack = list(dict.fromkeys(stat.name for stat in analysis))
    return PlanOverview(
        goal=(
            f"{profile.major} · 第 {profile.semester} 学期 · "
            f"{ROLE_NAMES[profile.role]} · {PATH_NAMES[profile.path]} · "
            f"每周 {profile.hours:g} 小时"
        ),
        strategy=_build_strategy(profile, stack, strategy),
        principles=[
            "先补前置，再做专项，最后用项目把技能串起来。",
            "学期内以课程与基础为主，寒暑假集中做项目或补强。",
            PATH_PRINCIPLES[profile.path],
        ],
        stack=stack,
        milestones=_build_milestones(tasks),
        decisionPoint=DECISION_POINTS[profile.path],
    )


def _build_strategy(profile: Profile, stack: list[str], strategy: str) -> str:
    text = strategy.strip().replace("日预算", "每周预算")
    if len(text) >= 20:
        return text

    if profile.hours == 0:
        base = "当前每周预算为 0 小时，先保留任务清单；恢复时间后再按学期安排。"
    elif profile.path == "graduate":
        base = (
            "学期内先保证课程与数学、英语备考，寒暑假集中做项目和复试材料；"
            "不把每周排满，留出复习与调整空间。"
        )
    elif profile.path == "job":
        base = (
            "学期内补齐岗位技能链，寒暑假集中完成项目和作品集；"
            "预算不足时优先保留基础与岗位必需任务。"
        )
    else:
        base = (
            "先用小任务和项目探索方向，再根据完成情况决定就业或考研；"
            "优先保留可回退的基础能力。"
        )

    if stack:
        base += f" 优先补齐：{'、'.join(stack[:5])}。"
    base += f" 当前从第 {profile.semester} 学期开始，每周预算 {profile.hours:g} 小时。"
    return base


def _build_milestones(tasks: list[PlannedTask]) -> list[Milestone]:
    by_period: dict[int, list[PlannedTask]] = {}
    for task in tasks:
        if task.semester is None:
            continue
        by_period.setdefault(task.periodIndex, []).append(task)

    milestones: list[Milestone] = []
    for index in sorted(by_period):
        candidates = by_period[index]
        chosen = (
            next((task for task in candidates if task.kind == "项目"), None)
            or next((task for task in candidates if task.kind == "可选"), None)
            or candidates[-1]
        )
        milestones.append(
            Milestone(
                semester=chosen.semester or 0,
                label=chosen.periodLabel,
                title=chosen.title,
                evidence=chosen.acceptance,
            )
        )
    return milestones


def _collect_job_ids(task: MicroTask, analysis: list[SkillStat]) -> list[str]:
    job_ids: list[str] = []
    for stat in analysis:
        if stat.id not in task.skills:
            continue
        for evidence in stat.evidence:
            if evidence.jobId not in job_ids:
                job_ids.append(evidence.jobId)
    return job_ids


def _period_index(kind: str, semester: int) -> int:
    return (semester - 1) * 2 + (0 if kind == "semester" else 1)


def _period_label(kind: str, semester: int) -> str:
    if kind == "semester":
        return f"第 {semester} 学期"
    year = YEAR_NAMES[(semester - 1) // 2]
    return f"{year}{'寒假' if kind == 'winter' else '暑假'}"


def _clean_period_title(title: str, fallback: str) -> str:
    cleaned = SEMESTER_TITLE_PREFIX.sub("", title.strip())
    cleaned = VACATION_TITLE_PREFIX.sub("", cleaned.strip())
    return cleaned or fallback


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
