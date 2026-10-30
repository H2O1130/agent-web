import json
import unittest

from skill_merger import JobValidationError, ModelResponseError, SkillMerger


def response(matches: list[object]) -> str:
    return json.dumps({"matches": matches}, ensure_ascii=False)


def match(
    job_id: str = "job-1",
    skill_id: str = "javascript",
    sentence: str = "掌握 JavaScript，熟悉 JS",
    kind: str = "明确要求",
) -> dict[str, str]:
    return {
        "jobId": job_id,
        "skillId": skill_id,
        "sentence": sentence,
        "kind": kind,
    }


class FakeModel:
    def __init__(self, result: object) -> None:
        self.result = result
        self.prompts: list[str] = []

    def __call__(self, prompt: str) -> object:
        self.prompts.append(prompt)
        return self.result


class SkillMergerTests(unittest.TestCase):
    def test_synonyms_share_one_skill_and_one_job_count(self) -> None:
        model = FakeModel(response([match(), match()]))

        result = SkillMerger(model).merge(
            [{"id": "job-1", "text": "掌握 JavaScript，熟悉 JS。"}]
        )

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["id"], "javascript")
        self.assertEqual(result[0]["count"], 1)
        self.assertEqual(len(result[0]["evidence"]), 1)

    def test_different_skills_are_not_merged(self) -> None:
        sentence = "掌握 JavaScript 与 TypeScript"
        model = FakeModel(
            response(
                [
                    match(skill_id="javascript", sentence=sentence),
                    match(skill_id="typescript", sentence=sentence),
                ]
            )
        )

        result = SkillMerger(model).merge([{"id": "job-1", "text": sentence}])

        self.assertEqual({item["id"] for item in result}, {"javascript", "typescript"})

    def test_count_is_number_of_jobs_not_evidence(self) -> None:
        text = "熟悉 Python。有 Python 项目经验。"
        model = FakeModel(
            response(
                [
                    match(skill_id="python", sentence="熟悉 Python"),
                    match(skill_id="python", sentence="有 Python 项目经验"),
                ]
            )
        )

        result = SkillMerger(model).merge([{"id": "job-1", "text": text}])

        self.assertEqual(result[0]["count"], 1)
        self.assertEqual(len(result[0]["evidence"]), 2)

    def test_same_skill_across_jobs_counts_each_job(self) -> None:
        model = FakeModel(
            response(
                [
                    match(job_id="job-1", skill_id="python", sentence="熟悉 Python"),
                    match(job_id="job-2", skill_id="python", sentence="掌握 Python"),
                ]
            )
        )
        jobs = [
            {"id": "job-1", "text": "熟悉 Python。"},
            {"id": "job-2", "text": "掌握 Python。"},
        ]

        result = SkillMerger(model).merge(jobs)

        self.assertEqual(result[0]["count"], 2)
        self.assertEqual(
            {item["jobId"] for item in result[0]["evidence"]},
            {"job-1", "job-2"},
        )

    def test_results_sort_by_count_then_vocabulary_order(self) -> None:
        model = FakeModel(
            response(
                [
                    match(job_id="job-1", skill_id="html", sentence="HTML"),
                    match(job_id="job-1", skill_id="programming", sentence="编程"),
                    match(job_id="job-1", skill_id="javascript", sentence="JavaScript"),
                    match(job_id="job-2", skill_id="javascript", sentence="JS"),
                ]
            )
        )
        jobs = [
            {"id": "job-1", "text": "编程，HTML，JavaScript"},
            {"id": "job-2", "text": "JS"},
        ]

        result = SkillMerger(model).merge(jobs)

        self.assertEqual(
            [item["id"] for item in result],
            ["javascript", "programming", "html"],
        )

    def test_empty_jobs_return_empty_without_model_call(self) -> None:
        model = FakeModel(response([]))

        result = SkillMerger(model).merge([])

        self.assertEqual(result, [])
        self.assertEqual(model.prompts, [])

    def test_duplicate_job_id_uses_last_job(self) -> None:
        model = FakeModel(response([match(sentence="新版原文")]))

        result = SkillMerger(model).merge(
            [
                {"id": "job-1", "text": "旧版原文"},
                {"id": "job-1", "text": "新版原文"},
            ]
        )

        self.assertEqual(result[0]["evidence"][0]["sentence"], "新版原文")
        self.assertNotIn("旧版原文", model.prompts[0])

    def test_prompt_only_contains_required_job_fields(self) -> None:
        model = FakeModel(response([]))

        SkillMerger(model).merge(
            [{"id": "job-1", "text": "熟悉 JS", "title": "内部岗位名称"}]
        )

        self.assertIn("熟悉 JS", model.prompts[0])
        self.assertNotIn("内部岗位名称", model.prompts[0])
        self.assertIn('"id": "javascript"', model.prompts[0])

    def test_json_code_fence_is_accepted(self) -> None:
        model = FakeModel(f"```json\n{response([match()])}\n```")

        result = SkillMerger(model).merge(
            [{"id": "job-1", "text": "掌握 JavaScript，熟悉 JS"}]
        )

        self.assertEqual(result[0]["id"], "javascript")

    def test_model_caller_exception_is_not_hidden(self) -> None:
        def failing_model(prompt: str) -> str:
            raise TimeoutError("上游超时")

        with self.assertRaisesRegex(TimeoutError, "上游超时"):
            SkillMerger(failing_model).merge([{"id": "job-1", "text": "熟悉 JS"}])

    def test_invalid_jobs_are_rejected_before_model_call(self) -> None:
        invalid_jobs = [
            "not-a-list",
            ["not-an-object"],
            [{"text": "缺少 ID"}],
            [{"id": " ", "text": "空 ID"}],
            [{"id": "job-1"}],
            [{"id": "job-1", "text": " "}],
        ]

        for jobs in invalid_jobs:
            with self.subTest(jobs=jobs):
                model = FakeModel(response([]))
                with self.assertRaises(JobValidationError):
                    SkillMerger(model).merge(jobs)
                self.assertEqual(model.prompts, [])

    def test_invalid_model_responses_are_rejected(self) -> None:
        jobs = [{"id": "job-1", "text": "掌握 JavaScript，熟悉 JS"}]
        invalid_responses = [
            None,
            "not-json",
            "{}",
            '{"matches": {}}',
            response(["not-an-object"]),
            response([{"jobId": "job-1"}]),
            response([match(job_id="unknown")]),
            response([match(skill_id="unknown")]),
            response([match(sentence="伪造证据")]),
            response([match(sentence=" ")]),
            response([match(kind="未知分类")]),
            response([match(kind=1)]),
            "```xml\n{}\n```",
        ]

        for raw_response in invalid_responses:
            with self.subTest(response=raw_response):
                with self.assertRaises(ModelResponseError):
                    SkillMerger(FakeModel(raw_response)).merge(jobs)


if __name__ == "__main__":
    unittest.main()
