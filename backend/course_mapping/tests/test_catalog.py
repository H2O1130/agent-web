import pytest

from app import Catalog, CatalogError
from app.catalog import Course, Project, Skill


META = {
    "version": "2026-10-30",
    "sourceKind": "示例",
    "disclaimer": "示例数据。",
    "courseRef": "示例培养方案",
    "projectRef": "示例课程项目库",
    "replaceGuide": "保持字段结构。",
}

SKILLS = (Skill(id="a", name="技能 A"), Skill(id="b", name="技能 B"))


def course(
    id: str = "c1",
    name: str = "课程一",
    prerequisites: tuple[str, ...] = (),
    skill_ids: tuple[str, ...] = ("a",),
) -> Course:
    return Course(
        id=id,
        name=name,
        kind="必修",
        semester=2,
        credits=2,
        prerequisites=prerequisites,
        topics=("主题",),
        skill_ids=skill_ids,
        task_ids=(),
    )


def project(
    id: str = "p1",
    name: str = "项目一",
    course_ids: tuple[str, ...] = ("c1",),
    skill_ids: tuple[str, ...] = ("a",),
) -> Project:
    return Project(
        id=id,
        name=name,
        kind="课程项目",
        hours=6,
        course_ids=course_ids,
        skill_ids=skill_ids,
        task_ids=(),
        outcome="成果",
        acceptance="验收",
        deliverables=("源码",),
    )


def base_catalog(**overrides: object) -> Catalog:
    values: dict[str, object] = {
        "meta": dict(META),
        "skills": SKILLS,
        "courses": (course(), course(id="c2", name="课程二", skill_ids=("b",))),
        "projects": (
            project(),
            project(id="p2", name="项目二", course_ids=("c2",), skill_ids=("b",)),
        ),
    }
    values.update(overrides)
    return Catalog(**values)  # type: ignore[arg-type]


class TestDefaultCatalog:
    def test_default_catalog_loads(self) -> None:
        catalog = Catalog.default()

        assert len(catalog.skills) == 11
        assert len(catalog.courses) == 17
        assert len(catalog.projects) == 18
        assert catalog.source_kind == "示例"

    def test_every_skill_has_course_and_project(self) -> None:
        catalog = Catalog.default()

        for skill in catalog.skills:
            assert catalog.courses_for_skill(skill.id), skill.id
            assert catalog.projects_for_skill(skill.id), skill.id

    def test_course_sources_name_example_material(self) -> None:
        catalog = Catalog.default()

        for item in catalog.courses:
            source = catalog.course_source(item)
            assert source.startswith("示例培养方案")
            assert "示例" in source

        for item in catalog.projects:
            source = catalog.project_source(item)
            assert source.startswith("示例课程项目库")
            assert "关联课程：" in source

    def test_disclaimer_marks_example_data(self) -> None:
        catalog = Catalog.default()

        assert catalog.source_kind == "示例"

    @pytest.mark.parametrize(
        "skill_id, course_name",
        [
            ("programming", "程序设计基础"),
            ("html", "Web 开发基础"),
            ("javascript", "Web 程序设计"),
            ("typescript", "Web 程序设计（拓展）"),
            ("vue", "前端框架实践（拓展）"),
            ("git", "软件工程实践"),
            ("python", "Python 程序设计"),
            ("sql", "数据库原理"),
            ("api", "Web 开发 / 软件工程"),
            ("testing", "软件测试"),
            ("communication", "软件工程团队实践"),
        ],
    )
    def test_expected_course_per_skill(self, skill_id: str, course_name: str) -> None:
        catalog = Catalog.default()

        assert course_name in [item.name for item in catalog.courses_for_skill(skill_id)]


class TestCatalogValidation:
    def test_rejects_empty_skills(self) -> None:
        with pytest.raises(CatalogError, match="技能表不能为空"):
            base_catalog(skills=())

    def test_rejects_duplicate_skill_id(self) -> None:
        with pytest.raises(CatalogError, match="技能 ID"):
            base_catalog(skills=(Skill(id="a", name="技能 A"), Skill(id="a", name="技能 B")))

    def test_rejects_duplicate_course_name(self) -> None:
        with pytest.raises(CatalogError, match="课程名称"):
            base_catalog(
                courses=(
                    course(),
                    course(id="c2", name="课程一", skill_ids=("b",)),
                )
            )

    def test_rejects_missing_prerequisite(self) -> None:
        with pytest.raises(CatalogError, match="先修课"):
            base_catalog(
                courses=(
                    course(prerequisites=("missing",)),
                    course(id="c2", name="课程二", skill_ids=("b",)),
                )
            )

    def test_rejects_self_prerequisite(self) -> None:
        with pytest.raises(CatalogError, match="自身"):
            base_catalog(
                courses=(
                    course(prerequisites=("c1",)),
                    course(id="c2", name="课程二", skill_ids=("b",)),
                )
            )

    def test_rejects_course_with_unknown_skill(self) -> None:
        with pytest.raises(CatalogError, match="未知技能"):
            base_catalog(
                courses=(
                    course(skill_ids=("missing",)),
                    course(id="c2", name="课程二", skill_ids=("b",)),
                )
            )

    def test_rejects_project_without_course(self) -> None:
        with pytest.raises(CatalogError, match="至少一门课程"):
            base_catalog(projects=(project(course_ids=()),))

    def test_rejects_project_with_unknown_course(self) -> None:
        with pytest.raises(CatalogError, match="关联的课程"):
            base_catalog(projects=(project(course_ids=("missing",)),))

    def test_rejects_project_with_unknown_skill(self) -> None:
        with pytest.raises(CatalogError, match="未知技能"):
            base_catalog(projects=(project(skill_ids=("missing",)),))

    def test_rejects_skill_without_course(self) -> None:
        with pytest.raises(CatalogError, match="没有对应课程"):
            base_catalog(
                courses=(course(),),
                projects=(project(),),
                skills=(Skill(id="a", name="技能 A"), Skill(id="b", name="技能 B")),
            )

    def test_rejects_skill_without_project(self) -> None:
        with pytest.raises(CatalogError, match="没有对应实践项目"):
            base_catalog(
                projects=(project(),),
                courses=(course(), course(id="c2", name="课程二", skill_ids=("b",))),
                skills=(Skill(id="a", name="技能 A"), Skill(id="b", name="技能 B")),
            )

    def test_rejects_non_example_source_kind(self) -> None:
        with pytest.raises(CatalogError, match="sourceKind"):
            base_catalog(meta={**META, "sourceKind": "教务"})