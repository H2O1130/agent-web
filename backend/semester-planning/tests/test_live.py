import os

import pytest

from app.core.config import get_settings
from app.llm.client import DeepSeekClient
from app.models import PlanRequest
from app.services.planner import create_plan

pytestmark = pytest.mark.live


@pytest.mark.skipif(
    os.getenv("RUN_LIVE_TESTS") != "1" or not os.getenv("DEEPSEEK_API_KEY"),
    reason="需要 RUN_LIVE_TESTS=1 与 DEEPSEEK_API_KEY",
)
def test_live_plan(profile, jobs):
    plan = create_plan(
        PlanRequest(profile=profile, jobs=jobs, version=1),
        DeepSeekClient(get_settings()),
    )

    assert plan.tasks
