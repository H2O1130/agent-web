from app.models import Job
from app.services.job_analysis import extract_skills


def test_same_skill_in_one_job_counts_once(jobs):
    result = extract_skills(jobs)
    javascript = next(stat for stat in result if stat.id == "javascript")

    assert javascript.count == 1
    assert "掌握 JavaScript" in javascript.evidence[0].sentence


def test_empty_jobs_return_no_stats():
    assert extract_skills([]) == []


def test_required_and_bonus_are_classified_by_clause(jobs):
    job = jobs[0].model_copy(
        update={"text": "掌握 JavaScript，TypeScript 使用经验者优先。"}
    )
    result = extract_skills([job])

    javascript = next(stat for stat in result if stat.id == "javascript")
    typescript = next(stat for stat in result if stat.id == "typescript")

    assert javascript.evidence[0].kind == "明确要求"
    assert typescript.evidence[0].kind == "加分项"


def test_unknown_text_produces_no_stats():
    job = Job(
        id="empty",
        role="frontend",
        title="未知",
        company="",
        education="",
        text="这里没有任何可识别的技能描述。",
        source="demo",
        url="",
        collectedAt="",
    )
    assert extract_skills([job]) == []
