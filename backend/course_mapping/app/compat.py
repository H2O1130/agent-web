"""与现有后端接口的兼容层。

本模块不新增端点、不改请求体：把结果并入已有的 `/api/analyze` 响应，
并把异常转成现有接口使用的 `{code, message}` 错误体。
"""

from collections.abc import Iterable, Sequence

from .errors import MappingInputError, ModelResponseError
from .types import MappingRow, SkillInput


def error_response(error: BaseException) -> tuple[int, dict[str, str]]:
    """把本模块异常转成现有接口的 `{code, message}`，状态码沿用现有约定。"""
    if isinstance(error, MappingInputError):
        code, status = "bad_request", 400
    elif isinstance(error, ModelResponseError):
        code, status = "llm_bad_response", 502
    else:
        code, status = "internal_error", 500

    message = str(error).strip() or "课程映射失败，请稍后重试"
    return status, {"code": code, "message": message}


def analyze_payload(
    skills: Sequence[SkillInput],
    mappings: Iterable[MappingRow],
) -> dict[str, object]:
    """把映射并入 `/api/analyze` 的现有响应。

    `skills` 原样保留，新增 `mappings` 字段；不认识该字段的前端会直接忽略，
    因此不需要改请求体、端口或 `SkillStat` 类型。
    """
    return {"skills": list(skills), "mappings": list(mappings)}


def rows_by_skill(mappings: Iterable[MappingRow]) -> dict[str, MappingRow]:
    """按 `skillId` 建索引，供前端与技能列表对齐。"""
    return {row["skillId"]: row for row in mappings}