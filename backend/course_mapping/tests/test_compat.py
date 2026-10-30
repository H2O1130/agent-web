import pytest

from app import (
    CourseMapper,
    MappingInputError,
    ModelResponseError,
    analyze_payload,
    error_response,
    rows_by_skill,
)

REASON = "岗位要求交互与表单校验，课程覆盖 DOM 与校验，项目要求完整报名流程。"
SKILL = {
    "id": "javascript",
    "count": 2,
    "evidence": [
        {"jobId": "fe-01", "sentence": "掌握 JavaScript", "kind": "明确要求"},
        {"jobId": "fe-03", "sentence": "JavaScript 与 TypeScript", "kind": "明确要求"},
    ],
}
MAPPING = {
    "skillId": "javascript",
    "courseId": "web-programming",
    "projectId": "campus-signup-app",
    "reason": REASON,
}


def test_accepts_already_parsed_model_response() -> None:
    rows = CourseMapper(lambda prompt: {"mappings": [MAPPING]}).map([SKILL])

    assert rows[0]["skillId"] == "javascript"
    assert rows[0]["skillCount"] == 2
    assert rows[0]["course"] == "Web 程序设计"


def test_parsed_response_without_mappings_is_rejected() -> None:
    with pytest.raises(ModelResponseError):
        CourseMapper(lambda prompt: {"result": []}).map([SKILL])


def test_parsed_response_with_bad_mapping_still_validated() -> None:
    bad = {**MAPPING, "courseId": "unknown-course"}
    with pytest.raises(ModelResponseError):
        CourseMapper(lambda prompt: {"mappings": [bad]}).map([SKILL])


def test_error_response_uses_existing_code_and_status() -> None:
    status, body = error_response(MappingInputError("skills 必须是技能对象数组。"))
    assert (status, body) == (
        400,
        {"code": "bad_request", "message": "skills 必须是技能对象数组。"},
    )

    status, body = error_response(ModelResponseError("模型响应为空（M1）。"))
    assert status == 502
    assert body["code"] == "llm_bad_response"

    status, body = error_response(ValueError("boom"))
    assert (status, body) == (500, {"code": "internal_error", "message": "boom"})


def test_error_response_falls_back_when_message_empty() -> None:
    status, body = error_response(ValueError(""))

    assert status == 500
    assert body["code"] == "internal_error"
    assert body["message"]


def test_analyze_payload_keeps_skills_and_adds_mappings() -> None:
    rows = CourseMapper(lambda prompt: {"mappings": [MAPPING]}).map([SKILL])
    payload = analyze_payload([SKILL], rows)

    assert payload["skills"] == [SKILL]
    assert payload["mappings"] == rows


def test_analyze_payload_allows_empty_mappings() -> None:
    assert analyze_payload([], []) == {"skills": [], "mappings": []}


def test_rows_by_skill_indexes_mappings() -> None:
    rows = CourseMapper(lambda prompt: {"mappings": [MAPPING]}).map([SKILL])
    indexed = rows_by_skill(rows)

    assert list(indexed) == ["javascript"]
    assert indexed["javascript"]["project"] == "校园活动报名应用"