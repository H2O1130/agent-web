import json

import pytest

from app import CourseMapper, MappingInputError, ModelResponseError

REASON = "岗位要求交互与表单校验，课程覆盖 DOM 与校验，项目要求完整报名流程。"


def mapping(
    skill_id: str = "javascript",
    course_id: str = "web-programming",
    project_id: str = "campus-signup-app",
    reason: str = REASON,
) -> dict[str, str]:
    return {
        "skillId": skill_id,
        "courseId": course_id,
        "projectId": project_id,
        "reason": reason,
    }


def response(*mappings: object) -> str:
    return json.dumps({"mappings": list(mappings)}, ensure_ascii=False)


class FakeModel:
    def __init__(self, result: object) -> None:
        self.result = result
        self.prompts: list[str] = []

    def __call__(self, prompt: str) -> object:
        self.prompts.append(prompt)
        return self.result


JAVASCRIPT_INPUT = {
    "id": "javascript",
    "count": 2,
    "evidence": [
        {"jobId": "fe-01", "sentence": "掌握 JavaScript，熟悉 Vue", "kind": "明确要求"},
        {"jobId": "fe-03", "sentence": "JavaScript 与 TypeScript", "kind": "明确要求"},
        {"jobId": "fe-03", "sentence": "重复出现的同一句", "kind": "加分项"},
    ],
}


def test_maps_skill_to_course_project_and_sources() -> None:
    rows = CourseMapper(FakeModel(response(mapping()))).map([JAVASCRIPT_INPUT])

    assert len(rows) == 1
    row = rows[0]
    assert row["skillId"] == "javascript"
    assert row["skillName"] == "JavaScript"
    assert row["skillCount"] == 2
    assert row["jobIds"] == ["fe-01", "fe-03"]
    assert row["courseId"] == "web-programming"
    assert row["course"] == "Web 程序设计"
    assert row["courseSemester"] == 3
    assert row["projectId"] == "campus-signup-app"
    assert row["project"] == "校园活动报名应用"
    assert row["outcome"] == "完成表单、数据筛选与交互反馈"
    assert row["acceptance"] == "处理空输入、重复报名和数据恢复"
    assert row["reason"] == REASON
    assert row["alreadyTaken"] is False
    assert row["courseSource"].startswith("示例培养方案")
    assert "第 3 学期" in row["courseSource"]
    assert row["projectSource"].startswith("示例课程项目库")
    assert "关联课程：Web 程序设计" in row["projectSource"]
    assert row["sourceKind"] == "示例"


def test_rows_follow_input_order() -> None:
    model = FakeModel(
        response(
            mapping(),
            mapping(
                skill_id="vue",
                course_id="frontend-framework",
                project_id="vue-activity-workbench",
                reason="岗位要求组件化页面，课程覆盖组件与路由，工作台要求跨页状态。",
            ),
        )
    )

    rows = CourseMapper(model).map([{"id": "vue"}, {"id": "javascript"}])

    assert [row["skillId"] for row in rows] == ["vue", "javascript"]


def test_count_defaults_to_distinct_job_ids() -> None:
    model = FakeModel(response(mapping()))

    rows = CourseMapper(model).map(
        [
            {
                "id": "javascript",
                "evidence": [
                    {"jobId": "fe-01"},
                    {"jobId": "fe-01"},
                    {"jobId": "fe-02"},
                ],
            }
        ]
    )

    assert rows[0]["skillCount"] == 2
    assert rows[0]["jobIds"] == ["fe-01", "fe-02"]


def test_duplicate_input_skill_keeps_last_value() -> None:
    model = FakeModel(response(mapping()))

    rows = CourseMapper(model).map([{"id": "javascript", "count": 1}, {"id": "javascript", "count": 5}])

    assert len(rows) == 1
    assert rows[0]["skillCount"] == 5


def test_empty_skills_skip_model_call() -> None:
    model = FakeModel(response(mapping()))

    rows = CourseMapper(model).map([])

    assert rows == []
    assert model.prompts == []


def test_prompt_contains_catalog_and_profile_without_job_text() -> None:
    model = FakeModel(response(mapping()))

    CourseMapper(model).map(
        [JAVASCRIPT_INPUT],
        {"major": "计算机科学与技术", "semester": 3, "role": "frontend", "courses": "程序设计基础"},
    )

    prompt = model.prompts[0]
    assert '"javascript"' in prompt
    assert '"web-programming"' in prompt
    assert "示例数据" in prompt
    assert "计算机科学与技术" in prompt
    assert "掌握 JavaScript，熟悉 Vue" not in prompt
    assert "程序设计基础" in prompt


def test_prompt_marks_missing_profile() -> None:
    model = FakeModel(response(mapping()))

    CourseMapper(model).map([{"id": "javascript"}])

    assert "（未提供画像）" in model.prompts[0]


