from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Role = Literal["frontend", "backend"]
CareerPath = Literal["job", "graduate", "undecided"]
TaskKind = Literal["基础", "专项", "项目", "可选", "备考"]
PeriodKind = Literal["semester", "summer", "winter"]
EvidenceKind = Literal["明确要求", "加分项", "表述不明"]


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Profile(ApiModel):
    major: str
    semester: int
    role: Role
    courses: str = ""
    skills: list[str] = Field(default_factory=list)
    scores: dict[str, int | None] = Field(default_factory=dict)
    hours: float
    path: CareerPath
    interests: list[str] = Field(default_factory=list)


class Job(ApiModel):
    id: str
    role: Role
    title: str
    company: str = ""
    education: str = ""
    text: str
    source: Literal["demo", "imported"]
    url: str = ""
    collectedAt: str = ""


class Evidence(ApiModel):
    jobId: str
    sentence: str
    kind: EvidenceKind


class SkillStat(ApiModel):
    id: str
    name: str
    count: int
    evidence: list[Evidence]


class PlannedTask(ApiModel):
    id: str
    title: str
    skillIds: list[str]
    course: str
    outcome: str
    acceptance: str
    example: str
    prerequisites: list[str]
    hours: int
    weeks: int
    semester: int | None = None
    startWeek: int | None = None
    weekNote: str = ""
    periodIndex: int = 0
    periodLabel: str = ""
    periodKind: PeriodKind = "semester"
    module: str = ""
    moduleName: str = ""
    kind: TaskKind
    jobIds: list[str]
    reason: str


class Milestone(ApiModel):
    semester: int
    label: str = ""
    title: str
    evidence: str


class PlanOverview(ApiModel):
    goal: str
    strategy: str
    principles: list[str]
    stack: list[str]
    milestones: list[Milestone]
    decisionPoint: str


class SemesterPlan(ApiModel):
    semester: int
    title: str
    goal: str
    output: str
    decision: str = ""
    itemIds: list[str]


class VacationPlan(ApiModel):
    id: str
    kind: PeriodKind
    afterSemester: int
    label: str
    title: str
    goal: str
    output: str
    decision: str = ""
    itemIds: list[str]


class Plan(ApiModel):
    id: str
    version: int
    createdAt: str
    profile: Profile
    jobIds: list[str]
    overview: PlanOverview
    semesters: list[SemesterPlan]
    vacations: list[VacationPlan]
    tasks: list[PlannedTask]


class PlanRequest(ApiModel):
    profile: Profile
    jobs: list[Job]
    version: int
