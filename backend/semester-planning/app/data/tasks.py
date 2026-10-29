from dataclasses import dataclass


@dataclass(frozen=True)
class TaskTemplate:
    id: str
    title: str
    skill_ids: tuple[str, ...]
    course: str
    outcome: str
    acceptance: str
    prerequisites: tuple[str, ...]
    hours: int
    weeks: int
    kind: str

    def to_prompt(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "skillIds": list(self.skill_ids),
            "course": self.course,
            "outcome": self.outcome,
            "acceptance": self.acceptance,
            "prerequisites": list(self.prerequisites),
            "hours": self.hours,
            "weeks": self.weeks,
            "kind": self.kind,
        }


COMMON_TASKS: tuple[TaskTemplate, ...] = (
    TaskTemplate(
        id="foundation",
        title="用一个小工具核对编程基础",
        skill_ids=("programming",),
        course="程序设计基础",
        outcome="可运行的命令行待办工具",
        acceptance="能够独立解释输入处理、条件分支与文件存储",
        prerequisites=(),
        hours=2,
        weeks=2,
        kind="基础",
    ),
    TaskTemplate(
        id="git",
        title="建立 Git 协作习惯",
        skill_ids=("git",),
        course="软件工程实践",
        outcome="带清晰提交记录的协作仓库",
        acceptance="完成分支合并、一次冲突处理和 README",
        prerequisites=(),
        hours=2,
        weeks=2,
        kind="基础",
    ),
)

FRONTEND_TASKS: tuple[TaskTemplate, ...] = (
    TaskTemplate(
        id="html",
        title="搭建响应式网页",
        skill_ids=("html",),
        course="Web 开发基础",
        outcome="手机与桌面均可使用的校园介绍页",
        acceptance="320px—1920px 无页面横向溢出",
        prerequisites=("foundation",),
        hours=3,
        weeks=3,
        kind="基础",
    ),
    TaskTemplate(
        id="javascript",
        title="把 JavaScript 用到真实交互里",
        skill_ids=("javascript",),
        course="Web 程序设计",
        outcome="支持校验、筛选与保存的报名表单",
        acceptance="处理空输入、重复报名和数据恢复",
        prerequisites=("html",),
        hours=4,
        weeks=4,
        kind="专项",
    ),
    TaskTemplate(
        id="typescript",
        title="用 TypeScript 理清数据",
        skill_ids=("typescript",),
        course="Web 程序设计（拓展）",
        outcome="有明确类型的活动数据模块",
        acceptance="通过类型检查并移除无用途的封装",
        prerequisites=("javascript",),
        hours=3,
        weeks=3,
        kind="专项",
    ),
    TaskTemplate(
        id="vue",
        title="完成 Vue 组件与页面协作",
        skill_ids=("vue",),
        course="前端框架实践（拓展）",
        outcome="带导航、表单和共享状态的 Vue 应用",
        acceptance="返回修改数据后，页面显示与状态一致",
        prerequisites=("typescript",),
        hours=4,
        weeks=4,
        kind="专项",
    ),
    TaskTemplate(
        id="frontend-project",
        title="交付校园活动报名项目",
        skill_ids=("vue", "api", "javascript"),
        course="软件工程课程设计",
        outcome="可演示项目、源码与验证记录",
        acceptance="完整走通报名流程并解释方案取舍",
        prerequisites=("vue", "git"),
        hours=6,
        weeks=6,
        kind="项目",
    ),
    TaskTemplate(
        id="frontend-extension",
        title="拓展一个可访问性小项目",
        skill_ids=("html", "javascript", "testing"),
        course="Web 开发实践（选做）",
        outcome="键盘可操作的小型应用与测试记录",
        acceptance="覆盖键盘操作、错误提示和手机布局",
        prerequisites=("javascript",),
        hours=4,
        weeks=6,
        kind="可选",
    ),
)

BACKEND_TASKS: tuple[TaskTemplate, ...] = (
    TaskTemplate(
        id="python",
        title="用 Python 处理课程数据",
        skill_ids=("python",),
        course="Python 程序设计",
        outcome="有输入校验的数据处理工具",
        acceptance="处理缺失文件、空数据和非法输入",
        prerequisites=("foundation",),
        hours=4,
        weeks=4,
        kind="专项",
    ),
    TaskTemplate(
        id="sql",
        title="为课程系统设计数据库",
        skill_ids=("sql",),
        course="数据库原理",
        outcome="表结构、示例数据与查询语句",
        acceptance="能够解释主键与关联，完成多表查询",
        prerequisites=("python",),
        hours=3,
        weeks=4,
        kind="专项",
    ),
    TaskTemplate(
        id="api",
        title="实现清晰可用的服务接口",
        skill_ids=("api", "python"),
        course="Web 开发 / 软件工程",
        outcome="具有输入校验的校园服务",
        acceptance="演示正常请求、错误输入和数据查询",
        prerequisites=("sql",),
        hours=4,
        weeks=4,
        kind="专项",
    ),
    TaskTemplate(
        id="backend-project",
        title="交付课程管理后端项目",
        skill_ids=("python", "sql", "api"),
        course="软件工程课程设计",
        outcome="可演示服务、数据说明与源码",
        acceptance="完成一个完整业务并通过关键规则验证",
        prerequisites=("api", "git"),
        hours=6,
        weeks=6,
        kind="项目",
    ),
    TaskTemplate(
        id="backend-extension",
        title="为服务补充关键流程测试",
        skill_ids=("python", "testing"),
        course="软件测试（选做）",
        outcome="关键业务的自动化验证与报告",
        acceptance="覆盖空数据、异常输入和重复操作",
        prerequisites=("python",),
        hours=4,
        weeks=6,
        kind="可选",
    ),
)

GRADUATE_TASKS: tuple[TaskTemplate, ...] = (
    TaskTemplate(
        id="math",
        title="整理数学基础与每周练习",
        skill_ids=(),
        course="数学备考（路径假设）",
        outcome="错题与知识点记录",
        acceptance="每周完成练习并复盘薄弱点",
        prerequisites=(),
        hours=4,
        weeks=12,
        kind="备考",
    ),
    TaskTemplate(
        id="english",
        title="建立英语阅读与复盘习惯",
        skill_ids=(),
        course="英语备考（路径假设）",
        outcome="阅读与词汇复盘记录",
        acceptance="记录练习过程与易错问题",
        prerequisites=(),
        hours=2,
        weeks=12,
        kind="备考",
    ),
)
