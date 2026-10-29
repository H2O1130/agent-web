from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.config import get_settings
from app.core.errors import ApiError
from app.llm.client import DeepSeekClient
from app.models import PlanRequest
from app.services.planner import create_plan

router = APIRouter()


def get_llm_client() -> DeepSeekClient | None:
    settings = get_settings()
    if not settings.api_key:
        return None
    return DeepSeekClient(settings)


ClientDependency = Annotated[DeepSeekClient | None, Depends(get_llm_client)]


@router.post("/api/plan")
def plan_endpoint(request: PlanRequest, client: ClientDependency) -> dict:
    if client is None:
        raise ApiError(503, "LLM_NOT_CONFIGURED", "规划服务未配置模型密钥。")
    return {"plan": create_plan(request, client)}
