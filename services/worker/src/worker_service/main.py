"""Background worker: pops jobs from the Redis queue and runs them.

Job kinds
  ingest_file  extract text (PDF per page, text files, images via the LLM vision endpoint) -> chunk -> store
  batch_score  score every row of an uploaded CSV with the risk service -> store the result CSV as a new file
Run several replicas to scale; each job is popped by exactly one worker.
"""

import asyncio
import base64
import csv
import io
import json
import signal
import time
import traceback
import uuid
from functools import lru_cache

from pypdf import PdfReader

from mega_common import QUEUE, CommonSettings, call_service, log, pg_pool, redis_client


class Settings(CommonSettings):
    llm_service_url: str = "http://localhost:8002"
    risk_service_url: str = "http://localhost:8001"


@lru_cache
def settings() -> Settings:
    return Settings()


def db():
    return pg_pool(settings().database_url)


def chunks_of(text: str, size: int = 1200, overlap: int = 200) -> list[str]:
    text = " ".join(text.split())
    out, i = [], 0
    while i < len(text):
        out.append(text[i:i + size])
        i += size - overlap
    return [c for c in out if c.strip()]


def set_job(r, job_id: str, **fields):
    r.hset(f"jobs:{job_id}", mapping={k: json.dumps(v) if k == "result" else v for k, v in fields.items()})


async def ingest_file(r, job_id: str, payload: dict, user: str):
    fid = payload["file_id"]
    with db().connection() as c:
        row = c.execute("select name, mime, data from file where id=%s", (fid,)).fetchone()
        c.execute("update file set status='processing', error=null where id=%s", (fid,))
    if not row:
        raise ValueError("file not found")
    name, mime, data = row
    pages: list[tuple[int | None, str]] = []
    if mime == "application/pdf":
        reader = PdfReader(io.BytesIO(bytes(data)))
        for i, p in enumerate(reader.pages):
            pages.append((i + 1, p.extract_text() or ""))
            set_job(r, job_id, progress=int(70 * (i + 1) / max(1, len(reader.pages))))
    elif mime.startswith("image/"):
        s = settings()
        out = await call_service(s.llm_service_url, "/vision", {"image_b64": base64.b64encode(bytes(data)).decode(), "media_type": mime},
                                 s.internal_api_key, user)
        pages.append((None, out["text"]))
    else:
        pages.append((None, bytes(data).decode("utf-8", errors="replace")))

    rows = [(fid, user, page, ch) for page, txt in pages for ch in chunks_of(txt)]
    with db().connection() as c:
        c.execute("delete from chunk where file_id=%s", (fid,))
        with c.cursor() as cur:
            cur.executemany("insert into chunk (file_id, user_id, page, content) values (%s,%s,%s,%s)", rows)
        status = "ready" if rows else "failed"
        c.execute("update file set status=%s, pages=%s, error=%s where id=%s",
                  (status, len(pages), None if rows else "no extractable text (scanned PDF? upload page images instead)", fid))
    return {"file_id": fid, "chunks": len(rows), "pages": len(pages)}


async def batch_score(r, job_id: str, payload: dict, user: str):
    s = settings()
    with db().connection() as c:
        row = c.execute("select name, data from file where id=%s", (payload["file_id"],)).fetchone()
    reader = list(csv.DictReader(io.StringIO(bytes(row[1]).decode())))
    out_rows = []
    for i, rec in enumerate(reader):
        feats = {k: float(v) for k, v in rec.items() if _num(v)}
        res = await call_service(s.risk_service_url, "/score", {"model": payload["model"], "features": feats}, s.internal_api_key, user)
        top = res["contributions"][0]
        out_rows.append({**rec, "score": res["score"], "band": res["band"], "top_reason": top["label"]})
        if i % 10 == 0:
            set_job(r, job_id, progress=int(100 * (i + 1) / max(1, len(reader))))
    buf = io.StringIO()
    if out_rows:
        w = csv.DictWriter(buf, fieldnames=list(out_rows[0].keys()))
        w.writeheader()
        w.writerows(out_rows)
    data = buf.getvalue().encode()
    fid = uuid.uuid4().hex
    with db().connection() as c:
        c.execute("insert into file (id, user_id, app, name, mime, size, data, status) values (%s,%s,'kestrel',%s,'text/csv',%s,%s,'ready')",
                  (fid, user, f"scored-{row[0]}", len(data), data))
    return {"file_id": fid, "rows": len(out_rows)}


def _num(v: str) -> bool:
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False


HANDLERS = {"ingest_file": ingest_file, "batch_score": batch_score}
running = True


async def main():
    r = redis_client(settings().redis_url)
    log.info("worker started", extra={"extra_fields": {"kinds": list(HANDLERS)}})
    while running:
        try:
            item = r.brpop(QUEUE, timeout=2)
        except Exception as e:  # redis restarting
            log.warning(f"queue unavailable: {e}")
            await asyncio.sleep(2)
            continue
        if not item:
            continue
        job_id = item[1]
        job = r.hgetall(f"jobs:{job_id}")
        kind, user = job.get("kind"), job.get("user") or None
        set_job(r, job_id, status="running", started=time.time())
        try:
            result = await HANDLERS[kind](r, job_id, json.loads(job["payload"]), user)
            set_job(r, job_id, status="done", progress=100, result=result, finished=time.time())
            log.info("job done", extra={"extra_fields": {"job": job_id, "kind": kind}})
        except Exception as e:
            traceback.print_exc()
            set_job(r, job_id, status="failed", error=str(e)[:500], finished=time.time())
            if kind == "ingest_file":
                with db().connection() as c:
                    c.execute("update file set status='failed', error=%s where id=%s", (str(e)[:500], json.loads(job["payload"])["file_id"]))


def run():
    def stop(*_):
        global running
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    asyncio.run(main())


if __name__ == "__main__":
    run()
