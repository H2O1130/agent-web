from app.data.micro_tasks import MICRO_TASKS, MODULES, MicroTask
from app.models import Profile
from app.services.task_catalog import required_task_ids

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
    return MODULES[task.module].name


def module_course(task: MicroTask) -> str:
    return MODULES[task.module].course
