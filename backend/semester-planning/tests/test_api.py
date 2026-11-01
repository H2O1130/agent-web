from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_llm_client
from app.llm.client import LLMTimeout
from app.main import app
from app.models import Job, PlanRequest, Profile


class FakeClient:
    def __init__(self, responses: list) -> None:
        self.responses = list(responses)
        self.call_count = 0
        self.messages: list[list[dict]] = []

    def complete_json(self, messages: list[dict], **_: object) -> dict:
        self.call_count += 1
        self.messages.append(messages)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _task(task_id: str, title: str, skill: str, *, prereq: list[str] | None = None) -> dict:
    return {
        "id": task_id,
        "title": title,
        "skillIds": [skill],
        "course": "软件工程实践",
        "outcome": "完成一个可演示的小成果",
        "acceptance": "能说明实现过程并演示结果",
        "example": "做一个校园小工具并记录验证过程。",
        "prerequisites": prereq or [],
        "hours": 2,
        "weeks": 2,
        "kind": "基础",
        "weekNote": "约 2 周",
    }


def dynamic_plan() -> dict:
    return {
        "strategy": "先补前端基础，再用项目把技能串起来；每周留出调整空间。",
        "skills": [
            {
                "id": "javascript",
                "name": "JavaScript",
                "evidence": [{"jobId": "one", "sentence": "掌握 JavaScript", "kind": "明确要求"}],
            },
            {
                "id": "html",
                "name": "HTML / CSS",
                "evidence": [{"jobId": "one", "sentence": "熟悉 HTML", "kind": "明确要求"}],
            },
        ],
        "periods": [
            {
                "kind": "semester",
                "semester": 3,
                "title": "打牢基础",
                "goal": "完成页面与交互练习。",
                "output": "一个可用的报名页。",
                "decision": "",
                "items": [
                    _task("d1", "搭建页面骨架", "html"),
                    _task("d2", "完成表单交互", "javascript"),
                    _task("d3", "处理表单校验", "javascript"),
                    _task("d4", "整理页面样式", "html"),
                ],
            },
            {
                "kind": "winter",
                "semester": 3,
                "title": "寒假集中实践",
                "goal": "把校验和保存串起来。",
                "output": "一个支持保存的报名页。",
                "decision": "",
                "items": [
                    _task("w1", "实现本地保存", "javascript", prereq=["d3"]),
                    _task("w2", "复盘项目问题", "html"),
                ],
            },
            {
                "kind": "semester",
                "semester": 4,
                "title": "项目进阶",
                "goal": "完成一个可演示项目。",
                "output": "可演示的项目原型。",
                "decision": "",
                "items": [
                    _task("d5", "梳理项目范围", "html"),
                    _task("d6", "实现核心交互", "javascript"),
                    _task("d7", "补齐异常处理", "javascript"),
                    _task("d8", "整理项目文档", "html"),
                ],
            },
            {
                "kind": "summer",
                "semester": 4,
                "title": "暑假作品集",
                "goal": "整理作品与演示材料。",
                "output": "一份作品集。",
                "decision": "",
                "items": [
                    _task("s1", "整理项目截图", "html"),
                    _task("s2", "练习项目讲解", "javascript", prereq=["d6"]),
                ],
            },
        ],
    }


def payload(profile: Profile, jobs: list[Job], *, direction: str = "frontend", constraints: dict | None = None) -> dict:
    return PlanRequest(
        profile=profile,
        jobs=jobs,
        version=1,
        directionHint=direction,
        constraints=constraints or {},
    ).model_dump()


def test_plan_returns_dynamic_tasks(client, profile, jobs):
    fake = FakeClient([dynamic_plan()])
    app.dependency_overrides[get_llm_client] = lambda: fake

    response = client.post("/api/plan", json=payload(profile, jobs))

    assert response.status_code == 200
    plan = response.json()["plan"]
    assert plan["version"] == 1
    assert len(plan["tasks"]) == 12
    assert [semester["semester"] for semester in plan["semesters"]] == [3, 4]
    assert [vacation["label"] for vacation in plan["vacations"]] == ["寒假", "暑假"]
    assert plan["tasks"][0]["id"].startswith("task-")
    assert plan["tasks"][0]["course"] == "软件工程实践"
    assert "前端开发" in plan["overview"]["goal"]
    assert plan["overview"]["stack"][:2] == ["JavaScript", "HTML / CSS"]


