from app.data.micro_tasks import MicroTask
from app.llm.schema import LLMPeriod
from app.models import Profile
from app.services.micro_catalog import prerequisites_for

SEMESTERS_IN_PLAN = 8
WINTER_SEMESTERS = {1, 3, 5, 7}
SUMMER_SEMESTERS = {2, 4, 6, 8}
SEMESTER_MIN = 3
SEMESTER_MAX = 5
VACATION_MIN = 2
VACATION_MAX = 4


def validate_periods(
    periods: list[LLMPeriod],
    profile: Profile,
    catalog: list[MicroTask],
    required_ids: set[str],
) -> list[str]:
    errors: list[str] = []
    catalog_map = {task.id: task for task in catalog}
    position: dict[str, tuple[int, int]] = {}
    seen: set[str] = set()
    seen_periods: set[tuple[str, int]] = set()

    for period in periods:
        key = (period.kind, period.semester)
        if key in seen_periods:
            errors.append(f"{_period_name(period.kind, period.semester)}重复")
        seen_periods.add(key)

        _validate_period_time(period, profile, errors)
        _validate_period_text(period, errors)
        _validate_density(period, errors)

        period_index = _period_index(period.kind, period.semester)
        for index, item in enumerate(period.items):
            if item.id not in catalog_map:
                errors.append(f"未知微任务 id：{item.id}")
                continue
            if item.id in seen:
                errors.append(f"微任务 id 重复：{item.id}")
                continue
            seen.add(item.id)
            position[item.id] = (period_index, index)

    missing = required_ids - seen
    if missing:
        errors.append("缺少必需微任务：" + "、".join(sorted(missing)))

    if not seen:
        errors.append("没有安排任何微任务")

    for period in periods:
        period_index = _period_index(period.kind, period.semester)
        for index, item in enumerate(period.items):
            task = catalog_map.get(item.id)
            if task is None:
                continue
            for prerequisite in prerequisites_for(task, profile):
                if prerequisite not in catalog_map:
                    # 前置任务所在的模块被替换掉了（例如把 Python 换掉），不再要求它
                    continue
                if prerequisite not in position:
                    errors.append(f"{item.id} 的前置微任务 {prerequisite} 未安排")
                elif position[prerequisite] >= (period_index, index):
                    errors.append(f"{item.id} 排在前置微任务 {prerequisite} 之前")

    return errors


def _validate_period_time(
    period: LLMPeriod,
    profile: Profile,
    errors: list[str],
) -> None:
    name = _period_name(period.kind, period.semester)

    if period.kind == "semester":
        if not profile.semester <= period.semester <= SEMESTERS_IN_PLAN:
            errors.append(
                f"第 {period.semester} 学期不在 "
                f"{profile.semester}—{SEMESTERS_IN_PLAN} 之间"
            )
        return

    allowed = WINTER_SEMESTERS if period.kind == "winter" else SUMMER_SEMESTERS
    if period.semester not in allowed:
        errors.append(f"{name} 的学期位置不正确")
    if period.semester < profile.semester:
        errors.append(f"{name} 已经过去，不应再安排")


def _validate_period_text(period: LLMPeriod, errors: list[str]) -> None:
    name = _period_name(period.kind, period.semester)
    if not period.title.strip():
        errors.append(f"{name}缺少 title")
    elif len(period.title.strip()) > 30:
        errors.append(f"{name}的 title 太长")
    if not period.goal.strip():
        errors.append(f"{name}缺少 goal")
    elif len(period.goal.strip()) > 60:
        errors.append(f"{name}的 goal 太长")
    if not period.output.strip():
        errors.append(f"{name}缺少 output")
    elif len(period.output.strip()) > 80:
        errors.append(f"{name}的 output 太长")
    if not period.items:
        errors.append(f"{name}没有任务")


def _validate_density(period: LLMPeriod, errors: list[str]) -> None:
    count = len(period.items)
    name = _period_name(period.kind, period.semester)
    if period.kind == "semester":
        if count < SEMESTER_MIN or count > SEMESTER_MAX:
            errors.append(
                f"{name} 应有 {SEMESTER_MIN}—{SEMESTER_MAX} 项，当前 {count} 项"
            )
        return

    if count < VACATION_MIN or count > VACATION_MAX:
        errors.append(f"{name} 应有 {VACATION_MIN}—{VACATION_MAX} 项，当前 {count} 项")


def _period_index(kind: str, semester: int) -> int:
    return (semester - 1) * 2 + (0 if kind == "semester" else 1)


def _period_name(kind: str, semester: int) -> str:
    if kind == "semester":
        return f"第 {semester} 学期"
    return _vacation_label(kind, semester)


def _vacation_label(kind: str, semester: int) -> str:
    year = ["大一", "大二", "大三", "大四"][(semester - 1) // 2]
    return f"{year}{'寒假' if kind == 'winter' else '暑假'}"
