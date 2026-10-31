import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_llm_client, resolve_settings
from app.llm.client import LLMTimeout, LLMUnavailable
from app.main import app


class FakeClient:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.verified = 0

    def verify(self) -> None:
        self.verified += 1
        if self.error is not None:
            raise self.error


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_header_key_overrides_env(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "env-key")

    settings = resolve_settings("sk-user", None, None)

    assert settings.api_key == "sk-user"
    assert settings.configured


def test_blank_header_keeps_env_key(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "env-key")

    settings = resolve_settings("   ", None, None)

    assert settings.api_key == "env-key"


def test_no_key_anywhere_is_unconfigured(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    settings = resolve_settings(None, None, None)

    assert settings.configured is False
    assert get_llm_client(settings) is None


def test_model_and_base_url_headers_override_env(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_MODEL", "env-model")
    monkeypatch.setenv("DEEPSEEK_BASE_URL", "https://env.example.com")

    settings = resolve_settings(None, "deepseek-reasoner", "https://user.example.com")

    assert settings.model == "deepseek-reasoner"
    assert settings.base_url == "https://user.example.com"


def test_client_built_from_header_only_key(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    client = get_llm_client(resolve_settings("sk-from-browser", None, None))

    assert client is not None


def test_verify_without_key_returns_503(client, monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    response = client.post("/api/llm/verify")

    assert response.status_code == 503
    assert response.json()["code"] == "LLM_NOT_CONFIGURED"


def test_verify_success_reports_model(client):
    fake = FakeClient()
    app.dependency_overrides[get_llm_client] = lambda: fake

    response = client.post(
        "/api/llm/verify",
        headers={"X-DeepSeek-Key": "sk-user", "X-DeepSeek-Model": "deepseek-chat"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True, "model": "deepseek-chat"}
    assert fake.verified == 1


def test_verify_invalid_key_returns_401(client):
    fake = FakeClient(LLMUnavailable("模型服务不可用"))
    app.dependency_overrides[get_llm_client] = lambda: fake

    response = client.post("/api/llm/verify", headers={"X-DeepSeek-Key": "sk-bad"})

    assert response.status_code == 401
    assert response.json()["code"] == "LLM_UNAUTHORIZED"


def test_verify_timeout_returns_504(client):
    fake = FakeClient(LLMTimeout("模型请求超时"))
    app.dependency_overrides[get_llm_client] = lambda: fake

    response = client.post("/api/llm/verify", headers={"X-DeepSeek-Key": "sk-slow"})

    assert response.status_code == 504
    assert response.json()["code"] == "LLM_TIMEOUT"


def test_status_reports_server_key(client, monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "env-key")
    monkeypatch.setenv("DEEPSEEK_MODEL", "deepseek-chat")

    response = client.get("/api/llm/status")

    assert response.status_code == 200
    assert response.json() == {"configured": True, "model": "deepseek-chat"}


def test_status_without_key_is_unconfigured(client, monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    response = client.get("/api/llm/status")

    assert response.status_code == 200
    assert response.json() == {"configured": False, "model": ""}
