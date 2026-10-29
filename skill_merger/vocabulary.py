import json
from dataclasses import dataclass
from importlib import resources


@dataclass(frozen=True)
class Skill:
    id: str
    name: str
    aliases: tuple[str, ...]


class Vocabulary:
    def __init__(self, skills: tuple[Skill, ...]) -> None:
        if not skills:
            raise ValueError("技能词表不能为空。")

        ids = [skill.id for skill in skills]
        if len(ids) != len(set(ids)):
            raise ValueError("技能词表中存在重复 ID。")
        if any(not skill.id or not skill.name or not skill.aliases for skill in skills):
            raise ValueError("技能词表中的 ID、名称和别名均不能为空。")

        self._skills = skills
        self._by_id = {skill.id: skill for skill in skills}
        self._order = {skill.id: index for index, skill in enumerate(skills)}

    @classmethod
    def default(cls) -> "Vocabulary":
        resource = resources.files(__package__).joinpath("skills.json")
        with resource.open("r", encoding="utf-8") as file:
            raw_skills = json.load(file)

        skills = tuple(
            Skill(
                id=item["id"],
                name=item["name"],
                aliases=tuple(item["aliases"]),
            )
            for item in raw_skills
        )
        return cls(skills)

    def get(self, skill_id: str) -> Skill | None:
        return self._by_id.get(skill_id)

    def order(self, skill_id: str) -> int:
        return self._order[skill_id]

    def as_prompt_data(self) -> list[dict[str, object]]:
        return [
            {
                "id": skill.id,
                "name": skill.name,
                "aliases": list(skill.aliases),
            }
            for skill in self._skills
        ]
