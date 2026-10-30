import json

import httpx
from openai import APITimeoutError, OpenAI, OpenAIError

from app.core.config import Settings


class LLMTimeout(Exception):
    pass


class LLMUnavailable(Exception):
    pass


class LLMInvalidOutput(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class DeepSeekClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = OpenAI(
            api_key=settings.api_key,
            base_url=settings.base_url,
            timeout=httpx.Timeout(settings.timeout, connect=10.0),
            max_retries=0,
        )

    def verify(self) -> None:
        try:
            self._client.chat.completions.create(
                model=self._settings.model,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=4,
                temperature=0,
            )
        except (APITimeoutError, httpx.TimeoutException) as exc:
            raise LLMTimeout("模型请求超时") from exc
        except OpenAIError as exc:
            raise LLMUnavailable("模型服务不可用") from exc

    def complete_json(self, messages: list[dict]) -> dict:
        try:
            response = self._client.chat.completions.create(
                model=self._settings.model,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=self._settings.temperature,
                max_tokens=self._settings.max_tokens,
                extra_body={"thinking": {"type": "disabled"}},
            )
        except (APITimeoutError, httpx.TimeoutException) as exc:
            raise LLMTimeout("模型请求超时") from exc
        except OpenAIError as exc:
            raise LLMUnavailable("模型服务不可用") from exc

        choice = response.choices[0]
        if choice.finish_reason == "length":
            raise LLMInvalidOutput("模型输出被截断")

        content = choice.message.content or ""
        try:
            data = json.loads(content)
        except json.JSONDecodeError as exc:
            raise LLMInvalidOutput("模型返回的不是合法 JSON") from exc

        if not isinstance(data, dict):
            raise LLMInvalidOutput("模型返回的不是 JSON 对象")
        return data
