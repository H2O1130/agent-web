import math

from pydantic import ValidationError

from ai_chat.models import ChatRequest, ChatResponse
from ai_chat.prompt import build_chat_messages
from app.core.errors import ApiError
from app.llm.client import LLMInvalidOutput, LLMTimeout, LLMUnavailable
from app.models import Profile
from app.services.skill_registry import normalize_id


def create_reply(request: ChatRequest, client) -> ChatResponse:
    if client is None:
        raise ApiError(503, "LLM_NOT_CONFIGURED", "还没有填写模型密钥，请先在模型设置里保存。")
    if not any(item.role == "user" and item.content.strip() for item in request.messages):
        raise ApiError(400, "EMPTY_MESSAGE", "请先输入你想讨论的问题。")

    _assert_profile(request.profile, 400, "INVALID_PROFILE", "当前画像的学期或时间不合法。")

    messages = build_chat_messages(request)
    last_status = 502
    last_code = "LLM_UNAVAILABLE"
    last_message = "对话服务暂时不可用，请稍后重试。"

    for _ in range(2):
        try:
            raw = client.complete_json(messages, temperature=0.7, max_tokens=2048)
        except LLMTimeout:
            last_status, last_code = 504, "LLM_TIMEOUT"
            last_message = "对话响应超时，请稍后重试。"
            continue
        except LLMUnavailable:
            last_status, last_code = 502, "LLM_UNAVAILABLE"
            last_message = "对话服务暂时不可用，请稍后重试。"
            continue
        except LLMInvalidOutput:
            last_status, last_code = 502, "LLM_INVALID_REPLY"
            last_message = "对话结果格式不正确，请再试一次。"
            continue

        try:
            output = ChatResponse.model_validate(raw)
        except ValidationError as exc:
            raise ApiError(502, "LLM_INVALID_REPLY", "对话结果格式不正确，请再试一次。") from exc

        reply = output.reply.strip() or "我理解你的想法，能再说具体一点想调整哪部分吗？"
        proposal = output.proposal

        if proposal is None:
            return ChatResponse(reply=reply, proposal=None)

        _assert_profile(
            proposal.profile,
            502,
            "LLM_INVALID_PROFILE",
            "模型给出的调整超出允许范围，请换个说法再试。",
        )

        add_skills = _clean_list(proposal.addSkills)
        remove_skills = [skill for skill in _clean_list(proposal.removeSkills) if skill not in add_skills]
        keep_titles = [title for title in proposal.keepTaskTitles if title.strip()][:12]

        profile_changed = proposal.profile.model_dump() != request.profile.model_dump()
        if not profile_changed and not add_skills and not remove_skills and not keep_titles:
            return ChatResponse(reply=reply, proposal=None)

        summary = proposal.summary.strip() or "调整生成约束"
        return ChatResponse(
            reply=reply,
            proposal=proposal.model_copy(
                update={
                    "summary": summary,
                    "addSkills": add_skills,
                    "removeSkills": remove_skills,
                    "keepTaskTitles": keep_titles,
                }
            ),
        )

    raise ApiError(last_status, last_code, last_message)


def _clean_list(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        skill_id = normalize_id(str(value)) if str(value).strip() else ""
        if skill_id and skill_id not in result:
            result.append(skill_id)
    return result


def _assert_profile(profile: Profile, status: int, code: str, message: str) -> None:
    semester = profile.semester
    hours = profile.hours
    semester_ok = isinstance(semester, int) and 1 <= semester <= 8
    hours_ok = math.isfinite(hours) and 0 <= hours <= 30
    if not semester_ok or not hours_ok:
        raise ApiError(status, code, message)
