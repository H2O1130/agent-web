import os
from dataclasses import dataclass

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


def get_settings() -> Settings:
    return Settings(
        api_key=os.getenv("DEEPSEEK_API_KEY", "").strip(),
        base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").strip(),
        model=os.getenv("DEEPSEEK_MODEL", "deepseek-flash").strip(),
        timeout=float(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "90")),
        max_tokens=int(os.getenv("DEEPSEEK_MAX_TOKENS", "16384")),
        temperature=float(os.getenv("DEEPSEEK_TEMPERATURE", "0.2")),
    )