def test_already_taken_uses_courses_text() -> None:
    model = FakeModel(response(mapping()))

    rows = CourseMapper(model).map(
        [{"id": "javascript"}],
        {"courses": "程序设计基础，Web 程序设计"},
    )

    assert rows[0]["alreadyTaken"] is True


def test_already_taken_is_false_without_profile() -> None:
    rows = CourseMapper(FakeModel(response(mapping()))).map([{"id": "javascript"}])

    assert rows[0]["alreadyTaken"] is False


def test_json_code_fence_is_accepted() -> None:
    model = FakeModel(f"```json\n{response(mapping())}\n```")

    rows = CourseMapper(model).map([{"id": "javascript"}])

    assert rows[0]["projectId"] == "campus-signup-app"


def test_extra_model_fields_are_ignored() -> None:
    extra = {**mapping(), "score": 0.9, "unknown": "x"}
    model = FakeModel(response(extra))

    rows = CourseMapper(model).map([{"id": "javascript"}])

    assert rows[0]["courseId"] == "web-programming"


def test_model_exception_is_not_hidden() -> None:
    def failing_model(prompt: str) -> str:
        raise TimeoutError("上游超时")

    with pytest.raises(TimeoutError, match="上游超时"):
        CourseMapper(failing_model).map([{"id": "javascript"}])


@pytest.mark.parametrize(
    "skills",
    [
        "not-a-list",
        123,
        ["not-an-object"],
        [{"title": "缺少 id"}],
        [{"id": " "}],
        [{"id": "unknown-skill"}],
        [{"id": "javascript", "count": -1}],
        [{"id": "javascript", "count": True}],
        [{"id": "javascript", "count": "2"}],
        [{"id": "javascript", "evidence": "掌握 JavaScript"}],
        [{"id": "javascript", "evidence": [{"sentence": "缺少 jobId"}]}],
        [{"id": "javascript", "evidence": [{"jobId": " "}]}],
    ],
)
def test_invalid_skills_are_rejected_before_model_call(skills: object) -> None:
    model = FakeModel(response(mapping()))

    with pytest.raises(MappingInputError):
        CourseMapper(model).map(skills)  # type: ignore[arg-type]

    assert model.prompts == []


@pytest.mark.parametrize(
    "profile",
    [
        "not-an-object",
        {"major": ""},
        {"major": "专业" * 41},
        {"semester": 0},
        {"semester": 9},
        {"semester": True},
        {"semester": "3"},
        {"role": "designer"},
        {"role": ["frontend"]},
        {"path": "startup"},
        {"courses": 123},
        {"courses": "课" * 801},
    ],
)
def test_invalid_profile_is_rejected(profile: object) -> None:
    model = FakeModel(response(mapping()))

    with pytest.raises(MappingInputError):
        CourseMapper(model).map([{"id": "javascript"}], profile)  # type: ignore[arg-type]

    assert model.prompts == []


@pytest.mark.parametrize(
    "raw_response",
    [
        None,
        123,
        "",
        "not-json",
        "{}",
        '{"mappings": {}}',
        '{"mappings": [',
        "```json\n{}\n",
        "```xml\n{\"mappings\": []}\n```",
        response("not-an-object"),
        response({"skillId": "javascript"}),
        response(mapping(skill_id="vue")),
        response(mapping(), mapping()),
        response(mapping(project_id="unknown-project")),
        response(mapping(course_id="unknown-course")),
        response(mapping(course_id="python-programming", project_id="course-data-tool")),
        response(mapping(project_id="key-flow-testing")),
        response(mapping(project_id="frontend-project-delivery")),
        response(mapping(reason="   ")),
        response(mapping(reason="说" * 201)),
        response(mapping(reason="第一行\n第二行")),
        response(mapping(reason=1)),
    ],
)
def test_invalid_model_responses_are_rejected(raw_response: object) -> None:
    with pytest.raises(ModelResponseError):
        CourseMapper(FakeModel(raw_response)).map([{"id": "javascript"}])

    with pytest.raises(ModelResponseError):
        CourseMapper(FakeModel(raw_response)).map([{"id": "javascript"}, {"id": "vue"}])


def test_missing_mapping_for_requested_skill_is_rejected() -> None:
    model = FakeModel(response(mapping()))

    with pytest.raises(ModelResponseError, match="缺少技能映射"):
        CourseMapper(model).map([{"id": "javascript"}, {"id": "vue"}])


def test_model_may_choose_another_valid_combination() -> None:
    model = FakeModel(
        response(
            mapping(
                skill_id="html",
                course_id="web-programming",
                project_id="campus-signup-app",
                reason="岗位要求页面结构，课程覆盖 HTML，报名应用要求真实页面落地。",
            )
        )
    )

    rows = CourseMapper(model).map([{"id": "html"}])

    assert rows[0]["skillName"] == "HTML / CSS"
    assert rows[0]["course"] == "Web 程序设计"