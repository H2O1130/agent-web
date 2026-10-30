from app.llm.schema import LLMItem, LLMPeriod, LLMPlan
from app.services.job_analysis import extract_skills
from app.services.micro_catalog import available_micro_tasks, required_micro_ids
from app.services.validator import validate_periods


def _catalog_and_required(profile, jobs):
    analysis = extract_skills(jobs)
    catalog = available_micro_tasks(profile)
    required = required_micro_ids(profile, {stat.id for stat in analysis})
    return catalog, required


def _period(kind: str, semester: int, item_ids: list[str], **overrides) -> LLMPeriod:
    data = {
        "kind": kind,
        "semester": semester,
        "title": "本阶段主题",
        "goal": "本阶段目标",
        "output": "阶段产出",
        "items": [LLMItem(id=item_id).model_dump() for item_id in item_ids],
    }
    data.update(overrides)
    return LLMPeriod.model_validate(data)


def test_valid_plan_has_no_errors(profile, jobs, valid_llm_plan):
    catalog, required = _catalog_and_required(profile, jobs)
    periods = LLMPlan.model_validate(valid_llm_plan).periods

    assert validate_periods(periods, profile, catalog, required) == []


def test_unknown_item_is_rejected(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [_period("semester", 3, ["unknown", "html-semantic"])],
        profile,
        catalog,
        set(),
    )

    assert any("未知微任务" in error for error in errors)


def test_missing_required_item_is_rejected(profile, jobs):
    catalog, required = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [_period("semester", 3, ["git-repo", "html-semantic"])],
        profile,
        catalog,
        required,
    )

    assert any("缺少必需微任务" in error for error in errors)


def test_duplicate_item_is_rejected(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [
            _period("semester", 3, ["git-repo", "html-semantic"]),
            _period("semester", 4, ["git-repo", "ts-types"]),
        ],
        profile,
        catalog,
        set(),
    )

    assert any("微任务 id 重复" in error for error in errors)


def test_prerequisite_in_later_period_is_rejected(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [
            _period("semester", 3, ["js-dom", "html-responsive"]),
            _period("semester", 4, ["html-semantic", "ts-types"]),
        ],
        profile,
        catalog,
        set(),
    )

    assert any("前置微任务 html-semantic" in error for error in errors)


def test_prerequisite_later_in_same_period_is_rejected(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [_period("semester", 3, ["js-dom", "html-semantic"])],
        profile,
        catalog,
        set(),
    )

    assert any("前置微任务 html-semantic" in error for error in errors)


def test_prerequisite_earlier_in_same_period_is_allowed(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [_period("semester", 3, ["html-semantic", "js-dom", "html-responsive"])],
        profile,
        catalog,
        set(),
    )

    assert errors == []


def test_semester_before_current_is_rejected(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [_period("semester", 2, ["git-repo", "html-semantic"])],
        profile,
        catalog,
        set(),
    )

    assert any("不在" in error for error in errors)


def test_missing_period_metadata_is_rejected(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [
            _period(
                "semester",
                3,
                ["git-repo", "html-semantic"],
                title="",
                goal="",
                output="",
            )
        ],
        profile,
        catalog,
        set(),
    )

    assert any("缺少 title" in error for error in errors)
    assert any("缺少 goal" in error for error in errors)
    assert any("缺少 output" in error for error in errors)


def test_empty_period_is_rejected(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [_period("semester", 3, [])],
        profile,
        catalog,
        set(),
    )

    assert any("没有任务" in error for error in errors)


def test_duplicate_semester_is_rejected(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [
            _period("semester", 3, ["git-repo", "html-semantic"]),
            _period("semester", 3, ["html-responsive", "js-dom"]),
        ],
        profile,
        catalog,
        set(),
    )

    assert any("学期重复" in error for error in errors)


def test_semester_density_minimum_is_enforced(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [_period("semester", 3, ["git-repo"])],
        profile,
        catalog,
        set(),
    )

    assert any("应有 3—5 项" in error for error in errors)


def test_vacation_density_maximum_is_enforced(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [
            _period(
                "winter",
                3,
                [
                    "git-repo",
                    "html-semantic",
                    "html-responsive",
                    "js-dom",
                    "js-validate",
                ],
            )
        ],
        profile,
        catalog,
        set(),
    )

    assert any("应有 2—4 项" in error for error in errors)


def test_text_length_is_limited(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [
            _period(
                "semester",
                3,
                ["git-repo", "html-semantic"],
                title="标" * 31,
                goal="目" * 61,
                output="产" * 81,
            )
        ],
        profile,
        catalog,
        set(),
    )

    assert any("title 太长" in error for error in errors)
    assert any("goal 太长" in error for error in errors)
    assert any("output 太长" in error for error in errors)


def test_no_periods_is_rejected(profile, jobs):
    catalog, required = _catalog_and_required(profile, jobs)

    errors = validate_periods([], profile, catalog, required)

    assert any("没有安排任何微任务" in error for error in errors)


def test_winter_after_semester_is_allowed(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [
            _period("semester", 3, ["html-semantic", "js-dom", "html-responsive"]),
            _period("winter", 3, ["js-validate", "ext-accessibility"]),
        ],
        profile,
        catalog,
        set(),
    )

    assert errors == []


def test_winter_at_even_semester_is_rejected(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [_period("winter", 2, ["git-repo", "html-semantic"])],
        profile,
        catalog,
        set(),
    )

    assert any("位置不正确" in error for error in errors)


def test_summer_at_odd_semester_is_rejected(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [_period("summer", 3, ["git-repo", "html-semantic"])],
        profile,
        catalog,
        set(),
    )

    assert any("位置不正确" in error for error in errors)


def test_vacation_before_current_semester_is_rejected(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [_period("summer", 2, ["git-repo", "html-semantic"])],
        profile,
        catalog,
        set(),
    )

    assert any("已经过去" in error for error in errors)


def test_duplicate_vacation_is_rejected(profile, jobs):
    catalog, _ = _catalog_and_required(profile, jobs)

    errors = validate_periods(
        [
            _period("winter", 3, ["git-repo", "html-semantic"]),
            _period("winter", 3, ["html-responsive", "js-dom"]),
        ],
        profile,
        catalog,
        set(),
    )

    assert any("大二寒假" in error for error in errors)
