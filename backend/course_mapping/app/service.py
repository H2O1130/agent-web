import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import cast

from .catalog import Catalog, Course, Project
from .errors import MappingInputError, ModelResponseError
from .prompt import build_prompt
from .types import MappingRow, ModelCaller, ProfileInput, SkillInput

REASON_LIMIT = 200
COURSES_TEXT_LIMIT = 800
MAJOR_LIMIT = 80
ROLES = {"frontend", "backend"}
PATHS = {"job", "graduate", "undecided"}


@dataclass(frozen=True)
class _RequestedSkill:
    id: str
    count: int
    job_ids: tuple[str, ...]


class CourseMapper:
    """把技能归并结果映射为「技能 → 课程 → 实践」并回填来源。"""

    def __init__(self, model_caller: ModelCaller) -> None:
        if not callable(model_caller):
            raise TypeError("model_caller 必须是可调用对象。")
        self._model_caller = model_caller
        self._catalog = Catalog.default()

    @property
    def catalog(self) -> Catalog:
        return self._catalog

    def map(
        self,
        skills: Sequence[SkillInput],
        profile: ProfileInput | Mapping[str, object] | None = None,
    ) -> list[MappingRow]:
        requested = _validate_skills(skills, self._catalog)
        if not requested:
            return []

        context = _validate_profile(profile)
        prompt = build_prompt(
            [
                {
                    "id": skill.id,
                    "name": self._catalog.skill_name(skill.id),
                    "count": skill.count,
                }
                for skill in requested
            ],
            context,
            self._catalog,
        )
        response = self._model_caller(prompt)
        mappings = _parse_response(response)
        return self._build_rows(requested, mappings, context)

    def _build_rows(
        self,
        requested: Sequence[_RequestedSkill],
        mappings: Sequence[object],
        context: Mapping[str, object],
    ) -> list[MappingRow]:
        requested_by_id = {skill.id: skill for skill in requested}
        requested_ids = set(requested_by_id)
        rows: dict[str, MappingRow] = {}

        for index, raw_mapping in enumerate(mappings):
            mapping = _validate_mapping(raw_mapping, index)
            skill_id = mapping["skillId"]
            course_id = mapping["courseId"]
            project_id = mapping["projectId"]
            reason = mapping["reason"]
            position = f"模型第 {index + 1} 条映射"

            if skill_id not in requested_ids:
                raise ModelResponseError(f"{position}引用了本次输入之外的技能 ID（M2）。")
            if skill_id in rows:
                raise ModelResponseError(f"{position}重复映射了技能 {skill_id}（M2）。")

            course = self._catalog.course(course_id)
            if course is None:
                raise ModelResponseError(f"{position}引用了未知课程 ID {course_id}（M3）。")
            if skill_id not in course.skill_ids:
                raise ModelResponseError(
                    f"{position}的课程 {course_id} 不覆盖技能 {skill_id}（M3）。"
                )

            project = self._catalog.project(project_id)
            if project is None:
                raise ModelResponseError(f"{position}引用了未知项目 ID {project_id}（M4）。")
            if skill_id not in project.skill_ids:
                raise ModelResponseError(
                    f"{position}的项目 {project_id} 不覆盖技能 {skill_id}（M4）。"
                )
            if course_id not in project.course_ids:
                raise ModelResponseError(
                    f"{position}的项目 {project_id} 不属于课程 {course_id}（M4）。"
                )

            skill = requested_by_id[skill_id]
            rows[skill_id] = self._build_row(
                skill, course, project, reason, context.get("courses", "")
            )

        missing = [skill.id for skill in requested if skill.id not in rows]
        if missing:
            raise ModelResponseError(f"模型缺少技能映射：{'、'.join(missing)}（M2）。")

        return [rows[skill.id] for skill in requested]

    def _build_row(
        self,
        skill: _RequestedSkill,
        course: Course,
        project: Project,
        reason: str,
        courses_text: object,
    ) -> MappingRow:
        return {
            "skillId": skill.id,
            "skillName": self._catalog.skill_name(skill.id),
            "skillCount": skill.count,
            "jobIds": list(skill.job_ids),
            "courseId": course.id,
            "course": course.name,
            "courseSemester": course.semester,
            "projectId": project.id,
            "project": project.name,
            "outcome": project.outcome,
            "acceptance": project.acceptance,
            "reason": reason,
            "alreadyTaken": _already_taken(course, courses_text),
            "courseSource": self._catalog.course_source(course),
            "projectSource": self._catalog.project_source(project),
            "sourceKind": self._catalog.source_kind,
        }


def _validate_skills(
    skills: object,
    catalog: Catalog,
) -> list[_RequestedSkill]:
    if isinstance(skills, (str, bytes)) or not isinstance(skills, Sequence):
        raise MappingInputError("skills 必须是技能对象数组。")

    unique: dict[str, _RequestedSkill] = {}
    for index, raw_skill in enumerate(skills):
        position = f"第 {index + 1} 条技能"
        if not isinstance(raw_skill, Mapping):
            raise MappingInputError(f"{position}必须是对象。")

        skill_id = raw_skill.get("id")
        if not isinstance(skill_id, str) or not skill_id.strip():
            raise MappingInputError(f"{position}缺少有效 id。")
        if not catalog.has_skill(skill_id):
            raise MappingInputError(f"{position}的 ID 不在 11 项标准技能内（M6）。")

        count = raw_skill.get("count")
        if count is not None and (isinstance(count, bool) or not isinstance(count, int) or count < 0):
            raise MappingInputError(f"{position}的 count 必须是非负整数（M6）。")

        job_ids = _validate_evidence(raw_skill.get("evidence"), position)
        unique[skill_id] = _RequestedSkill(
            id=skill_id,
            count=cast(int, count) if count is not None else len(job_ids),
            job_ids=job_ids,
        )

    return list(unique.values())


