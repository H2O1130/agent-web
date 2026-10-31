from fastapi import APIRouter

from ai_chat.models import ChatRequest
from ai_chat.service import create_reply
from app.api.deps import ClientDependency

router = APIRouter()


@router.post("/api/chat")
def chat_endpoint(request: ChatRequest, client: ClientDependency) -> dict:
    return create_reply(request, client).model_dump()
