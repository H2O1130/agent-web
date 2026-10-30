from app.llm.schema import LLMItem, LLMPeriod, LLMPlan
from app.models import PlanRequest
from app.services.job_analysis import extract_skills
from app.services.micro_catalog import available_micro_tasks, required_micro_ids
from app.services.plan_builder import build_paused_plan, build_plan


def test_builder_builds_micro_tasks_and_periods(profile, jobs, valid_llm_plan):
    request = PlanRequest(profile=profile, jobs=jobs, version=1)
    analysis = extract_skills(jobs)
    catalog = available_micro_tasks(profile)
    llm_plan = LLMPlan.model_validate(valid_llm_plan)

    plan = build_plan(
        request,
        analysis,
        catalog,
        llm_plan.periods,
        llm_plan.strategy,
    )

    assert plan.version == 1
    assert plan.jobIds == ["one"]
    assert len(plan.tasks) == 14
    assert [semester.semester for semester in plan.semesters] == [3, 4]
    assert [vacation.label for vacation in plan.vacations] == ["大二寒假", "大二暑假"]
    assert plan.semesters[0].title == "打牢基础"
    assert plan.vacations[0].title == "集中补交互"
    assert plan.semesters[0].itemIds == [
        "git-repo",
        "html-semantic",
        "html-responsive",
        "js-dom",
    ]

    html = next(task for task in plan.tasks if task.id == "html-semantic")
    assert html.title == "语义化页面"
    assert html.outcome == "写导航、活动列表和页脚，使用语义标签"
    assert html.acceptance == "标题层级清楚，结构无嵌套错误"
    assert html.semester == 3
    assert html.startWeek is None
    assert html.weekNote == "第 1—2 周"
    assert html.moduleName == "HTML/CSS"
    assert "校园社团介绍" in html.example

    validation = next(task for task in plan.tasks if task.id == "js-validate")
    assert "报名表单" in validation.example

    extension = next(task for task in plan.tasks if task.id == "ext-accessibility")
    assert extension.periodLabel == "大二寒假"
    assert extension.periodKind == "winter"
    assert extension.periodIndex == 5
    assert extension.moduleName == "可访问性与测试"

    project = next(task for task in plan.tasks if task.id == "project-build")
    assert project.prerequisites == ["project-scope"]

    portfolio = next(task for task in plan.tasks if task.id == "portfolio-page")
    assert portfolio.prerequisites == ["project-build"]

    assert plan.overview.strategy == llm_plan.strategy
    assert "前端开发" in plan.overview.goal
    assert "JavaScript" in plan.overview.stack
    assert len(plan.overview.principles) == 3
    assert [milestone.label for milestone in plan.overview.milestones] == [
        "第 3 学期",
        "大二寒假",
        "第 4 学期",
        "大二暑假",
    ]

    request.profile.hours = 6
    assert plan.profile.hours == 12


def test_builder_falls_back_to_micro_task_text(profile, jobs):
    request = PlanRequest(profile=profile, jobs=jobs, version=1)
    analysis = extract_skills(jobs)
    catalog = available_micro_tasks(profile)
    periods = [
        LLMPeriod(
            kind="semester",
            semester=3,
            title="完成基础",
            goal="完成基础",
            output="可演示页面",
            items=[LLMItem(id="html-semantic")],
        )
    ]

    plan = build_plan(request, analysis, catalog, periods)

    html = next(task for task in plan.tasks if task.id == "html-semantic")
    assert "校园社团介绍" in html.example
    assert html.weekNote == "约 1 周"
    assert plan.vacations == []


def test_paused_plan_keeps_required_micro_tasks_pending(profile, jobs):
    paused = profile.model_copy(update={"hours": 0})
    request = PlanRequest(profile=paused, jobs=jobs, version=1)
    analysis = extract_skills(jobs)
    catalog = available_micro_tasks(paused)
    required = required_micro_ids(paused, {stat.id for stat in analysis})

    plan = build_paused_plan(request, analysis, catalog, required)

    assert plan.semesters == []
    assert plan.vacations == []
    assert plan.tasks
    assert len(plan.tasks) == len(required)
    assert all(task.semester is None for task in plan.tasks)
    assert all(task.reason for task in plan.tasks)
    assert "0 小时" in plan.overview.strategy
