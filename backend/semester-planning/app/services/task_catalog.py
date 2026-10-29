from dataclasses import replace

from app.data.tasks import (
    BACKEND_TASKS,
    COMMON_TASKS,
    FRONTEND_TASKS,
    GRADUATE_TASKS,
    TaskTemplate,
)
from app.models import Profile

PORTFOLIO_ID = "portfolio"
GRADUATE_TASK_IDS = frozenset({"math", "english"})


def build_portfolio(profile: Profile) -> TaskTemplate:
    project_id = "frontend-project" if profile.role == "frontend" else "backend-project"
    return TaskTemplate(
        id=PORTFOLIO_ID,
        title="整理作品并练习项目演示",
        skill_ids=("communication",),
        course="软件工程团队实践（选做）",
        outcome="项目说明、演示记录与实习准备材料",
        acceptance="清楚说明解决的问题、个人贡献、验证过程与改进",
        prerequisites=(project_id,),
        hours=3,
        weeks=4,
        kind="可选",
    )


def available_templates(profile: Profile) -> list[TaskTemplate]:
    basics = [
        task
        for task in COMMON_TASKS
        if task.id != "foundation" or "programming" not in profile.skills
    ]
    role_tasks = FRONTEND_TASKS if profile.role == "frontend" else BACKEND_TASKS
    return [*basics, *role_tasks, build_portfolio(profile)]


def catalog_for_profile(profile: Profile) -> list[TaskTemplate]:
    catalog = available_templates(profile)
    if profile.path == "graduate":
        catalog = [*GRADUATE_TASKS, *catalog]

    catalog_ids = {task.id for task in catalog}
    return [
        replace(
            task,
            prerequisites=tuple(
                prerequisite
                for prerequisite in task.prerequisites
                if prerequisite in catalog_ids
            ),
        )
        for task in catalog
    ]


def template_map(profile: Profile) -> dict[str, TaskTemplate]:
    return {task.id: task for task in catalog_for_profile(profile)}


def required_task_ids(profile: Profile, selected_skills: set[str]) -> set[str]:
    available = available_templates(profile)
    available_ids = {task.id for task in available}
    needed = {
        task.id
        for task in available
        if task.kind == "基础" or selected_skills.intersection(task.skill_ids)
    }

    for task in reversed(available):
        if task.id not in needed:
            continue
        needed.update(
            prerequisite
            for prerequisite in task.prerequisites
            if prerequisite in available_ids
        )

    if profile.path == "graduate":
        needed.update(GRADUATE_TASK_IDS)

    return needed
