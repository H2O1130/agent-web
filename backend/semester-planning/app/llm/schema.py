from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class LLMItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    weeks: str = ""


class LLMPeriod(BaseModel):
    model_config = ConfigDict(extra="ignore")

    kind: Literal["semester", "summer", "winter"] = "semester"
    semester: int
    title: str = ""
    goal: str = ""
    output: str = ""
    decision: str = ""
    items: list[LLMItem] = Field(default_factory=list)


class LLMPlan(BaseModel):
    model_config = ConfigDict(extra="ignore")

    strategy: str = ""
    periods: list[LLMPeriod] = Field(default_factory=list)
