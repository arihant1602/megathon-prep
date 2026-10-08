import io
from contextlib import asynccontextmanager
from functools import lru_cache

import pandas as pd
from fastapi import APIRouter, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from mega_common import CommonSettings, call_service, create_app, internal_key_guard

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


app.include_router(router)
