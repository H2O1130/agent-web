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
            text="掌握 JavaScript，熟悉 HTML 与 CSS；具备项目经验。",
            source="demo",
            url="",
            collectedAt="",
        )
    ]
