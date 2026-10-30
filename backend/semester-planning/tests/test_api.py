import json

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_llm_client
from app.llm.client import LLMTimeout
from app.main import app
from app.models import PlanRequest


class FakeClient:
    def __init__(self, responses: list) -> None:
        self.responses = list(responses)
        self.call_count = 0

    def complete_json(self, messages: list[dict]) -> dict:
        self.call_count += 1
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _payload(profile, jobs, version: int = 1) -> dict:
    return PlanRequest(profile=profile, jobs=jobs, version=version).model_dump()


def test_health(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_success_returns_plan(client, profile, jobs, valid_llm_plan):
    app.dependency_overrides[get_llm_client] = lambda: FakeClient([valid_llm_plan])

    response = client.post("/api/plan", json=_payload(profile, jobs))

    assert response.status_code == 200
    plan = response.json()["plan"]
    assert plan["version"] == 1
    assert len(plan["tasks"]) == 14
    assert plan["profile"]["hours"] == 12
    assert plan["overview"]["goal"]
    assert plan["overview"]["strategy"]
    assert [semester["semester"] for semester in plan["semesters"]] == [3, 4]
    assert [vacation["label"] for vacation in plan["vacations"]] == [
        "大二寒假",
        "大二暑假",
    ]
    assert plan["tasks"][0]["weekNote"]


def test_duplicate_item_is_dropped(client, profile, jobs, valid_llm_plan):
    plan_data = json.loads(json.dumps(valid_llm_plan))
    plan_data["periods"][0]["items"].append({"id": "git-repo", "weeks": ""})
    app.dependency_overrides[get_llm_client] = lambda: FakeClient([plan_data])

    response = client.post("/api/plan", json=_payload(profile, jobs))

    assert response.status_code == 200
    ids = [task["id"] for task in response.json()["plan"]["tasks"]]
    assert len(ids) == len(set(ids))


def test_retry_after_invalid_output(client, profile, jobs, valid_llm_plan):
    fake = FakeClient([{"periods": []}, valid_llm_plan])
    app.dependency_overrides[get_llm_client] = lambda: fake

    response = client.post("/api/plan", json=_payload(profile, jobs))

    assert response.status_code == 200
    assert fake.call_count == 2


def test_three_invalid_outputs_return_502(client, profile, jobs):
    app.dependency_overrides[get_llm_client] = lambda: FakeClient(
        [{"periods": []}, {"periods": []}, {"periods": []}]
    )

    response = client.post("/api/plan", json=_payload(profile, jobs))

    assert response.status_code == 502
    assert response.json()["code"] == "LLM_INVALID_PLAN"


def test_three_timeouts_return_504(client, profile, jobs):
    app.dependency_overrides[get_llm_client] = lambda: FakeClient(
        [LLMTimeout(), LLMTimeout(), LLMTimeout()]
    )

    response = client.post("/api/plan", json=_payload(profile, jobs))

    assert response.status_code == 504
    assert response.json()["code"] == "LLM_TIMEOUT"


def test_zero_hours_returns_pending_tasks(client, profile, jobs):
    fake = FakeClient([])
    app.dependency_overrides[get_llm_client] = lambda: fake
    paused = profile.model_copy(update={"hours": 0})

    response = client.post("/api/plan", json=_payload(paused, jobs))

    assert response.status_code == 200
    plan = response.json()["plan"]
    assert plan["semesters"] == []
    assert plan["vacations"] == []
    assert plan["tasks"]
    assert all(task["semester"] is None for task in plan["tasks"])
    assert fake.call_count == 0


def test_missing_api_key_returns_503(client, profile, jobs, monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    response = client.post("/api/plan", json=_payload(profile, jobs))

    assert response.status_code == 503
    assert response.json()["code"] == "LLM_NOT_CONFIGURED"


def test_invalid_semester_returns_400(client, profile, jobs):
    app.dependency_overrides[get_llm_client] = lambda: FakeClient([])
    invalid = profile.model_copy(update={"semester": 9})

    response = client.post("/api/plan", json=_payload(invalid, jobs))

    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_PROFILE"


def test_empty_jobs_returns_400(client, profile):
    app.dependency_overrides[get_llm_client] = lambda: FakeClient([])

    response = client.post("/api/plan", json=_payload(profile, []))

    assert response.status_code == 400
    assert response.json()["code"] == "NO_JOBS"


def test_no_skills_returns_422(client, profile, jobs):
    app.dependency_overrides[get_llm_client] = lambda: FakeClient([])
    job = jobs[0].model_copy(update={"text": "负责日常事务。"})

    response = client.post("/api/plan", json=_payload(profile, [job]))

    assert response.status_code == 422
    assert response.json()["code"] == "NO_SKILLS"


def test_bad_request_shape_returns_400(client):
    response = client.post("/api/plan", json={"jobs": []})

    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_REQUEST"
