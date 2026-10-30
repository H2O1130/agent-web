from fastapi import APIRouter

from app.api.deps import ClientDependency
from app.core.errors import ApiError
from app.models import PlanRequest
from app.services.planner import create_plan

router = APIRouter()


@router.post("/api/plan")
def plan_endpoint(request: PlanRequest, client: ClientDependency) -> dict:
    if client is None:
        raise ApiError(503, "LLM_NOT_CONFIGURED", "规划服务未配置模型密钥。")
    return {"plan": create_plan(request, client)}
