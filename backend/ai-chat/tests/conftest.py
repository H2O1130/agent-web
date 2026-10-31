import pytest

from app.models import Profile


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
