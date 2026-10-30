from typing import Callable, Literal, TypedDict


EvidenceKind = Literal["明确要求", "加分项", "表述不明"]


class JobInput(TypedDict):
    id: str
    text: str


class Evidence(TypedDict):
    jobId: str
    sentence: str
    kind: EvidenceKind


class SkillStat(TypedDict):
    id: str
    name: str
    count: int
    evidence: list[Evidence]


ModelCaller = Callable[[str], str]
