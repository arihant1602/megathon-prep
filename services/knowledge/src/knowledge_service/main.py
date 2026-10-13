"""Knowledge service: file uploads, background ingestion, full-text retrieval and cited answers.

Bytes are stored in Postgres (file.data) so the worker can read them without a shared disk.
Ingestion (PDF/text -> page chunks) runs on the worker through the Redis job queue.
"""

import uuid
from functools import lru_cache

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel

from mega_common import CommonSettings, call_service, create_app, enqueue, internal_key_guard, job_status, pg_pool, redis_client, user_id

MAX_BYTES = 25 * 1024 * 1024
INGESTIBLE = ("application/pdf", "text/", "application/json", "image/")


class Settings(CommonSettings):
    llm_service_url: str = "http://localhost:8002"


@lru_cache
def settings() -> Settings:
    return Settings()


def db():
    return pg_pool(settings().database_url)


@lru_cache
def rds():
    return redis_client(settings().redis_url)


def require_user(uid: str | None = Depends(user_id)) -> str:
    if not uid:
        raise HTTPException(401, "x-user-id required")
    return uid


app = create_app("knowledge")
router = APIRouter(dependencies=[internal_key_guard(settings)])


@router.post("/files", status_code=201)
async def upload(file: UploadFile = File(...), app: str = Form("shared"), ingest: bool = Form(True), uid: str = Depends(require_user)):
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "file larger than 25 MB")
    mime = file.content_type or "application/octet-stream"
    fid = uuid.uuid4().hex
    with db().connection() as c:
        c.execute(
            "insert into file (id, user_id, app, name, mime, size, data, status) values (%s,%s,%s,%s,%s,%s,%s,'uploaded')",
            (fid, uid, app, file.filename or "upload", mime, len(data), data),
        )
    job = None
    if ingest and mime.startswith(INGESTIBLE):
        job = enqueue(rds(), "ingest_file", {"file_id": fid}, uid)
    return {"id": fid, "name": file.filename, "mime": mime, "size": len(data), "job_id": job}


@router.get("/files")
def list_files(app: str | None = None, uid: str = Depends(require_user)):
    q = "select id, app, name, mime, size, status, error, pages, created_at from file where user_id=%s"
    args: list = [uid]
    if app:
        q += " and app=%s"
        args.append(app)
    with db().connection() as c:
        rows = c.execute(q + " order by created_at desc limit 200", args).fetchall()
    keys = ["id", "app", "name", "mime", "size", "status", "error", "pages", "created_at"]
    return [dict(zip(keys, r)) for r in rows]


@router.get("/files/{fid}")
def download(fid: str, uid: str = Depends(require_user)):
    with db().connection() as c:
        row = c.execute("select name, mime, data from file where id=%s and user_id=%s", (fid, uid)).fetchone()
    if not row:
        raise HTTPException(404, "file not found")
    name, mime, data = row
    return Response(bytes(data), media_type=mime, headers={"content-disposition": f'inline; filename="{name}"'})


@router.delete("/files/{fid}")
def delete(fid: str, uid: str = Depends(require_user)):
    with db().connection() as c:
        n = c.execute("delete from file where id=%s and user_id=%s", (fid, uid)).rowcount
    if not n:
        raise HTTPException(404, "file not found")
    return {"ok": True}


@router.get("/jobs/{job_id}")
def job(job_id: str, uid: str = Depends(require_user)):
    st = job_status(rds(), job_id)
    if not st or st.get("user") not in ("", uid):
        raise HTTPException(404, "job not found")
    return st


class SearchIn(BaseModel):
    q: str
    limit: int = 8
    file_ids: list[str] | None = None


def search_chunks(uid: str, q: str, limit: int, file_ids: list[str] | None) -> list[dict]:
    where, args = "c.user_id=%s", [uid]
    if file_ids:
        where += " and c.file_id = any(%s)"
        args.append(file_ids)
    with db().connection() as c:
        rows = c.execute(
            f"""select c.id, c.file_id, f.name, c.page, c.content, ts_rank(c.tsv, websearch_to_tsquery('simple', %s)) as rank
                from chunk c join file f on f.id = c.file_id
                where {where} and c.tsv @@ websearch_to_tsquery('simple', %s)
                order by rank desc limit %s""",
            [q, *args, q, limit],
        ).fetchall()
        if not rows:  # no exact term hits: fall back to any-word OR match
            words = [w for w in q.replace("?", " ").split() if len(w) > 2]
            if words:
                rows = c.execute(
                    f"""select c.id, c.file_id, f.name, c.page, c.content, ts_rank(c.tsv, to_tsquery('simple', %s)) as rank
                        from chunk c join file f on f.id = c.file_id
                        where {where} and c.tsv @@ to_tsquery('simple', %s) order by rank desc limit %s""",
                    [" | ".join(words), *args, " | ".join(words), limit],
                ).fetchall()
    return [{"chunk_id": r[0], "file_id": r[1], "file": r[2], "page": r[3], "text": r[4], "rank": float(r[5])} for r in rows]


@router.post("/search")
def search(body: SearchIn, uid: str = Depends(require_user)):
    return search_chunks(uid, body.q, body.limit, body.file_ids)


class AskIn(BaseModel):
    question: str
    file_ids: list[str] | None = None


@router.post("/ask")
async def ask(body: AskIn, uid: str = Depends(require_user)):
    hits = search_chunks(uid, body.question, 6, body.file_ids)
    if not hits:
        return {"text": "I could not find anything about that in your documents.", "segments": [], "sources": []}
    docs = [{"title": f"{h['file']}" + (f" (page {h['page']})" if h["page"] else ""), "text": h["text"]} for h in hits]
    s = settings()
    out = await call_service(s.llm_service_url, "/cite", {"question": body.question, "documents": docs}, s.internal_api_key, uid)
    return {**out, "sources": [{"file_id": h["file_id"], "file": h["file"], "page": h["page"]} for h in hits]}


app.include_router(router)
