import unittest

from skill_merger.vocabulary import Skill, Vocabulary


class VocabularyTests(unittest.TestCase):
    def test_default_vocabulary_matches_frontend_skill_ids(self) -> None:
        vocabulary = Vocabulary.default()

        self.assertEqual(
            [item["id"] for item in vocabulary.as_prompt_data()],
            [
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
            ],
        )
        self.assertEqual(vocabulary.get("javascript").name, "JavaScript")
        self.assertIn("JS", vocabulary.get("javascript").aliases)

    def test_duplicate_skill_ids_are_rejected(self) -> None:
        skills = (
            Skill(id="same", name="技能一", aliases=("一",)),
            Skill(id="same", name="技能二", aliases=("二",)),
        )

        with self.assertRaisesRegex(ValueError, "重复 ID"):
            Vocabulary(skills)

    def test_empty_vocabulary_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "不能为空"):
            Vocabulary(())


if __name__ == "__main__":
    unittest.main()
