from typing import Annotated

from fastapi import Depends, Header

from app.core.config import Settings, get_settings
from app.llm.client import DeepSeekClient


def resolve_settings(
    x_deepseek_key: Annotated[str | None, Header()] = None,
    x_deepseek_model: Annotated[str | None, Header()] = None,
    x_deepseek_base_url: Annotated[str | None, Header()] = None,
) -> Settings:
    return get_settings().with_overrides(
        api_key=x_deepseek_key,
        model=x_deepseek_model,
        base_url=x_deepseek_base_url,
    )


def get_llm_client(
    settings: Annotated[Settings, Depends(resolve_settings)],
) -> DeepSeekClient | None:
    if not settings.configured:
        return None
    return DeepSeekClient(settings)


SettingsDependency = Annotated[Settings, Depends(resolve_settings)]
ClientDependency = Annotated[DeepSeekClient | None, Depends(get_llm_client)]
