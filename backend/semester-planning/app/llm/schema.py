from pydantic import BaseModel, ConfigDict, Field


class LLMTask(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    semester: int | None = None
    startWeek: int | None = None
    reason: str = ""


class LLMPlan(BaseModel):
    model_config = ConfigDict(extra="ignore")

    tasks: list[LLMTask] = Field(default_factory=list)
