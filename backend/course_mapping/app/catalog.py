import json
from dataclasses import dataclass
from importlib import resources
from typing import Any

from .errors import CatalogError


@dataclass(frozen=True)
class Skill:
    id: str
    name: str


@dataclass(frozen=True)
class Course:
    id: str
    name: str
    kind: str
    semester: int | None
    credits: float | None
    prerequisites: tuple[str, ...]
    topics: tuple[str, ...]
    skill_ids: tuple[str, ...]
    task_ids: tuple[str, ...]


@dataclass(frozen=True)
class Project:
    id: str
    name: str
    kind: str
    hours: int
    course_ids: tuple[str, ...]
    skill_ids: tuple[str, ...]
    task_ids: tuple[str, ...]
    outcome: str
    acceptance: str
    deliverables: tuple[str, ...]


class Catalog:
    """课程与项目资料表：加载、完整性校验和提示词数据。"""

    def __init__(
        self,
        meta: dict[str, str],
        skills: tuple[Skill, ...],
        courses: tuple[Course, ...],
        projects: tuple[Project, ...],
    ) -> None:
        if not skills:
            raise CatalogError("技能表不能为空。")
        if not courses:
            raise CatalogError("课程资料表不能为空。")
        if not projects:
            raise CatalogError("项目资料表不能为空。")
        if meta.get("sourceKind") != "示例":
            raise CatalogError("资料表 meta.sourceKind 必须是“示例”；接入真实教务数据前需同步修改本校验与 README 来源说明。")

        self._meta = meta
        self._skills = skills
        self._skill_names = {skill.id: skill.name for skill in skills}
        self._courses = courses
        self._course_by_id = {course.id: course for course in courses}
        self._projects = projects
        self._project_by_id = {project.id: project for project in projects}

        _ensure_unique([skill.id for skill in skills], "技能 ID")
        _ensure_unique([course.id for course in courses], "课程 ID")
        _ensure_unique([project.id for project in projects], "项目 ID")
        _ensure_unique([course.name for course in courses], "课程名称")
        _ensure_unique([project.name for project in projects], "项目名称")

        self._check_courses()
        self._check_projects()
        self._check_coverage()

        self._courses_by_skill = {
            skill.id: tuple(course for course in courses if skill.id in course.skill_ids)
            for skill in skills
        }
        self._projects_by_skill = {
            skill.id: tuple(project for project in projects if skill.id in project.skill_ids)
            for skill in skills
        }

    @classmethod
    def default(cls) -> "Catalog":
        resource = resources.files(__package__).joinpath("catalog.json")
        with resource.open("r", encoding="utf-8") as file:
            payload: Any = json.load(file)

        if not isinstance(payload, dict):
            raise CatalogError("资料表根节点必须是对象。")

        meta = _parse_meta(payload.get("meta"))
        skills = tuple(
            Skill(id=_text(item.get("id"), "技能 id"), name=_text(item.get("name"), "技能 name"))
            for item in _object_list(payload.get("skills"), "skills")
        )
        courses = tuple(_parse_course(item) for item in _object_list(payload.get("courses"), "courses"))
        projects = tuple(
            _parse_project(item) for item in _object_list(payload.get("projects"), "projects")
        )
        return cls(meta, skills, courses, projects)

    @property
    def source_kind(self) -> str:
        return self._meta["sourceKind"]

    @property
    def courses(self) -> tuple[Course, ...]:
        return self._courses

    @property
    def projects(self) -> tuple[Project, ...]:
        return self._projects

    @property
    def skills(self) -> tuple[Skill, ...]:
        return self._skills

    def has_skill(self, skill_id: str) -> bool:
        return skill_id in self._skill_names

    def skill_name(self, skill_id: str) -> str:
        try:
            return self._skill_names[skill_id]
        except KeyError as error:
            raise CatalogError(f"技能 {skill_id} 不在资料表词表中。") from error

    def course(self, course_id: str) -> Course | None:
        return self._course_by_id.get(course_id)

    def project(self, project_id: str) -> Project | None:
        return self._project_by_id.get(project_id)

    def courses_for_skill(self, skill_id: str) -> tuple[Course, ...]:
        return self._courses_by_skill.get(skill_id, ())

    def projects_for_skill(self, skill_id: str) -> tuple[Project, ...]:
        return self._projects_by_skill.get(skill_id, ())

    def course_source(self, course: Course) -> str:
        semester = f"第 {course.semester} 学期" if course.semester else "学期待定"
        credits = f"{_format_credits(course.credits)} 学分" if course.credits else "无学分"
        return f"{self._meta['courseRef']} · {semester} · {course.kind} · {credits}"

    def project_source(self, project: Project) -> str:
        course_names = "、".join(self._course_by_id[course_id].name for course_id in project.course_ids)
        return (
            f"{self._meta['projectRef']} · {project.kind} · "
            f"{project.hours} 标准小时 · 关联课程：{course_names}"
        )

    def as_prompt_data(self) -> dict[str, object]:
        return {
            "skills": [{"id": skill.id, "name": skill.name} for skill in self._skills],
            "courses": [
                {
                    "id": course.id,
                    "name": course.name,
                    "kind": course.kind,
                    "semester": course.semester,
                    "prerequisites": list(course.prerequisites),
                    "topics": list(course.topics),
                    "skillIds": list(course.skill_ids),
                }
                for course in self._courses
            ],
            "projects": [
                {
                    "id": project.id,
                    "name": project.name,
                    "kind": project.kind,
                    "hours": project.hours,
                    "courseIds": list(project.course_ids),
                    "skillIds": list(project.skill_ids),
                    "outcome": project.outcome,
                }
                for project in self._projects
            ],
        }

    def _check_courses(self) -> None:
        course_ids = set(self._course_by_id)
        skill_ids = set(self._skill_names)

        for course in self._courses:
            if course.id in course.prerequisites:
                raise CatalogError(f"课程 {course.id} 不能以自身为先修课。")
            for prerequisite in course.prerequisites:
                if prerequisite not in course_ids:
                    raise CatalogError(f"课程 {course.id} 的先修课 {prerequisite} 不存在。")
            for skill_id in course.skill_ids:
                if skill_id not in skill_ids:
                    raise CatalogError(f"课程 {course.id} 引用了未知技能 {skill_id}。")

    def _check_projects(self) -> None:
        course_ids = set(self._course_by_id)
        skill_ids = set(self._skill_names)

        for project in self._projects:
            if not project.course_ids:
                raise CatalogError(f"项目 {project.id} 必须关联至少一门课程。")
            for course_id in project.course_ids:
                if course_id not in course_ids:
                    raise CatalogError(f"项目 {project.id} 关联的课程 {course_id} 不存在。")
            for skill_id in project.skill_ids:
                if skill_id not in skill_ids:
                    raise CatalogError(f"项目 {project.id} 引用了未知技能 {skill_id}。")

    def _check_coverage(self) -> None:
        for skill in self._skills:
            if not any(skill.id in course.skill_ids for course in self._courses):
                raise CatalogError(f"技能 {skill.id} 没有对应课程。")
            if not any(skill.id in project.skill_ids for project in self._projects):
                raise CatalogError(f"技能 {skill.id} 没有对应实践项目。")


