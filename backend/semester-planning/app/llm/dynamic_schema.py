from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DynamicEvidence(BaseModel):
    model_config = ConfigDict(extra="ignore")

    jobId: str
    sentence: str
    kind: str = "表述不明"


class DynamicSkill(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str = ""
    evidence: list[DynamicEvidence] = Field(default_factory=list)


class DynamicTask(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    title: str
    skillIds: list[str] = Field(default_factory=list)
    course: str = ""
    outcome: str = ""
    acceptance: str = ""
    example: str = ""
    prerequisites: list[str] = Field(default_factory=list)
    hours: float = 2
    weeks: int = 2
    kind: str = "专项"
    weekNote: str = ""


class DynamicPeriod(BaseModel):
    model_config = ConfigDict(extra="ignore")

    kind: Literal["semester", "summer", "winter"] = "semester"
    semester: int
    title: str = ""
    goal: str = ""
    output: str = ""
    decision: str = ""
    items: list[DynamicTask] = Field(default_factory=list)


class DynamicPlan(BaseModel):
    model_config = ConfigDict(extra="ignore")

    strategy: str = ""
    skills: list[DynamicSkill] = Field(default_factory=list)
    periods: list[DynamicPeriod] = Field(default_factory=list)
