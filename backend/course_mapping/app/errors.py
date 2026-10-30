class CourseMappingError(Exception):
    """课程与实践映射模块的异常基类。"""


class MappingInputError(CourseMappingError, ValueError):
    """技能或画像输入不符合契约。"""


class ModelResponseError(CourseMappingError):
    """模型响应无法通过结构、ID 或课程—项目一致性校验。"""


class CatalogError(CourseMappingError, ValueError):
    """课程/项目资料表结构或引用关系损坏。"""