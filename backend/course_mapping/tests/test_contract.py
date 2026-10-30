import json
import re
from pathlib import Path

import pytest

from app import Catalog

ROOT = Path(__file__).resolve().parents[3]
DATA_TS = ROOT / "frontend" / "src" / "data.ts"
PLANNING_TS = ROOT / "frontend" / "src" / "planning.ts"
SKILLS_JSON = ROOT / "backend" / "skill_merger" / "skills.json"

SKILL_ENTRY = re.compile(
    r"id: '([\w-]+)',\s*\n\s*name: '([^']*)',\s*\n\s*pattern: [^\n]*,\s*\n"
    r"\s*course: '([^']*)',\s*\n\s*project: '([^']*)',\s*\n\s*outcome: '([^']*)',"
)
TASK_ENTRY = re.compile(
    r"id: '([\w-]+)',\s*\n\s*title: '[^']*',\s*\n\s*skillIds: \[([^\]]*)\],\s*\n"
    r"\s*course: '([^']*)'"
)

EXPECTED_TASKS = {
    "foundation",
    "git",
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
    "math",
    "english",
    "portfolio",
}

# data.ts 的技能表为 api 写的课程名是「软件工程 / Web 开发」，planning.ts 与资料表为
# 「Web 开发 / 软件工程」。以 planning.ts 为准，差异记录在 README「已知差异」。
LEGACY_COURSE_EXCEPTIONS = {"api": "软件工程 / Web 开发"}


def read_data_skills() -> list[dict[str, str]]:
    text = DATA_TS.read_text(encoding="utf-8")
    section = text.split("export const skills: SkillRule[] = [", 1)[1].split(
        "interface TaskPeriodInput", 1
    )[0]
    entries = [
        {"id": skill_id, "name": name, "course": course, "project": project, "outcome": outcome}
        for skill_id, name, course, project, outcome in SKILL_ENTRY.findall(section)
    ]
    assert len(entries) == 11, f"data.ts 技能表解析到 {len(entries)} 条，期望 11 条。"
    return entries


def read_planning_tasks() -> list[dict[str, object]]:
    text = PLANNING_TS.read_text(encoding="utf-8")
    tasks = [
        {
            "id": task_id,
            "skillIds": re.findall(r"'([^']*)'", skill_ids),
            "course": course,
        }
        for task_id, skill_ids, course in TASK_ENTRY.findall(text)
    ]
    assert len(tasks) == 16, f"planning.ts 解析到 {len(tasks)} 个任务，期望 16 个。"
    return tasks


def test_skill_ids_match_frontend_and_skill_merger() -> None:
    catalog = Catalog.default()
    catalog_ids = [skill.id for skill in catalog.skills]
    data_ids = [item["id"] for item in read_data_skills()]
    merger_ids = [item["id"] for item in json.loads(SKILLS_JSON.read_text(encoding="utf-8"))]

    assert catalog_ids == data_ids == merger_ids


def test_skill_names_match_frontend() -> None:
    catalog = Catalog.default()
    names = {skill.id: skill.name for skill in catalog.skills}

    for item in read_data_skills():
        assert names[item["id"]] == item["name"], item["id"]


def test_course_project_outcome_match_frontend_mapping() -> None:
    catalog = Catalog.default()

    for item in read_data_skills():
        skill_id = item["id"]
        courses = [course.name for course in catalog.courses_for_skill(skill_id)]
        projects = [project.name for project in catalog.projects_for_skill(skill_id)]
        outcomes = [project.outcome for project in catalog.projects_for_skill(skill_id)]

        assert item["project"] in projects, skill_id
        assert item["outcome"] in outcomes, skill_id
        if skill_id in LEGACY_COURSE_EXCEPTIONS:
            assert item["course"] == LEGACY_COURSE_EXCEPTIONS[skill_id]
        else:
            assert item["course"] in courses, skill_id


def test_every_planning_task_has_course_and_project() -> None:
    catalog = Catalog.default()
    tasks = read_planning_tasks()

    assert {task["id"] for task in tasks} == EXPECTED_TASKS

    for task in tasks:
        task_id = str(task["id"])
        courses = [course for course in catalog.courses if task_id in course.task_ids]
        projects = [project for project in catalog.projects if task_id in project.task_ids]

        assert len(courses) == 1, f"{task_id} 应对应且只对应一门课程"
        course = courses[0]
        assert course.name == task["course"], task_id
        assert projects, f"{task_id} 缺少对应实践项目"

        skill_ids = set(task["skillIds"])  # type: ignore[arg-type]
        matching = [project for project in projects if skill_ids <= set(project.skill_ids)]
        assert matching, f"{task_id} 的项目未覆盖任务技能"
        assert any(course.id in project.course_ids for project in matching), task_id


def test_catalog_task_ids_all_exist_in_planning() -> None:
    catalog = Catalog.default()
    known = set(EXPECTED_TASKS)

    for course in catalog.courses:
        for task_id in course.task_ids:
            assert task_id in known, f"课程 {course.id} 引用了未知任务 {task_id}"

    for project in catalog.projects:
        for task_id in project.task_ids:
            assert task_id in known, f"项目 {project.id} 引用了未知任务 {task_id}"


@pytest.mark.parametrize("skill_id", [item["id"] for item in read_data_skills()])
def test_each_frontend_skill_has_mapping_chain(skill_id: str) -> None:
    catalog = Catalog.default()

    for course in catalog.courses_for_skill(skill_id):
        for project in catalog.projects_for_skill(skill_id):
            if course.id in project.course_ids:
                return

    pytest.fail(f"{skill_id} 没有「课程 + 属于该课程的项目」组合")