import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_llm_client
from app.llm.client import LLMTimeout
from app.main import app
from app.models import Job, Profile


class FakeClient:
    def __init__(self, responses: list) -> None:
        self.responses = list(responses)
        self.call_count = 0

    def complete_json(self, messages: list[dict], **_: object) -> dict:
        self.call_count += 1
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def reply() -> dict:
    return {
        "skills": [
            {
                "id": "javascript",
                "name": "JavaScript",
                "evidence": [
                    {"jobId": "one", "sentence": "掌握 JavaScript", "kind": "明确要求"}
                ],
            },
            {
                "id": "html",
                "name": "HTML / CSS",
                "evidence": [
                    {"jobId": "one", "sentence": "熟悉 HTML", "kind": "明确要求"}
                ],
            },
        ],
        "mappings": [
            {
                "skillId": "javascript",
                "course": "Web 程序设计",
                "courseSemester": 3,
                "project": "校园活动报名应用",
                "outcome": "完成表单与交互",
                "acceptance": "处理空输入与重复报名",
                "reason": "岗位要求交互与表单校验，先补课程再做报名项目。",
                "alreadyTaken": False,
            },
            {
                "skillId": "html",
                "course": "Web 开发基础",
                "courseSemester": 3,
                "project": "响应式校园介绍页",
                "outcome": "完成响应式页面",
                "acceptance": "320px 到 1920px 无溢出",
                "reason": "岗位要求页面结构，课程与项目覆盖布局练习。",
                "alreadyTaken": True,
            },
        ],
    }


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _payload(jobs: list[Job], profile: Profile) -> dict:
    return {
        "jobs": [{"id": job.id, "text": job.text} for job in jobs],
        "profile": profile.model_dump(),
    }


def test_analyze_returns_dynamic_skills_and_mappings(client, profile, jobs):
    fake = FakeClient([reply()])
    app.dependency_overrides[get_llm_client] = lambda: fake

    response = client.post("/api/analyze", json=_payload(jobs, profile))

    assert response.status_code == 200
    body = response.json()
    assert [skill["id"] for skill in body["skills"]] == ["javascript", "html"]
    mapping = body["mappings"][0]
    assert mapping["skillId"] == "javascript"
    assert mapping["course"] == "Web 程序设计"
    assert mapping["sourceKind"] == "AI 生成示例"
    assert "AI 生成示例" in mapping["courseSource"]
    assert body["mappings"][1]["alreadyTaken"] is True


def test_analyze_retries_when_evidence_not_in_text(client, profile, jobs):
    broken = reply()
    broken["skills"][0]["evidence"][0]["sentence"] = "原文里没有这句话"
    fake = FakeClient([broken, reply()])
    app.dependency_overrides[get_llm_client] = lambda: fake

    response = client.post("/api/analyze", json=_payload(jobs, profile))

    assert response.status_code == 200
    assert fake.call_count == 2


def test_analyze_reports_incomplete_mapping(client, profile, jobs):
    broken = reply()
    broken["mappings"] = broken["mappings"][:1]
    app.dependency_overrides[get_llm_client] = lambda: FakeClient([broken, broken])
    response = client.post("/api/analyze", json=_payload(jobs, profile))

    assert response.status_code == 502
    assert response.json()["code"] == "LLM_INVALID_ANALYZE"


def test_analyze_without_jobs_returns_400(client, profile):
    app.dependency_overrides[get_llm_client] = lambda: FakeClient([])

    response = client.post("/api/analyze", json={"jobs": [], "profile": profile.model_dump()})

    assert response.status_code == 400
    assert response.json()["code"] == "NO_JOBS"


def test_analyze_without_key_returns_503(client, jobs, profile):
    app.dependency_overrides[get_llm_client] = lambda: None

    response = client.post("/api/analyze", json=_payload(jobs, profile))

    assert response.status_code == 503
    assert response.json()["code"] == "LLM_NOT_CONFIGURED"


def test_analyze_maps_timeout_to_504(client, jobs, profile):
    app.dependency_overrides[get_llm_client] = lambda: FakeClient([LLMTimeout("超时")] * 3)

    response = client.post("/api/analyze", json=_payload(jobs, profile))

    assert response.status_code == 504
    assert response.json()["code"] == "LLM_TIMEOUT"
