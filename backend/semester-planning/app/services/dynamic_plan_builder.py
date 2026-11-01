from datetime import UTC, datetime
from uuid import uuid4

from app.core.registry import role_names, skill_name
from app.llm.dynamic_schema import DynamicPlan
from app.models import (
    Milestone,
    Plan,
    PlanRequest,
    PlannedTask,
    PlanOverview,
    Profile,
    SemesterPlan,
    VacationPlan,
)
from app.services.dynamic_validator import period_position, task_key

PATH_NAMES = {"job": "就业优先", "graduate": "考研优先", "undecided": "暂未确定"}
PATH_PRINCIPLES = {
    "job": "项目与作品集优先服务于实习和秋招。",
    "graduate": "数学、英语备考优先，项目服务于复试材料。",
    "undecided": "先保留可回退的基础能力，再根据项目完成度确定方向。",
}
DECISION_POINTS = {
    "job": "在关键假期前完成一个可演示项目，作为实习和秋招材料；做不完时优先缩小范围。",
    "graduate": "确认目标院校与考试科目；若模考差距持续过大，及时启用就业兜底。",
    "undecided": "根据项目完成度、课程成绩和兴趣确认就业或考研方向。",
}


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _period_label(kind: str, semester: int) -> str:
    if kind == "winter":
        return "寒假"
    if kind == "summer":
        return "暑假"
    return f"第 {semester} 学期"


def build_dynamic_plan(request: PlanRequest, plan: DynamicPlan, skills: list[dict]) -> Plan:
    ids: dict[str, str] = {}
    used: set[str] = set()
    for period in plan.periods:
        for task in period.items:
            base = task_key(task.title)
            final = base
            index = 2
            while final in used:
                final = f"{base}-{index}"
                index += 1
            used.add(final)
            ids[task.id] = final

    tasks: list[PlannedTask] = []
    semesters: list[SemesterPlan] = []
    vacations: list[VacationPlan] = []
    paused = request.profile.hours == 0

    for period in sorted(plan.periods, key=lambda item: period_position(item.kind, item.semester)):
        label = _period_label(period.kind, period.semester)
        index = period_position(period.kind, period.semester)
        item_ids: list[str] = []

        for task in period.items:
            task_id = ids[task.id]
            skill_ids = [value for value in task.skillIds if value]
            module = skill_ids[0] if skill_ids else task.kind
            task_model = PlannedTask(
                id=task_id,
                title=task.title.strip(),
                skillIds=skill_ids,
                course=task.course.strip(),
                outcome=task.outcome.strip(),
                acceptance=task.acceptance.strip(),
                example=task.example.strip(),
                prerequisites=[ids[p] for p in task.prerequisites if p in ids],
                hours=max(1, int(round(float(task.hours)))),
                weeks=max(1, int(task.weeks)),
                semester=None if paused else period.semester,
                startWeek=None,
                weekNote="" if paused else (task.weekNote.strip() or f"约 {task.weeks} 周"),
                periodIndex=-1 if paused else index,
                periodLabel="待安排" if paused else label,
                periodKind="semester" if paused else period.kind,
                module=module,
                moduleName=skill_name(module) if skill_ids else task.kind,
                kind=task.kind if task.kind in {"基础", "专项", "项目", "可选", "备考"} else "专项",
                jobIds=list(dict.fromkeys(job.id for job in request.jobs)),
                reason="结合岗位要求与你的时间预算安排。",
            )
            tasks.append(task_model)
            item_ids.append(task_id)

        if paused:
            continue
        if period.kind == "semester":
            semesters.append(
                SemesterPlan(
                    semester=period.semester,
                    title=period.title.strip(),
                    goal=period.goal.strip(),
                    output=period.output.strip(),
                    decision=period.decision.strip(),
                    itemIds=item_ids,
                )
            )
        else:
            vacations.append(
                VacationPlan(
                    id=f"{period.kind}-{period.semester}",
                    kind=period.kind,
                    afterSemester=period.semester,
                    label=label,
                    title=period.title.strip(),
                    goal=period.goal.strip(),
                    output=period.output.strip(),
                    decision=period.decision.strip(),
                    itemIds=item_ids,
                )
            )

    stack = [item.get("name") or skill_name(item["id"]) for item in skills if item.get("id")]
    if not stack:
        stack = list(dict.fromkeys(skill_name(s) for task in tasks for s in task.skillIds))
    strategy = plan.strategy.strip()
    if len(strategy) < 20:
        strategy = (
            "当前每周预算为 0 小时，先保留任务清单；恢复时间后再按学期安排。"
            if paused
            else "先补岗位必需的基础，再用项目把技能串起来；按学期推进，不把每周时间排满。"
        )

    direction = request.directionHint or request.profile.role
    return Plan(
        id=str(uuid4()),
        version=request.version,
        createdAt=_now(),
        profile=request.profile.model_copy(deep=True),
        jobIds=list(dict.fromkeys(job.id for job in request.jobs)),
        overview=PlanOverview(
            goal=(
                f"{request.profile.major} · 第 {request.profile.semester} 学期 · "
                f"{role_names().get(direction, direction)} · {PATH_NAMES[request.profile.path]} · "
                f"每周 {request.profile.hours:g} 小时"
            ),
            strategy=strategy,
            principles=[
                "先补前置，再做专项，最后用项目把技能串起来。",
                "学期内以课程与基础为主，寒暑假集中做项目或补强。",
                PATH_PRINCIPLES[request.profile.path],
            ],
            stack=list(dict.fromkeys(stack))[:8],
            milestones=_milestones(semesters),
            decisionPoint=DECISION_POINTS[request.profile.path],
        ),
        semesters=semesters,
        vacations=vacations,
        tasks=tasks,
    )


def _milestones(semesters: list[SemesterPlan]) -> list[Milestone]:
    return [
        Milestone(
            semester=semester.semester,
            label=f"第 {semester.semester} 学期",
            title=semester.title or "阶段目标",
            evidence=semester.output or semester.goal or "完成阶段任务",
        )
        for semester in semesters[:4]
    ]


def validate_profile(profile: Profile) -> str:
    if not isinstance(profile.semester, int) or not 1 <= profile.semester <= 8:
        return "当前学期应为 1—8 的整数。"
    if not isinstance(profile.hours, (int, float)) or not 0 <= float(profile.hours) <= 30:
        return "每周时间应为 0—30 小时。"
    return ""
