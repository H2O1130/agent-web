import json
import os
from urllib import request

import pytest

from app import CourseMapper, ModelResponseError

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(
        not os.environ.get("DEEPSEEK_API_KEY"),
        reason="未设置 DEEPSEEK_API_KEY，跳过 live 测试",
    ),
]

BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-flash")
TIMEOUT = int(os.environ.get("DEEPSEEK_TIMEOUT_SECONDS", "90"))

SKILL_IDS = [
    "programming",
    "html",
    "javascript",
    "typescript",
    "vue",
    "git",
    "python",
    "sql",
    "api",
    "testing",
    "communication",
]


def call_deepseek(prompt: str) -> str:
    """测试用模型调用方：密钥只从环境变量读取，不落盘、不打印。"""
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "max_tokens": 16384,
        "response_format": {"type": "json_object"},
        "thinking": {"type": "disabled"},
    }
    http_request = request.Request(
        f"{BASE_URL}/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.environ['DEEPSEEK_API_KEY']}",
        },
        method="POST",
    )
    with request.urlopen(http_request, timeout=TIMEOUT) as response:
        body = json.load(response)
    return body["choices"][0]["message"]["content"]


def map_with_retry(mapper: CourseMapper, skills: list[dict[str, object]], profile: dict[str, object]):
    """复现产品约定：校验失败重试 1 次，仍失败直接报错。"""
    try:
        return mapper.map(skills, profile), 1
    except ModelResponseError as first_error:
        print(f"\n第 1 次校验失败，按调用方约定重试 1 次：{first_error}")
        return mapper.map(skills, profile), 2


def test_live_maps_all_standard_skills() -> None:
    skills = [{"id": skill_id, "count": 3} for skill_id in SKILL_IDS]
    profile = {
        "major": "计算机科学与技术",
        "semester": 3,
        "role": "frontend",
        "path": "job",
        "courses": "程序设计基础",
    }

    rows, attempts = map_with_retry(CourseMapper(call_deepseek), skills, profile)

    print(f"\nlive 调用成功，尝试次数：{attempts}")
    print(json.dumps(rows, ensure_ascii=False, indent=2))

    assert [row["skillId"] for row in rows] == SKILL_IDS
    assert all(row["sourceKind"] == "示例" for row in rows)
    assert all(row["reason"] and len(row["reason"]) <= 200 for row in rows)
    assert all(row["courseId"] and row["projectId"] for row in rows)


def test_live_marks_already_taken_course() -> None:
    mapper = CourseMapper(call_deepseek)
    # 把所有覆盖 python 的课程都标为已修，模型的任何合法选择都应命中已修。
    covering = [course.name for course in mapper.catalog.courses_for_skill("python")]
    assert len(covering) >= 2
    profile = {
        "semester": 5,
        "role": "backend",
        "path": "job",
        "courses": "、".join(covering),
    }

    rows, attempts = map_with_retry(mapper, [{"id": "python", "count": 2}], profile)

    print(f"\nlive 调用成功，尝试次数：{attempts}")
    print(json.dumps(rows, ensure_ascii=False, indent=2))

    assert len(rows) == 1
    assert rows[0]["skillId"] == "python"
    assert rows[0]["alreadyTaken"] is True