import pytest

from app.models import Job, Profile


@pytest.fixture
def profile() -> Profile:
    return Profile(
        major="计算机科学与技术",
        semester=3,
        role="frontend",
        courses="",
        skills=["programming"],
        scores={
            "programming": 5,
            "project": None,
            "analysis": None,
            "communication": None,
        },
        hours=12,
        path="job",
        interests=["技术实现"],
    )


@pytest.fixture
def jobs() -> list[Job]:
    return [
        Job(
            id="one",
            role="frontend",
            title="前端开发",
            company="示例企业 A",
            education="本科",
            text=(
                "掌握 JavaScript，熟悉 JS；掌握 TypeScript 和 Vue；"
                "熟悉 HTML/CSS 和 Git；具备项目经验与沟通能力。"
            ),
            source="demo",
            url="",
            collectedAt="",
        )
    ]


@pytest.fixture
def valid_llm_plan() -> dict:
    return {
        "strategy": "学期内先补页面和交互，寒假集中做校验与可访问性，第 4 学期用项目串起来；每周 12 小时，不把时间排满。",
        "periods": [
            {
                "kind": "semester",
                "semester": 3,
                "title": "第 3 学期 · 打牢基础",
                "goal": "完成页面结构和基础交互。",
                "output": "一个能在手机和桌面打开的社团页。",
                "decision": "",
                "items": [
                    {"id": "git-repo", "weeks": "第 1 周"},
                    {"id": "html-semantic", "weeks": "第 1—2 周"},
                    {"id": "html-responsive", "weeks": "第 3 周"},
                    {"id": "js-dom", "weeks": "第 4—5 周"},
                ],
            },
            {
                "kind": "winter",
                "semester": 3,
                "title": "大二寒假 · 集中补交互",
                "goal": "把表单校验和可访问性一次做完。",
                "output": "一个支持校验和键盘操作的报名表单。",
                "decision": "",
                "items": [
                    {"id": "js-validate", "weeks": "约 2 周"},
                    {"id": "ext-accessibility", "weeks": "约 1 周"},
                ],
            },
            {
                "kind": "semester",
                "semester": 4,
                "title": "打通交互与类型",
                "goal": "把类型、组件和状态用到真实页面。",
                "output": "一个有类型和共享状态的 Vue 页面。",
                "decision": "",
                "items": [
                    {"id": "ts-types", "weeks": "第 1—2 周"},
                    {"id": "vue-component", "weeks": "第 3—4 周"},
                    {"id": "vue-state", "weeks": "第 5—6 周"},
                    {"id": "html-form", "weeks": "第 7 周"},
                ],
            },
            {
                "kind": "summer",
                "semester": 4,
                "title": "项目与作品集",
                "goal": "用一个完整项目把技能串起来。",
                "output": "可演示的报名系统与一页作品集。",
                "decision": "项目做不完时优先缩小范围，不增加每周时间。",
                "items": [
                    {"id": "project-scope", "weeks": "约 1 周"},
                    {"id": "project-build", "weeks": "约 3 周"},
                    {"id": "portfolio-page", "weeks": "约 1 周"},
                    {"id": "project-deploy", "weeks": "约 1 周"},
                ],
            },
        ],
    }
