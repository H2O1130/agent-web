import os
from dataclasses import dataclass, replace

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    api_key: str
    base_url: str
    model: str
    timeout: float
    max_tokens: int
    temperature: float

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def with_overrides(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
    ) -> "Settings":
        return replace(
            self,
            api_key=(api_key or "").strip() or self.api_key,
            model=(model or "").strip() or self.model,
            base_url=(base_url or "").strip() or self.base_url,
        )


def get_settings() -> Settings:
    return Settings(
        api_key=os.getenv("DEEPSEEK_API_KEY", "").strip(),
        base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").strip(),
        model=os.getenv("DEEPSEEK_MODEL", "deepseek-flash").strip(),
        timeout=float(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "90")),
        max_tokens=int(os.getenv("DEEPSEEK_MAX_TOKENS", "16384")),
        temperature=float(os.getenv("DEEPSEEK_TEMPERATURE", "0.2")),
    )