def _validate_evidence(evidence: object, position: str) -> tuple[str, ...]:
    if evidence is None:
        return ()
    if isinstance(evidence, (str, bytes)) or not isinstance(evidence, Sequence):
        raise MappingInputError(f"{position}的 evidence 必须是证据对象数组（M6）。")

    job_ids: list[str] = []
    for item in evidence:
        if not isinstance(item, Mapping):
            raise MappingInputError(f"{position}的 evidence 条目必须是对象（M6）。")
        job_id = item.get("jobId")
        if not isinstance(job_id, str) or not job_id.strip():
            raise MappingInputError(f"{position}的 evidence 缺少有效 jobId（M6）。")
        if job_id not in job_ids:
            job_ids.append(job_id)

    return tuple(job_ids)


def _validate_profile(profile: object) -> dict[str, object]:
    if profile is None:
        return {}
    if not isinstance(profile, Mapping):
        raise MappingInputError("profile 必须是画像对象或 null（M7）。")

    context: dict[str, object] = {}

    if "major" in profile:
        major = profile["major"]
        if not isinstance(major, str) or not major.strip() or len(major) > MAJOR_LIMIT:
            raise MappingInputError(f"profile.major 必须是 1—{MAJOR_LIMIT} 字的字符串（M7）。")
        context["major"] = major.strip()

    if "semester" in profile:
        semester = profile["semester"]
        if isinstance(semester, bool) or not isinstance(semester, int) or not 1 <= semester <= 8:
            raise MappingInputError("profile.semester 必须是 1—8 的整数（M7）。")
        context["semester"] = semester

    if "role" in profile:
        role = profile["role"]
        if not isinstance(role, str) or role not in ROLES:
            raise MappingInputError("profile.role 只能是 frontend 或 backend（M7）。")
        context["role"] = role

    if "path" in profile:
        path = profile["path"]
        if not isinstance(path, str) or path not in PATHS:
            raise MappingInputError("profile.path 只能是 job、graduate 或 undecided（M7）。")
        context["path"] = path

    if "courses" in profile:
        courses = profile["courses"]
        if not isinstance(courses, str) or len(courses) > COURSES_TEXT_LIMIT:
            raise MappingInputError(f"profile.courses 必须是不超过 {COURSES_TEXT_LIMIT} 字的字符串（M7）。")
        context["courses"] = courses.strip()

    return context


def _parse_response(response: object) -> list[object]:
    if isinstance(response, Mapping):
        payload: object = response
    elif isinstance(response, str):
        payload = _parse_text(response)
    else:
        raise ModelResponseError("模型响应必须是 JSON 字符串或已解析对象（M1）。")

    if not isinstance(payload, Mapping) or not isinstance(payload.get("mappings"), list):
        raise ModelResponseError("模型响应必须包含 mappings 数组（M1）。")
    return payload["mappings"]


def _parse_text(response: str) -> object:
    content = response.strip()
    if content.startswith("```"):
        lines = content.splitlines()
        if len(lines) < 3 or lines[0].strip().lower() not in {"```", "```json"}:
            raise ModelResponseError("模型响应的代码块格式无效（M1）。")
        if not lines[-1].strip() == "```":
            raise ModelResponseError("模型响应被截断，代码块未闭合（M1）。")
        content = "\n".join(lines[1:-1]).strip()

    if not content:
        raise ModelResponseError("模型响应为空（M1）。")

    try:
        return json.loads(content)
    except json.JSONDecodeError as error:
        raise ModelResponseError("模型响应不是有效 JSON，可能被截断（M1）。") from error


def _validate_mapping(raw_mapping: object, index: int) -> dict[str, str]:
    position = f"模型第 {index + 1} 条映射"
    if not isinstance(raw_mapping, dict):
        raise ModelResponseError(f"{position}必须是对象（M1）。")

    mapping: dict[str, str] = {}
    for field in ("skillId", "courseId", "projectId", "reason"):
        value = raw_mapping.get(field)
        if not isinstance(value, str):
            raise ModelResponseError(f"{position}缺少有效 {field}（M1）。")
        mapping[field] = value

    reason = mapping["reason"].strip()
    if not reason:
        raise ModelResponseError(f"{position}的 reason 不能为空（M5）。")
    if len(reason) > REASON_LIMIT:
        raise ModelResponseError(f"{position}的 reason 超过 {REASON_LIMIT} 字（M5）。")
    if "\n" in reason or "\r" in reason:
        raise ModelResponseError(f"{position}的 reason 必须是单行文本（M5）。")
    mapping["reason"] = reason

    return mapping


def _already_taken(course: Course, courses_text: object) -> bool:
    if not isinstance(courses_text, str) or not courses_text:
        return False
    return course.name in courses_text or course.id in courses_text