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


def test_proposal_can_add_custom_tasks(client, profile):
    task = {
        "id": "java-basics",
        "title": "Java 语法与集合",
        "action": "完成 20 道集合与字符串练习",
        "done": "能独立写出 ArrayList / HashMap 的增删改查",
        "weeks": 2,
        "kind": "专项",
        "moduleName": "Java",
    }
    app.dependency_overrides[get_llm_client] = lambda: FakeClient(
        [
            {
                "reply": "我把 Python 换成 Java，先补语法和集合。",
                "proposal": {
                    "summary": "Python 换成 Java",
                    "profile": profile.model_dump(),
                    "customTasks": [task],
                    "dropModules": ["python"],
                },
            }
        ]
    )

    response = client.post("/api/chat", json=_payload(profile))

    assert response.status_code == 200
    proposal = response.json()["proposal"]
    assert proposal["dropModules"] == ["python"]
    assert proposal["customTasks"][0]["id"] == "custom-java-basics"


def test_custom_task_with_bad_weeks_is_rejected(client, profile):
    app.dependency_overrides[get_llm_client] = lambda: FakeClient(
        [
            {
                "reply": "加一个任务。",
                "proposal": {
                    "summary": "新增任务",
                    "profile": profile.model_dump(),
                    "customTasks": [
                        {
                            "id": "slow",
                            "title": "超长任务",
                            "action": "做很久",
                            "done": "做完",
                            "weeks": 30,
                            "kind": "专项",
                        }
                    ],
                },
            }
        ]
    )

    response = client.post("/api/chat", json=_payload(profile))

    assert response.status_code == 200
    assert response.json()["proposal"]["customTasks"][0]["weeks"] == 3


def test_unknown_drop_module_is_ignored(client, profile):
    app.dependency_overrides[get_llm_client] = lambda: FakeClient(
        [
            {
                "reply": "去掉一些模块。",
                "proposal": {
                    "summary": "直接去掉",
                    "profile": profile.model_dump(),
                    "customTasks": [],
                    "dropModules": ["python", "../../etc", "math"],
                },
            }
        ]
    )

    response = client.post("/api/chat", json=_payload(profile))

    assert response.status_code == 200
    assert response.json()["proposal"]["dropModules"] == ["python"]
