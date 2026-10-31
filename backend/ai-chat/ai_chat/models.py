from typing import Literal

from pydantic import Field

from app.models import ApiModel, CustomTask, Profile


class ChatMessage(ApiModel):
    role: Literal["user", "assistant"]
    content: str


class ChatItem(ApiModel):
    id: str
    title: str = ""
    semester: int | None = None
    kind: str = ""
    hours: int = 0


class ChatPeriod(ApiModel):
    label: str = ""
    title: str = ""
    goal: str = ""
    items: list[ChatItem] = Field(default_factory=list)


class ChatPlan(ApiModel):
    version: int
    profile: Profile
    periods: list[ChatPeriod] = Field(default_factory=list)


class ChatRequest(ApiModel):
    messages: list[ChatMessage]
    profile: Profile
    plan: ChatPlan


class ChatProposal(ApiModel):
    summary: str
    profile: Profile
    customTasks: list[CustomTask] = Field(default_factory=list)
    dropModules: list[str] = Field(default_factory=list)


class ChatResponse(ApiModel):
    reply: str
    proposal: ChatProposal | None = None
