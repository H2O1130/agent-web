import re

from app.data.skills import SKILLS, SkillRule
from app.models import Evidence, Job, SkillStat

SENTENCE_SEPARATOR = re.compile(r"[。；;\n]")
CLAUSE_SEPARATOR = re.compile(r"[，,]")
BONUS_CLAUSE = re.compile(r"优先|加分")
REQUIRED_CLAUSE = re.compile(r"掌握|熟悉|熟练|具备|能够|要求")


def extract_skills(jobs: list[Job]) -> list[SkillStat]:
    unique_jobs = _dedupe_jobs(jobs)
    stats: list[SkillStat] = []

    for rule in SKILLS:
        evidence = _collect_evidence(rule, unique_jobs)
        if not evidence:
            continue
        stats.append(
            SkillStat(
                id=rule.id,
                name=rule.name,
                count=len({item.jobId for item in evidence}),
                evidence=evidence,
            )
        )

    stats.sort(key=lambda stat: -stat.count)
    return stats


def _dedupe_jobs(jobs: list[Job]) -> list[Job]:
    unique: dict[str, Job] = {}
    for job in jobs:
        unique[job.id] = job
    return list(unique.values())


def _collect_evidence(rule: SkillRule, jobs: list[Job]) -> list[Evidence]:
    evidence: list[Evidence] = []

    for job in jobs:
        sentences = [part.strip() for part in SENTENCE_SEPARATOR.split(job.text)]
        for sentence in sentences:
            if not sentence or not rule.pattern.search(sentence):
                continue

            previous_kind = "表述不明"
            for clause in CLAUSE_SEPARATOR.split(sentence):
                kind = _classify_clause(clause, previous_kind)
                previous_kind = kind
                if not rule.pattern.search(clause):
                    continue
                evidence.append(Evidence(jobId=job.id, sentence=sentence, kind=kind))

    return evidence


def _classify_clause(clause: str, fallback: str) -> str:
    if BONUS_CLAUSE.search(clause):
        return "加分项"
    if REQUIRED_CLAUSE.search(clause):
        return "明确要求"
    return fallback
