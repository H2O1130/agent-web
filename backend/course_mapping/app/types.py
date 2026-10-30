from collections.abc import Mapping
from typing import Callable, Literal, TypedDict


Role = Literal["frontend", "backend"]
CareerPath = Literal["job", "graduate", "undecided"]


class MappingEvidence(TypedDict):
    jobId: str
    sentence: str
    kind: str


class SkillInput(TypedDict, total=False):
    """映射输入：与前端 SkillStat 兼容，只有 id 必填。"""

    id: str
    name: str
    count: int
    evidence: list[MappingEvidence]


class ProfileInput(TypedDict, total=False):
    """画像上下文：仅用于提示词与“已修”判断，不参与结果校验。"""

    major: str
    semester: int
    role: Role
    path: CareerPath
    courses: str


class MappingRow(TypedDict):
    """一条技能 → 课程 → 实践映射，附带来源。"""

    skillId: str
    skillName: str
    skillCount: int
    jobIds: list[str]
    courseId: str
    course: str
    courseSemester: int | None
    projectId: str
    project: str
    outcome: str
    acceptance: str
    reason: str
    alreadyTaken: bool
    courseSource: str
    projectSource: str
    sourceKind: str


# 主约定是返回原始文本；已解析的 `{"mappings": [...]}` 也接受，
# 便于复用已有客户端（部分客户端会在返回前做 JSON.parse）。
ModelCaller = Callable[[str], str | Mapping[str, object]]