from app.data.micro_tasks import MICRO_TASKS, MODULES, MicroTask
from app.core.errors import ApiError
from app.models import CustomTask, Profile
from app.services.task_catalog import required_task_ids

CUSTOM_MODULE = "custom"
MAX_CUSTOM_TASKS = 8
CUSTOM_ID_PREFIX = "custom-"

DROPPABLE_MODULES = {
    "foundation",
    "html",
    "javascript",
    "typescript",
    "vue",
    "frontend-project",
    "frontend-extension",
    "python",
    "sql",
    "api",
    "backend-project",
    "backend-extension",
}

ROLE_MODULES = {
    "frontend": {
        "html",
        "javascript",
        "typescript",
        "vue",
        "frontend-project",
        "frontend-extension",
    },
    "backend": {
        "python",
        "sql",
        "api",
        "backend-project",
        "backend-extension",
    },
}
PORTFOLIO_PROJECT = {
    "frontend": "project-build",
    "backend": "backend-build",
}


def available_micro_tasks(profile: Profile) -> list[MicroTask]:
    modules = {"git", *ROLE_MODULES[profile.role], "portfolio"}
    if profile.path == "graduate":
        modules.update({"math", "english"})
    if "programming" not in profile.skills:
        modules.add("foundation")
    return [task for task in MICRO_TASKS if task.module in modules]


def micro_map(profile: Profile) -> dict[str, MicroTask]:
    return {task.id: task for task in available_micro_tasks(profile)}


def prerequisites_for(task: MicroTask, profile: Profile) -> tuple[str, ...]:
    if task.id == "portfolio-page":
        return (PORTFOLIO_PROJECT[profile.role],)
    return task.prerequisites


def required_micro_ids(profile: Profile, selected_skills: set[str]) -> set[str]:
    required_modules = required_task_ids(profile, selected_skills)
    available = available_micro_tasks(profile)
    by_id = {task.id: task for task in available}
    required = {
        task.id for task in available if task.core and task.module in required_modules
    }

    changed = True
    while changed:
        changed = False
        for task_id in list(required):
            task = by_id.get(task_id)
            if task is None:
                continue
            for prerequisite in prerequisites_for(task, profile):
                if prerequisite in by_id and prerequisite not in required:
                    required.add(prerequisite)
                    changed = True

    return required


def module_name(task: MicroTask) -> str:
    return task.label or MODULES[task.module].name


def module_course(task: MicroTask) -> str:
    return MODULES[task.module].course


def normalize_custom_tasks(items: list[CustomTask], status: int = 400, code: str = "INVALID_CUSTOM_TASKS") -> list[MicroTask]:
    """把对话里新增的任务转成目录条目，超出范围直接拒绝。"""
    if len(items) > MAX_CUSTOM_TASKS:
        raise ApiError(status, code, f"一次最多新增 {MAX_CUSTOM_TASKS} 个任务。")

    tasks: list[MicroTask] = []
    seen: set[str] = set()

    for index, item in enumerate(items, start=1):
        title = item.title.strip()
        action = item.action.strip()
        done = item.done.strip()
        if not title or not action or not done:
            raise ApiError(status, code, "新增任务需要标题、做什么和完成标准。")
        if len(title) > 40 or len(action) > 120 or len(done) > 120:
            raise ApiError(status, code, "新增任务说明太长，请精简后再试。")

        raw_id = item.id.strip().lower()
        slug = "".join(char if char.isalnum() or char == "-" else "-" for char in raw_id).strip("-")
        task_id = slug if slug.startswith(CUSTOM_ID_PREFIX) else f"{CUSTOM_ID_PREFIX}{slug or index}"
        if task_id in seen:
            raise ApiError(status, code, "新增任务的 id 有重复，请重新生成。")
        seen.add(task_id)

        tasks.append(
            MicroTask(
                id=task_id,
                module=CUSTOM_MODULE,
                title=title,
                action=action,
                done=done,
                weeks=max(1, min(3, int(item.weeks))),
                kind=item.kind,
                core=False,
                skills=tuple(skill for skill in item.skills if skill),
                why="由 AI 根据你在对话里提出的方向补充。",
                hours=2,
                label=item.moduleName.strip()[:20],
            )
        )

    return tasks


def catalog_with_custom(
    profile: Profile,
    custom_tasks: list[MicroTask],
    drop_modules: list[str] | None = None,
) -> list[MicroTask]:
    """在标准目录上先移除要替换的模块，再追加自定义任务。"""
    dropped = {module for module in (drop_modules or []) if module in DROPPABLE_MODULES}
    base = [task for task in available_micro_tasks(profile) if task.module not in dropped]
    existing = {task.id for task in base}
    return [*base, *(task for task in custom_tasks if task.id not in existing)]
