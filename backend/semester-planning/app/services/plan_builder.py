from datetime import UTC, datetime
from uuid import uuid4

from app.data.tasks import TaskTemplate
from app.llm.schema import LLMTask
from app.models import Plan, PlannedTask, PlanRequest, SkillStat


def build_plan(
    request: PlanRequest,
    analysis: list[SkillStat],
    catalog: list[TaskTemplate],
    llm_tasks: list[LLMTask],
) -> Plan:
    catalog_map = {task.id: task for task in catalog}
    provided_ids = {task.id for task in llm_tasks}
    tasks: list[PlannedTask] = []

    for llm_task in llm_tasks:
        template = catalog_map[llm_task.id]
        tasks.append(
            PlannedTask(
                id=template.id,
                title=template.title,
                skillIds=list(template.skill_ids),
                course=template.course,
                outcome=template.outcome,
                acceptance=template.acceptance,
                prerequisites=[
                    prerequisite
                    for prerequisite in template.prerequisites
                    if prerequisite in provided_ids
                ],
                hours=template.hours,
                weeks=template.weeks,
                semester=llm_task.semester,
                startWeek=llm_task.startWeek,
                kind=template.kind,
                jobIds=_collect_job_ids(template, analysis),
                reason=llm_task.reason.strip(),
            )
        )

    tasks.sort(
        key=lambda task: (
            task.semester is None,
            task.semester or 0,
            task.startWeek or 0,
        )
    )

    return Plan(
        id=str(uuid4()),
        version=request.version,
        createdAt=_now(),
        profile=request.profile.model_copy(deep=True),
        jobIds=list(dict.fromkeys(job.id for job in request.jobs)),
        tasks=tasks,
    )


def _collect_job_ids(template: TaskTemplate, analysis: list[SkillStat]) -> list[str]:
    job_ids: list[str] = []
    for stat in analysis:
        if stat.id not in template.skill_ids:
            continue
        for evidence in stat.evidence:
            if evidence.jobId not in job_ids:
                job_ids.append(evidence.jobId)
    return job_ids


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