def test_retry_after_invalid_output(client, profile, jobs):
    fake = FakeClient([{"periods": []}, dynamic_plan()])
    app.dependency_overrides[get_llm_client] = lambda: fake

    response = client.post("/api/plan", json=payload(profile, jobs))

    assert response.status_code == 200
    assert fake.call_count == 2


def test_three_timeouts_return_504(client, profile, jobs):
    app.dependency_overrides[get_llm_client] = lambda: FakeClient([LLMTimeout("超时")] * 3)

    response = client.post("/api/plan", json=payload(profile, jobs))

    assert response.status_code == 504
    assert response.json()["code"] == "LLM_TIMEOUT"


def test_validation_failure_reports_502(client, profile, jobs):
    broken = dynamic_plan()
    broken["periods"][0]["items"] = broken["periods"][0]["items"][:1]
    app.dependency_overrides[get_llm_client] = lambda: FakeClient([broken] * 3)

    response = client.post("/api/plan", json=payload(profile, jobs))

    assert response.status_code == 502
    assert response.json()["code"] == "LLM_INVALID_PLAN"


def test_evidence_must_come_from_job_text(client, profile, jobs):
    broken = dynamic_plan()
    broken["skills"][0]["evidence"][0]["sentence"] = "原文里没有这句话"
    app.dependency_overrides[get_llm_client] = lambda: FakeClient([broken] * 3)

    response = client.post("/api/plan", json=payload(profile, jobs))

    assert response.status_code == 502


def test_no_jobs_returns_400(client, profile):
    app.dependency_overrides[get_llm_client] = lambda: FakeClient([])

    response = client.post("/api/plan", json=payload(profile, []))

    assert response.status_code == 400
    assert response.json()["code"] == "NO_JOBS"


def test_invalid_profile_returns_400(client, jobs):
    bad = Profile(
        major="计算机",
        semester=9,
        role="frontend",
        hours=12,
        path="job",
    )
    app.dependency_overrides[get_llm_client] = lambda: FakeClient([])

    response = client.post("/api/plan", json=payload(bad, jobs))

    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_PROFILE"


def test_missing_key_returns_503(client, profile, jobs):
    app.dependency_overrides[get_llm_client] = lambda: None

    response = client.post("/api/plan", json=payload(profile, jobs))

    assert response.status_code == 503
    assert response.json()["code"] == "LLM_NOT_CONFIGURED"


def test_zero_hours_returns_pending_tasks(client, profile, jobs):
    paused = profile.model_copy(update={"hours": 0})
    app.dependency_overrides[get_llm_client] = lambda: FakeClient([dynamic_plan()])

    response = client.post("/api/plan", json=payload(paused, jobs))

    assert response.status_code == 200
    plan = response.json()["plan"]
    assert plan["semesters"] == []
    assert plan["vacations"] == []
    assert all(task["semester"] is None for task in plan["tasks"])
    assert all(task["periodIndex"] == -1 for task in plan["tasks"])


def test_direction_hint_and_constraints_reach_prompt(client, profile, jobs):
    fake = FakeClient([dynamic_plan()])
    app.dependency_overrides[get_llm_client] = lambda: fake

    response = client.post(
        "/api/plan",
        json=payload(
            profile,
            jobs,
            direction="testing",
            constraints={"addSkills": ["docker"], "keepTaskTitles": ["搭建页面骨架"]},
        ),
    )

    assert response.status_code == 200
    assert "软件测试" in response.json()["plan"]["overview"]["goal"]
    prompt = fake.messages[0][1]["content"]
    assert '"addSkills": [' in prompt
    assert "docker" in prompt


def test_duplicate_titles_get_stable_distinct_ids(client, profile, jobs):
    plan = dynamic_plan()
    plan["periods"][0]["items"][1]["title"] = plan["periods"][0]["items"][0]["title"]
    app.dependency_overrides[get_llm_client] = lambda: FakeClient([plan])

    response = client.post("/api/plan", json=payload(profile, jobs))

    assert response.status_code == 200
    ids = [task["id"] for task in response.json()["plan"]["tasks"]]
    assert len(ids) == len(set(ids))
