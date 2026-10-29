import re
from dataclasses import dataclass


@dataclass(frozen=True)
class SkillRule:
    id: str
    name: str
    pattern: re.Pattern[str]
    course: str
    project: str
    outcome: str


SKILLS: tuple[SkillRule, ...] = (
    SkillRule(
        id="programming",
        name="编程基础",
        pattern=re.compile(r"编程|程序设计", re.IGNORECASE),
        course="程序设计基础",
        project="命令行待办工具",
        outcome="独立实现输入、条件分支与文件存储",
    ),
    SkillRule(
        id="html",
        name="HTML / CSS",
        pattern=re.compile(r"\bhtml\b|\bcss\b", re.IGNORECASE),
        course="Web 开发基础",
        project="响应式校园介绍页",
        outcome="在手机和桌面完成页面布局验证",
    ),
    SkillRule(
        id="javascript",
        name="JavaScript",
        pattern=re.compile(r"javascript|\bjs\b", re.IGNORECASE),
        course="Web 程序设计",
        project="校园活动报名应用",
        outcome="完成表单、数据筛选与交互反馈",
    ),
    SkillRule(
        id="typescript",
        name="TypeScript",
        pattern=re.compile(r"typescript|\bts\b", re.IGNORECASE),
        course="Web 程序设计（拓展）",
        project="有类型的活动数据模块",
        outcome="类型检查通过，核心数据有明确类型",
    ),
    SkillRule(
        id="vue",
        name="Vue",
        pattern=re.compile(r"\bvue\b", re.IGNORECASE),
        course="前端框架实践（拓展）",
        project="Vue 校园活动工作台",
        outcome="实现组件、路由和跨页状态",
    ),
    SkillRule(
        id="git",
        name="Git",
        pattern=re.compile(r"\bgit\b", re.IGNORECASE),
        course="软件工程实践",
        project="双人协作练习仓库",
        outcome="完成分支协作、代码评审与一次冲突处理",
    ),
    SkillRule(
        id="python",
        name="Python",
        pattern=re.compile(r"\bpython\b", re.IGNORECASE),
        course="Python 程序设计",
        project="课程数据处理工具",
        outcome="完成输入校验、文件读写与异常处理",
    ),
    SkillRule(
        id="sql",
        name="SQL",
        pattern=re.compile(r"\bsql\b|数据库", re.IGNORECASE),
        course="数据库原理",
        project="课程管理数据模块",
        outcome="设计表结构并完成关联查询",
    ),
    SkillRule(
        id="api",
        name="API / 接口",
        pattern=re.compile(r"\bapi\b|接口", re.IGNORECASE),
        course="软件工程 / Web 开发",
        project="校园服务接口联调",
        outcome="记录接口输入、输出和异常情况",
    ),
    SkillRule(
        id="testing",
        name="软件测试",
        pattern=re.compile(r"测试", re.IGNORECASE),
        course="软件测试",
        project="项目关键流程验证",
        outcome="提交关键规则和用户流程的验证记录",
    ),
    SkillRule(
        id="communication",
        name="沟通协作",
        pattern=re.compile(r"沟通|协作", re.IGNORECASE),
        course="软件工程团队实践",
        project="项目演示与复盘",
        outcome="清楚解释方案选择、实践成果与反馈改进",
    ),
)
