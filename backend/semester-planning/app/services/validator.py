from app.data.tasks import TaskTemplate
from app.llm.schema import LLMTask
from app.models import Profile

WEEKS_PER_SEMESTER = 16
SEMESTERS_IN_PLAN = 8


def validate_tasks(
    tasks: list[LLMTask],
    profile: Profile,
    catalog: list[TaskTemplate],
    required_ids: set[str],
) -> list[str]:
    errors: list[str] = []
    catalog_map = {task.id: task for task in catalog}
    seen: set[str] = set()
    scheduled: dict[str, LLMTask] = {}

    for task in tasks:
        if task.id not in catalog_map:
            errors.append(f"未知任务 id：{task.id}")
        if task.id in seen:
            errors.append(f"任务 id 重复：{task.id}")
        seen.add(task.id)

    missing = required_ids - seen
    if missing:
        errors.append("缺少必需任务：" + "、".join(sorted(missing)))

    for task in tasks:
        template = catalog_map.get(task.id)
        if template is None:
            continue

        if not task.reason.strip():
            errors.append(f"{task.id} 缺少 reason")

        if task.semester is None:
            if task.startWeek is not None:
                errors.append(f"{task.id} 待安排时 startWeek 必须为 null")
            continue

        if not _is_int(task.semester):
            errors.append(f"{task.id} 的 semester 必须是整数")
            continue
        if not profile.semester <= task.semester <= SEMESTERS_IN_PLAN:
            errors.append(
                f"{task.id} 的 semester {task.semester} 不在 "
                f"{profile.semester}—{SEMESTERS_IN_PLAN} 之间"
            )

        if not _is_int(task.startWeek):
            errors.append(f"{task.id} 的 startWeek 必须是整数")
            continue
        if not 1 <= task.startWeek <= WEEKS_PER_SEMESTER:
            errors.append(f"{task.id} 的 startWeek {task.startWeek} 不在 1—16 之间")
            continue
        if task.startWeek + template.weeks - 1 > WEEKS_PER_SEMESTER:
            errors.append(
                f"{task.id} 跨学期：{task.startWeek} 周开始、持续 {template.weeks} 周"
            )

        scheduled[task.id] = task

    _validate_prerequisites(scheduled, catalog_map, errors)
    _validate_weekly_load(scheduled, catalog_map, profile, errors)

    if profile.hours == 0 and scheduled:
        errors.append("每周预算为 0 时所有任务都应为待安排")

    return errors


def _validate_prerequisites(
    scheduled: dict[str, LLMTask],
    catalog_map: dict[str, TaskTemplate],
    errors: list[str],
) -> None:
    for task_id, task in scheduled.items():
        template = catalog_map[task_id]
        for prerequisite_id in template.prerequisites:
            prerequisite = scheduled.get(prerequisite_id)
            if prerequisite is None:
                errors.append(f"{task_id} 的前置任务 {prerequisite_id} 未安排")
                continue

            prerequisite_template = catalog_map[prerequisite_id]
            prerequisite_end = (
                (prerequisite.semester - 1) * WEEKS_PER_SEMESTER
                + prerequisite.startWeek
                + prerequisite_template.weeks
                - 1
            )
            task_start = (task.semester - 1) * WEEKS_PER_SEMESTER + task.startWeek
            if prerequisite_end > task_start:
                errors.append(f"{task_id} 排在前置任务 {prerequisite_id} 结束之前")


def _validate_weekly_load(
    scheduled: dict[str, LLMTask],
    catalog_map: dict[str, TaskTemplate],
    profile: Profile,
    errors: list[str],
) -> None:
    if profile.hours <= 0:
        return

    loads: dict[tuple[int, int], int] = {}
    for task_id, task in scheduled.items():
        template = catalog_map[task_id]
        for week in range(task.startWeek, task.startWeek + template.weeks):
            key = (task.semester, week)
            loads[key] = loads.get(key, 0) + template.hours

    overloaded = [
        (semester, week, load)
        for (semester, week), load in sorted(loads.items())
        if load > profile.hours
    ]
    for semester, week, load in overloaded[:10]:
        errors.append(
            f"第 {semester} 学期第 {week} 周工时 {load} 超过预算 {profile.hours}"
        )


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)
