from fastapi import APIRouter

from analysis.models import AnalyzeRequest
from analysis.service import analyze
from app.api.deps import ClientDependency

router = APIRouter()


@router.post("/api/analyze")
def analyze_endpoint(request: AnalyzeRequest, client: ClientDependency) -> dict:
    return analyze(request.jobs, request.profile, client)
