class SkillMergeError(Exception):
    """技能归并模块的异常基类。"""


class JobValidationError(SkillMergeError, ValueError):
    """岗位输入不符合契约。"""


class ModelResponseError(SkillMergeError):
    """模型响应无法通过结构或证据校验。"""
