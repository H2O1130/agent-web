import json
from collections.abc import Mapping, Sequence
from typing import cast

from .errors import JobValidationError, ModelResponseError
from .prompt import build_prompt
from .types import Evidence, EvidenceKind, JobInput, ModelCaller, SkillStat
from .vocabulary import Vocabulary


EVIDENCE_KINDS = {"明确要求", "加分项", "表述不明"}


class SkillMerger:
    def __init__(self, model_caller: ModelCaller) -> None:
        if not callable(model_caller):
            raise TypeError("model_caller 必须是可调用对象。")
        self._model_caller = model_caller
        self._vocabulary = Vocabulary.default()

    def merge(self, jobs: Sequence[JobInput]) -> list[SkillStat]:
        unique_jobs = _validate_jobs(jobs)
        if not unique_jobs:
            return []

        prompt = build_prompt(unique_jobs, self._vocabulary)
        response = self._model_caller(prompt)
        matches = _parse_response(response)
        return self._merge_matches(unique_jobs, matches)

    def _merge_matches(
        self,
        jobs: Sequence[JobInput],
        matches: Sequence[object],
    ) -> list[SkillStat]:
        jobs_by_id = {job["id"]: job for job in jobs}
        evidence_by_skill: dict[str, list[Evidence]] = {}
        seen_evidence: set[tuple[str, str, str]] = set()

        for index, raw_match in enumerate(matches):
            match = _validate_match(raw_match, index)
            job_id = match["jobId"]
            skill_id = match["skillId"]
            sentence = match["sentence"].strip()
            kind = match["kind"]

            job = jobs_by_id.get(job_id)
            if job is None:
                raise ModelResponseError(f"模型第 {index + 1} 条候选引用了未知岗位 ID。")
            if self._vocabulary.get(skill_id) is None:
                raise ModelResponseError(f"模型第 {index + 1} 条候选引用了未知技能 ID。")
            if not sentence or sentence not in job["text"]:
                raise ModelResponseError(f"模型第 {index + 1} 条候选的证据不是岗位原文。")
            if kind not in EVIDENCE_KINDS:
                raise ModelResponseError(f"模型第 {index + 1} 条候选的证据分类无效。")

            evidence_key = (job_id, skill_id, sentence)
            if evidence_key in seen_evidence:
                continue

            seen_evidence.add(evidence_key)
            evidence_by_skill.setdefault(skill_id, []).append(
                {
                    "jobId": job_id,
                    "sentence": sentence,
                    "kind": cast(EvidenceKind, kind),
                }
            )

        stats = [
            {
                "id": skill_id,
                "name": cast(str, self._vocabulary.get(skill_id).name),
                "count": len({item["jobId"] for item in evidence}),
                "evidence": evidence,
            }
            for skill_id, evidence in evidence_by_skill.items()
        ]
        return sorted(
            stats,
            key=lambda item: (-item["count"], self._vocabulary.order(item["id"])),
        )


def _validate_jobs(jobs: Sequence[JobInput]) -> list[JobInput]:
    if isinstance(jobs, (str, bytes)) or not isinstance(jobs, Sequence):
        raise JobValidationError("jobs 必须是岗位对象数组。")

    unique_jobs: dict[str, JobInput] = {}
    for index, raw_job in enumerate(jobs):
        if not isinstance(raw_job, Mapping):
            raise JobValidationError(f"第 {index + 1} 条岗位必须是对象。")

        job_id = raw_job.get("id")
        text = raw_job.get("text")
        if not isinstance(job_id, str) or not job_id.strip():
            raise JobValidationError(f"第 {index + 1} 条岗位缺少有效 id。")
        if not isinstance(text, str) or not text.strip():
            raise JobValidationError(f"第 {index + 1} 条岗位缺少有效 text。")

        unique_jobs[job_id] = {"id": job_id, "text": text}

    return list(unique_jobs.values())


def _parse_response(response: object) -> list[object]:
    if not isinstance(response, str):
        raise ModelResponseError("模型响应必须是 JSON 字符串。")

    content = response.strip()
    if content.startswith("```") and content.endswith("```"):
        lines = content.splitlines()
        if len(lines) < 3 or not lines[0].strip().lower() in {"```", "```json"}:
            raise ModelResponseError("模型响应的代码块格式无效。")
        content = "\n".join(lines[1:-1]).strip()

    try:
        payload = json.loads(content)
    except json.JSONDecodeError as error:
        raise ModelResponseError("模型响应不是有效 JSON。") from error

    if not isinstance(payload, dict) or not isinstance(payload.get("matches"), list):
        raise ModelResponseError("模型响应必须包含 matches 数组。")
    return payload["matches"]


def _validate_match(raw_match: object, index: int) -> dict[str, str]:
    if not isinstance(raw_match, dict):
        raise ModelResponseError(f"模型第 {index + 1} 条候选必须是对象。")

    match: dict[str, str] = {}
    for field in ("jobId", "skillId", "sentence", "kind"):
        value = raw_match.get(field)
        if not isinstance(value, str):
            raise ModelResponseError(f"模型第 {index + 1} 条候选缺少有效 {field}。")
        match[field] = value
    return match