def _parse_meta(value: object) -> dict[str, str]:
    if not isinstance(value, dict):
        raise CatalogError("meta 必须是对象。")

    meta: dict[str, str] = {}
    for field in ("version", "sourceKind", "disclaimer", "courseRef", "projectRef", "replaceGuide"):
        meta[field] = _text(value.get(field), f"meta.{field}")

    return meta


def _parse_course(raw: object) -> Course:
    item = _object(raw, "课程条目")
    return Course(
        id=_text(item.get("id"), "课程 id"),
        name=_text(item.get("name"), "课程 name"),
        kind=_text(item.get("kind"), "课程 kind"),
        semester=_optional_int(item.get("semester"), 1, 8, "课程 semester"),
        credits=_optional_number(item.get("credits"), "课程 credits"),
        prerequisites=_text_list(item.get("prerequisites"), "课程 prerequisites"),
        topics=_text_list(item.get("topics"), "课程 topics"),
        skill_ids=_text_list(item.get("skillIds"), "课程 skillIds"),
        task_ids=_text_list(item.get("taskIds"), "课程 taskIds"),
    )


def _parse_project(raw: object) -> Project:
    item = _object(raw, "项目条目")
    hours = item.get("hours")
    if isinstance(hours, bool) or not isinstance(hours, int) or hours <= 0:
        raise CatalogError("项目 hours 必须是正整数。")

    return Project(
        id=_text(item.get("id"), "项目 id"),
        name=_text(item.get("name"), "项目 name"),
        kind=_text(item.get("kind"), "项目 kind"),
        hours=hours,
        course_ids=_text_list(item.get("courseIds"), "项目 courseIds"),
        skill_ids=_text_list(item.get("skillIds"), "项目 skillIds"),
        task_ids=_text_list(item.get("taskIds"), "项目 taskIds"),
        outcome=_text(item.get("outcome"), "项目 outcome"),
        acceptance=_text(item.get("acceptance"), "项目 acceptance"),
        deliverables=_text_list(item.get("deliverables"), "项目 deliverables"),
    )


def _object(value: object, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise CatalogError(f"{label}必须是对象。")
    return value


def _object_list(value: object, label: str) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not value:
        raise CatalogError(f"{label} 必须是非空数组。")
    return [_object(item, f"{label} 条目") for item in value]


def _text(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise CatalogError(f"{label} 必须是非空字符串。")
    return value.strip()


def _text_list(value: object, label: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise CatalogError(f"{label} 必须是字符串数组。")

    items = tuple(_text(item, label) for item in value)
    _ensure_unique(items, label)
    return items


def _optional_int(value: object, minimum: int, maximum: int, label: str) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise CatalogError(f"{label} 必须是 {minimum}—{maximum} 的整数或 null。")
    return value


def _optional_number(value: object, label: str) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        raise CatalogError(f"{label} 必须是非负数或 null。")
    return float(value)


def _format_credits(credits: float | None) -> str:
    if credits is None:
        return "0"
    return str(int(credits)) if float(credits).is_integer() else f"{credits:g}"


def _ensure_unique(values: "list[str] | tuple[str, ...]", label: str) -> None:
    seen: set[str] = set()
    for value in values:
        if value in seen:
            raise CatalogError(f"{label}存在重复项：{value}。")
        seen.add(value)