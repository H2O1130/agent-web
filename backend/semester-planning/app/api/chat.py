from fastapi import APIRouter

from app.api.deps import ClientDependency
from app.models import ChatRequest
from app.services.chat import create_reply

router = APIRouter()


@router.post("/api/chat")
def chat_endpoint(request: ChatRequest, client: ClientDependency) -> dict:
    return create_reply(request, client).model_dump()
