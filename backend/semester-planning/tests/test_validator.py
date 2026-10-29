from app.llm.schema import LLMPlan, LLMTask
from app.services.job_analysis import extract_skills
from app.services.task_catalog import catalog_for_profile, required_task_ids
from app.services.validator import validate_tasks


def _catalog_and_required(profile, jobs):
    analysis = extract_skills(jobs)
    catalog = catalog_for_profile(profile)
    required = required_task_ids(profile, {stat.id for stat in analysis})
    return catalog, required


def test_valid_plan_has_no_errors(profile, jobs, valid_llm_plan):
    catalog, required = _catalog_and_required(profile, jobs)
    tasks = LLMPlan.model_validate(valid_llm_plan).tasks

    assert validate_tasks(tasks, profile, catalog, required) == []


def test_over_budget_is_rejected(profile):
    limited = profile.model_copy(update={"hours": 2, "skills": []})
    catalog = catalog_for_profile(limited)
    tasks = [
        LLMTask(id="foundation", semester=3, startWeek=1, reason="基础"),
        LLMTask(id="git", semester=3, startWeek=1, reason="协作"),
    ]

    errors = validate_tasks(tasks, limited, catalog, set())

    assert any("超过预算" in error for error in errors)


def test_task_crossing_semester_is_rejected(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)
    tasks = [LLMTask(id="html", semester=3, startWeek=15, reason="页面")]

    errors = validate_tasks(tasks, profile, catalog, set())

    assert any("跨学期" in error for error in errors)


def test_missing_prerequisite_is_rejected(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)
    tasks = [LLMTask(id="javascript", semester=3, startWeek=4, reason="交互")]

    errors = validate_tasks(tasks, profile, catalog, set())

    assert any("前置任务 html" in error for error in errors)


def test_unknown_task_is_rejected(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)
    tasks = [LLMTask(id="unknown", semester=3, startWeek=1, reason="未知")]

    errors = validate_tasks(tasks, profile, catalog, set())

    assert any("未知任务" in error for error in errors)


def test_missing_required_task_is_rejected(profile, jobs):
    catalog, required = _catalog_and_required(profile, jobs)

    errors = validate_tasks([], profile, catalog, required)

    assert any("缺少必需任务" in error for error in errors)


def test_zero_hours_rejects_scheduled_tasks(profile):
    paused = profile.model_copy(update={"hours": 0})
    catalog = catalog_for_profile(paused)
    tasks = [LLMTask(id="git", semester=3, startWeek=1, reason="协作")]

    errors = validate_tasks(tasks, paused, catalog, set())

    assert any("每周预算为 0" in error for error in errors)


def test_missing_reason_is_rejected(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)
    tasks = [LLMTask(id="git", semester=3, startWeek=1, reason="")]

    errors = validate_tasks(tasks, profile, catalog, set())

    assert any("缺少 reason" in error for error in errors)
