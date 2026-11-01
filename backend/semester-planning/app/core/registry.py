"""读取仓库根目录 shared/ 下的方向、技能与示例配置。

共享配置是前后端唯一事实来源：方向只做标签/提示，技能词表只做归一化提示，
示例任务/课程只用于提示词 few-shot，不再作为白名单校验。
"""

import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

_DEFAULT_SHARED = Path(__file__).resolve().parents[4] / "shared"


def shared_dir() -> Path:
    return Path(os.getenv("SHARED_CONFIG_DIR", str(_DEFAULT_SHARED)))


@lru_cache(maxsize=1)
def _load(name: str) -> dict[str, Any]:
    path = shared_dir() / name
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def roles() -> list[dict[str, Any]]:
    return list(_load("roles.json").get("roles", []))


def role_names() -> dict[str, str]:
    return {role["id"]: role["name"] for role in roles()}


def role_aliases() -> dict[str, str]:
    mapping: dict[str, str] = {}
    for role in roles():
        mapping[role["id"].lower()] = role["id"]
        mapping[role["name"].lower()] = role["id"]
        for alias in role.get("aliases", []):
            mapping[str(alias).lower()] = role["id"]
    return mapping


def skills() -> list[dict[str, Any]]:
    return list(_load("skills.json").get("skills", []))


@lru_cache(maxsize=1)
def skill_alias_map() -> dict[str, str]:
    mapping: dict[str, str] = {}
    for skill in skills():
        mapping[skill["id"].lower()] = skill["id"]
        mapping[skill["name"].lower()] = skill["id"]
        for alias in skill.get("aliases", []):
            mapping[str(alias).lower()] = skill["id"]
    return mapping


@lru_cache(maxsize=1)
def skill_regexes() -> list[tuple[str, re.Pattern[str]]]:
    compiled: list[tuple[str, re.Pattern[str]]] = []
    for skill in skills():
        pattern = skill.get("regex")
        if not pattern:
            continue
        try:
            compiled.append((skill["id"], re.compile(str(pattern), re.IGNORECASE)))
        except re.error:
            continue
    return compiled


def skill_name(skill_id: str) -> str:
    for skill in skills():
        if skill["id"] == skill_id:
            return str(skill["name"])
    return skill_id


def examples() -> list[dict[str, Any]]:
    return list(_load("examples/tasks.json").get("examples", []))


def examples_for(direction: str, limit: int = 12) -> list[dict[str, Any]]:
    """优先取同方向示例，不足时补通用示例。"""
    pool = examples()
    same = [item for item in pool if direction and direction in item.get("directions", [])]
    general = [item for item in pool if not item.get("directions")]
    chosen: list[dict[str, Any]] = []
    for item in [*same, *general, *pool]:
        if item in chosen:
            continue
        chosen.append(item)
        if len(chosen) >= limit:
            break
    return chosen
