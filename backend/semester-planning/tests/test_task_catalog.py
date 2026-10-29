from app.services.job_analysis import extract_skills
from app.services.task_catalog import (
    catalog_for_profile,
    required_task_ids,
)


def test_vue_only_still_requires_prerequisite_chain(profile, jobs):
    job = jobs[0].model_copy(update={"text": "掌握 Vue。"})
    selected = {stat.id for stat in extract_skills([job])}

    required = required_task_ids(profile, selected)

    assert {"html", "javascript", "typescript", "vue", "git"} <= required
    assert "foundation" not in required


def test_graduate_path_adds_exam_tasks(profile):
    graduate = profile.model_copy(update={"path": "graduate"})
    required = required_task_ids(graduate, {"vue"})

    assert {"math", "english"} <= required


def test_foundation_is_required_when_programming_not_selected(profile):
    beginner = profile.model_copy(update={"skills": []})
    required = required_task_ids(beginner, {"vue"})

    assert "foundation" in required


def test_catalog_has_no_dangling_prerequisites(profile):
    catalog = catalog_for_profile(profile)
    catalog_ids = {task.id for task in catalog}

    for task in catalog:
        for prerequisite in task.prerequisites:
            assert prerequisite in catalog_ids
