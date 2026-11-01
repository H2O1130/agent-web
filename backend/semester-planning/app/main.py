import sys
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# AI 对话与岗位分析是独立模块（backend/ai-chat、backend/analysis），
# 复用本服务的模型、LLM 客户端与配置；skill_merger / course_mapping 位于 backend 根，供分析模块调用。
BACKEND_ROOT = Path(__file__).resolve().parents[2]
for module_path in (BACKEND_ROOT / "ai-chat", BACKEND_ROOT / "analysis", BACKEND_ROOT):
    if str(module_path) not in sys.path:
        sys.path.insert(0, str(module_path))

from ai_chat.api import router as chat_router  # noqa: E402

from analysis.api import router as analyze_router  # noqa: E402

from app.api.llm import router as llm_router  # noqa: E402
from app.api.plan import router as plan_router  # noqa: E402
from app.core.errors import ApiError  # noqa: E402

app = FastAPI(title="PathPilot Semester Planning")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(plan_router)
app.include_router(llm_router)
app.include_router(chat_router)
app.include_router(analyze_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.exception_handler(ApiError)
async def handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message},
    )


@app.exception_handler(RequestValidationError)
async def handle_request_validation_error(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={
            "code": "INVALID_REQUEST",
            "message": "请求参数不完整或格式不正确。",
        },
    )


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL",
            "message": "规划服务内部错误，请稍后重试。",
        },
    )
