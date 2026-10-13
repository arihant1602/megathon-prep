import io
from contextlib import asynccontextmanager
from functools import lru_cache

import pandas as pd
from fastapi import APIRouter, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from mega_common import CommonSettings, call_service, create_app, internal_key_guard

from .extras import sse, simulate, transaction_stream
from .models import Registry


class Settings(CommonSettings):
    model_dir: str = "./.models"
    llm_service_url: str = "http://localhost:8002"


@lru_cache
def settings() -> Settings:
    return Settings()


registry = Registry(settings().model_dir)


@asynccontextmanager
async def lifespan(_):
    await run_in_threadpool(registry.load)
    yield


app = create_app("risk", health=lambda: {"models": list(registry.models)}, lifespan=lifespan)
router = APIRouter(dependencies=[internal_key_guard(settings)])


class ScoreIn(BaseModel):
    model: str = "fraud"
    features: dict[str, float]


def _model(name: str) -> str:
    if name not in registry.models:
        raise HTTPException(404, f"unknown model '{name}', have {list(registry.models)}")
    return name


@router.get("/models")
def models():
    return registry.list()


@router.post("/score")
def score(body: ScoreIn):
    return registry.score(_model(body.model), body.features)


@router.post("/explain")
async def explain(body: ScoreIn):
    """Score + plain-English reasons from the LLM gateway (service-to-service call)."""
    out = registry.score(_model(body.model), body.features)
    meta = registry.public_meta(body.model)
    top = [
        f"{c['label']} = {c['value']:g} ({'raises' if c['contribution'] > 0 else 'lowers'} risk, {c['contribution']:+.2f} log-odds)"
        for c in out["contributions"][:5]
    ]
    prompt = (
        f"Model: {meta['title']} ({meta['description']}). Predicted probability: {out['score']:.1%} ({out['band']} risk).\n"
        "Top SHAP drivers:\n- " + "\n- ".join(top) + "\n\n"
        "Write for a bank operations analyst who is not a data scientist: 2-3 short sentences explaining why, "
        "then one line starting with 'Next step:' recommending an action. Plain text, no markdown, no em dashes."
    )
    s = settings()
    try:
        r = await call_service(s.llm_service_url, "/complete", {"messages": [{"role": "user", "content": prompt}], "effort": "low"}, s.internal_api_key)
        out["summary"] = r["text"]
    except HTTPException as e:
        out["summary"] = None
        out["summary_error"] = e.detail
    return out


@router.post("/train")
async def train(file: UploadFile, target: str = Form(...), name: str = Form(...), title: str = Form(""), description: str = Form("")):
    df = pd.read_csv(io.BytesIO(await file.read()))
    if target not in df.columns:
        raise HTTPException(400, f"target '{target}' not in columns {list(df.columns)}")
    try:
        return await run_in_threadpool(registry.train, df, target, name, title or None, description)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


class CounterfactualIn(ScoreIn):
    target: float = 0.35


@router.post("/counterfactual")
def counterfactual(body: CounterfactualIn):
    """'What would have to change for this to be approved?' Up to 3 feature moves."""
    return registry.counterfactual(_model(body.model), body.features, body.target)


@router.get("/fairness")
def fairness(model: str, group_feature: str):
    meta = registry.models[_model(model)][1]
    if group_feature not in meta["features"]:
        raise HTTPException(400, f"group_feature must be one of {meta['features']}")
    return registry.fairness(model, group_feature)


@router.get("/synthesize")
def synthesize(model: str, n: int = Query(500, ge=1, le=100000)):
    """Synthetic rows as CSV: realistic demo data when you cannot use real customer data."""
    df = registry.synthesize(_model(model), n)
    return Response(df.to_csv(index=False), media_type="text/csv", headers={"content-disposition": f'attachment; filename="{model}-synthetic-{n}.csv"'})


@router.get("/stream")
async def stream(rate: float = Query(2.0, gt=0, le=20)):
    """Server-sent events: synthetic card transactions scored live by the fraud model."""
    return StreamingResponse(sse(transaction_stream(registry, rate)), media_type="text/event-stream")


class SimulateIn(BaseModel):
    initial: float = 100000
    monthly: float = 10000
    years: int = 15
    weights: dict[str, float] = {"equity": 0.6, "debt": 0.3, "gold": 0.1}
    goal: float | None = 5000000
    inflation: float = 0.05
    paths: int = 3000
    assumptions: dict[str, tuple[float, float]] | None = None


@router.post("/simulate")
def simulate_portfolio(body: SimulateIn):
    if not 1 <= body.years <= 50:
        raise HTTPException(400, "years must be 1 to 50")
    try:
        return simulate(body.initial, body.monthly, body.years, body.weights, body.goal, body.inflation, min(body.paths, 20000), body.assumptions)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


app.include_router(router)
