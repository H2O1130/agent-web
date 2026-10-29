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
        "tasks": [
            {"id": "git", "semester": 3, "startWeek": 1, "reason": "建立协作习惯"},
            {"id": "html", "semester": 3, "startWeek": 1, "reason": "页面基础"},
            {"id": "javascript", "semester": 3, "startWeek": 4, "reason": "交互基础"},
            {"id": "typescript", "semester": 3, "startWeek": 8, "reason": "类型基础"},
            {"id": "vue", "semester": 3, "startWeek": 11, "reason": "框架实践"},
            {
                "id": "frontend-extension",
                "semester": 3,
                "startWeek": 8,
                "reason": "可访问性练习",
            },
            {
                "id": "frontend-project",
                "semester": 4,
                "startWeek": 1,
                "reason": "综合项目",
            },
            {"id": "portfolio", "semester": 4, "startWeek": 7, "reason": "作品整理"},
        ]
    }
