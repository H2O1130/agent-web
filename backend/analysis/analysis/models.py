from pydantic import Field

from app.models import ApiModel, Profile


class AnalyzeJob(ApiModel):
    """岗位分析只需要 id 与原文；其余字段由 ApiModel 忽略。"""

    id: str
    text: str


class AnalyzeRequest(ApiModel):
    jobs: list[AnalyzeJob] = Field(default_factory=list)
    profile: Profile | None = None
