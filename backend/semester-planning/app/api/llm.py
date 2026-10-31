from fastapi import APIRouter

from app.api.deps import ClientDependency, SettingsDependency
from app.core.errors import ApiError
from app.llm.client import LLMTimeout, LLMUnavailable

router = APIRouter()


@router.get("/api/llm/status")
def status_endpoint(settings: SettingsDependency) -> dict:
    """告诉前端服务端是否已经配好密钥，普通用户因此不需要自己填。"""
    return {
        "configured": settings.configured,
        "model": settings.model if settings.configured else "",
    }


@router.post("/api/llm/verify")
def verify_endpoint(settings: SettingsDependency, client: ClientDependency) -> dict:
    if client is None:
        raise ApiError(503, "LLM_NOT_CONFIGURED", "还没有填写模型密钥，请先在模型设置里保存。")

    try:
        client.verify()
    except LLMTimeout as exc:
        raise ApiError(504, "LLM_TIMEOUT", "连接模型超时，请检查网络后重试。") from exc
    except LLMUnavailable as exc:
        raise ApiError(401, "LLM_UNAUTHORIZED", "密钥无效或无法访问模型服务，请检查后重试。") from exc

    return {"ok": True, "model": settings.model}
