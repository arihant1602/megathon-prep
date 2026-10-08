"""Shared plumbing for the Python microservices: settings, internal auth, app factory, service client."""

import hmac
import logging
from collections.abc import Callable

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic_settings import BaseSettings, SettingsConfigDict

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


class CommonSettings(BaseSettings):
    # Repo-root .env when run locally from services/ (make dev); real env vars win in Docker/Railway.
    model_config = SettingsConfigDict(env_file=("../.env", "../../.env"), extra="ignore")

    # Shared secret between web apps and services. Empty disables the check (local hacking only).
    internal_api_key: str = ""


def internal_key_guard(settings: Callable[[], CommonSettings]):
    def guard(x_internal_key: str = Header(default="")) -> None:
        key = settings().internal_api_key
        if key and not hmac.compare_digest(x_internal_key, key):
            raise HTTPException(status_code=401, detail="bad internal key")

    return Depends(guard)


def user_id(x_user_id: str | None = Header(default=None)) -> str | None:
    return x_user_id


def create_app(title: str, health: Callable[[], dict] | None = None, **kw) -> FastAPI:
    app = FastAPI(title=title, **kw)

    @app.get("/health")
    def _health():
        return {"ok": True, "service": title, **(health() if health else {})}

    return app


async def call_service(base_url: str, path: str, payload: dict, key: str, user: str | None = None, timeout: float = 120) -> dict:
    """Service-to-service JSON POST over the private network."""
    headers = {"x-internal-key": key}
    if user:
        headers["x-user-id"] = user
    async with httpx.AsyncClient(timeout=timeout) as c:
        r = await c.post(f"{base_url}{path}", json=payload, headers=headers)
    if r.status_code >= 400:
        raise HTTPException(502, f"{base_url}{path} -> {r.status_code}: {r.text[:300]}")
    return r.json()
