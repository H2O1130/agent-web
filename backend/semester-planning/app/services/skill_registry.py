"""技能归一化：共享词表做提示与别名合并，未收录技能按 slug 新建。"""

import re
import unicodedata
from typing import Any, Iterable

from app.core.registry import skill_alias_map, skill_name

_SLUG = re.compile(r"[^a-z0-9\u4e00-\u9fff]+")


def slug(value: str) -> str:
    text = unicodedata.normalize("NFKC", value).strip().lower()
    text = _SLUG.sub("-", text).strip("-")
    return text[:48] or "skill"


def normalize_id(value: str) -> str:
    """别名命中返回标准 id；未命中返回稳定 slug。"""
    raw = str(value).strip()
    if not raw:
        return ""
    alias = skill_alias_map().get(raw.lower())
    if alias:
        return alias
    return slug(raw)


def display_name(skill_id: str) -> str:
    return skill_name(skill_id) if skill_id else ""


def normalize_skills(items: Iterable[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """按 id 去重合并技能，保留原文证据；evidence 由调用方做原文校验。"""
    merged: dict[str, dict[str, Any]] = {}
    for item in items or []:
        if not isinstance(item, dict):
            continue
        raw_id = str(item.get("id") or item.get("name") or "").strip()
        if not raw_id:
            continue
        skill_id = normalize_id(raw_id)
        if not skill_id:
            continue
        name = str(item.get("name") or display_name(skill_id) or raw_id).strip()
        evidence = [
            evidence
            for evidence in (item.get("evidence") or [])
            if isinstance(evidence, dict)
            and isinstance(evidence.get("jobId"), str)
            and isinstance(evidence.get("sentence"), str)
        ]
        entry = merged.setdefault(skill_id, {"id": skill_id, "name": name, "evidence": []})
        known = {(e["jobId"], e["sentence"]) for e in entry["evidence"]}
        for evidence in evidence:
            key = (evidence["jobId"], evidence["sentence"])
            if key in known:
                continue
            known.add(key)
            entry["evidence"].append(
                {
                    "jobId": evidence["jobId"],
                    "sentence": evidence["sentence"],
                    "kind": evidence.get("kind") or "表述不明",
                }
            )
    return list(merged.values())
