"""Shared plumbing for the Python microservices: settings, internal auth, app factory with JSON logs and
request ids, service client, demo-mode cassette, Postgres pool and a Redis job queue."""

import contextvars
import hmac
import json
import logging
import time
import uuid
from collections.abc import Callable

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic_settings import BaseSettings, SettingsConfigDict

request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out = {"level": record.levelname.lower(), "logger": record.name, "msg": record.getMessage(), "request_id": request_id.get()}
        out.update(getattr(record, "extra_fields", {}))
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return json.dumps(out, default=str)


_handler = logging.StreamHandler()
_handler.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[_handler], force=True)
log = logging.getLogger("mega")


class CommonSettings(BaseSettings):
    # Repo-root .env when run locally from services/ (make dev); real env vars win in Docker/Railway.
    model_config = SettingsConfigDict(env_file=("../.env", "../../.env"), extra="ignore")

    # Shared secret between web apps and services. Empty disables the check (local hacking only).
    internal_api_key: str = ""
    database_url: str = "postgresql://megathon:megathon@localhost:5432/megathon"
    redis_url: str = "redis://localhost:6379/0"


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

    @app.middleware("http")
    async def access_log(req: Request, call_next):
        rid = req.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        token = request_id.set(rid)
        t0 = time.perf_counter()
        status = 500
        try:
            resp = await call_next(req)
            status = resp.status_code
            resp.headers["x-request-id"] = rid
            return resp
        finally:
            if req.url.path != "/health":
                log.info("request", extra={"extra_fields": {"service": title, "method": req.method, "path": req.url.path,
                                                            "status": status, "ms": round((time.perf_counter() - t0) * 1000, 1)}})
            request_id.reset(token)

    @app.get("/health")
    def _health():
        return {"ok": True, "service": title, **(health() if health else {})}

    return app


async def call_service(base_url: str, path: str, payload: dict, key: str, user: str | None = None, timeout: float = 120) -> dict:
    """Service-to-service JSON POST over the private network (forwards the request id)."""
    headers = {"x-internal-key": key, "x-request-id": request_id.get()}
    if user:
        headers["x-user-id"] = user
    async with httpx.AsyncClient(timeout=timeout) as c:
        r = await c.post(f"{base_url}{path}", json=payload, headers=headers)
    if r.status_code >= 400:
        raise HTTPException(502, f"{base_url}{path} -> {r.status_code}: {r.text[:300]}")
    return r.json()


# ---------------- Postgres ----------------
_pool = None


def pg_pool(url: str):
    """Lazy psycopg pool. Schema is owned by packages/platform (drizzle); run its migrations first."""
    global _pool
    if _pool is None:
        from psycopg_pool import ConnectionPool

        _pool = ConnectionPool(url, min_size=1, max_size=5, timeout=10, kwargs={"connect_timeout": 5}, open=False)
        _pool.open(wait=False)
    return _pool


# ---------------- Redis job queue ----------------
QUEUE = "jobs:queue"


def redis_client(url: str):
    import redis

    return redis.Redis.from_url(url, decode_responses=True, socket_connect_timeout=3)


def enqueue(r, kind: str, payload: dict, user: str | None = None) -> str:
    job_id = uuid.uuid4().hex
    r.hset(f"jobs:{job_id}", mapping={"id": job_id, "kind": kind, "status": "queued", "progress": 0, "user": user or "",
                                       "payload": json.dumps(payload), "created": time.time()})
    r.expire(f"jobs:{job_id}", 86400)
    r.lpush(QUEUE, job_id)
    return job_id


def job_status(r, job_id: str) -> dict | None:
    d = r.hgetall(f"jobs:{job_id}")
    if not d:
        return None
    d.pop("payload", None)
    if "result" in d:
        d["result"] = json.loads(d["result"])
    return d


from .cassette import Cassette  # noqa: E402


__all__ = ["CommonSettings", "Cassette", "call_service", "create_app", "enqueue", "internal_key_guard", "job_status",
           "QUEUE", "log", "pg_pool", "redis_client", "request_id", "user_id"]
