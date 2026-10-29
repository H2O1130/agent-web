from app.llm.schema import LLMPlan
from app.models import PlanRequest
from app.services.job_analysis import extract_skills
from app.services.plan_builder import build_plan
from app.services.task_catalog import catalog_for_profile


def test_builder_fills_static_fields_and_snapshot(profile, jobs, valid_llm_plan):
    request = PlanRequest(profile=profile, jobs=jobs, version=1)
    analysis = extract_skills(jobs)
    catalog = catalog_for_profile(profile)
    tasks = LLMPlan.model_validate(valid_llm_plan).tasks

    plan = build_plan(request, analysis, catalog, tasks)

    assert plan.version == 1
    assert plan.jobIds == ["one"]
    assert len(plan.tasks) == 8

    html = next(task for task in plan.tasks if task.id == "html")
    assert html.title == "搭建响应式网页"
    assert html.hours == 3
    assert html.weeks == 3
    assert html.kind == "基础"
    assert html.jobIds == ["one"]

    project = next(task for task in plan.tasks if task.id == "frontend-project")
    assert project.prerequisites == ["vue", "git"]

    request.profile.hours = 6
    assert plan.profile.hours == 12
