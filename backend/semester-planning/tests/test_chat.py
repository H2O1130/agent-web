import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_llm_client
from app.main import app
from app.models import ChatMessage, ChatPlan, ChatRequest


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


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _payload(profile, messages: list[ChatMessage] | None = None) -> dict:
    if messages is None:
        messages = [ChatMessage(role="user", content="我下学期课多，每周只能 8 小时")]
    return ChatRequest(
        messages=messages,
        profile=profile,
        plan=ChatPlan(version=2, profile=profile),
    ).model_dump()


def test_reply_without_proposal(client, profile):
    app.dependency_overrides[get_llm_client] = lambda: FakeClient(
        [{"reply": "可以先减少每周时间，再重新生成一版。", "proposal": None}]
    )

    response = client.post("/api/chat", json=_payload(profile))

    assert response.status_code == 200
    body = response.json()
    assert body["reply"]
    assert body["proposal"] is None


def test_reply_with_profile_proposal(client, profile):
    updated = profile.model_copy(update={"hours": 8}).model_dump()
    app.dependency_overrides[get_llm_client] = lambda: FakeClient(
        [
            {
                "reply": "建议把每周时间降到 8 小时，任务会更聚焦。",
                "proposal": {"summary": "每周 12→8 小时", "profile": updated},
            }
        ]
    )

    response = client.post("/api/chat", json=_payload(profile))

    assert response.status_code == 200
    proposal = response.json()["proposal"]
    assert proposal["summary"] == "每周 12→8 小时"
    assert proposal["profile"]["hours"] == 8


def test_identical_proposal_is_dropped(client, profile):
    app.dependency_overrides[get_llm_client] = lambda: FakeClient(
        [{"reply": "其实不用调整。", "proposal": {"summary": "无变化", "profile": profile.model_dump()}}]
    )

    response = client.post("/api/chat", json=_payload(profile))

    assert response.status_code == 200
    assert response.json()["proposal"] is None


def test_out_of_range_proposal_is_rejected(client, profile):
    updated = profile.model_copy(update={"hours": 40}).model_dump()
    app.dependency_overrides[get_llm_client] = lambda: FakeClient(
        [{"reply": "调到 40 小时。", "proposal": {"summary": "40 小时", "profile": updated}}]
    )

    response = client.post("/api/chat", json=_payload(profile))

    assert response.status_code == 502
    assert response.json()["code"] == "LLM_INVALID_PROFILE"


def test_empty_message_returns_400(client, profile):
    app.dependency_overrides[get_llm_client] = lambda: FakeClient([])

    response = client.post("/api/chat", json=_payload(profile, messages=[]))

    assert response.status_code == 400
    assert response.json()["code"] == "EMPTY_MESSAGE"
