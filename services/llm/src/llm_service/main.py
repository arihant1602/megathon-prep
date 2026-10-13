"""LLM gateway. Every app talks to Claude through here, so keys, model choice and demo mode live in one place.

/chat      streaming chat (SSE)
/complete  one answer
/cite      answer grounded in documents, with citations (used by the knowledge service)
/vision    read or describe an image (OCR for Boli's "read it to me")
/agent     tool-using agent: tools are HTTP endpoints the calling app exposes; this service runs the loop
"""

import asyncio
import json
from functools import lru_cache

import anthropic
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from mega_common import Cassette, CommonSettings, create_app, internal_key_guard, log, request_id
from mega_common.cassette import ReplayMiss


class Settings(CommonSettings):
    anthropic_model: str = "claude-opus-5-5"


@lru_cache
def settings() -> Settings:
    return Settings()


_client: anthropic.AsyncAnthropic | None = None


def client() -> anthropic.AsyncAnthropic:
    # Resolves ANTHROPIC_API_KEY (or an `ant auth login` profile) from the environment.
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic()
    return _client


cassette = Cassette("llm")
DEFAULT_SYSTEM = "You are a helpful assistant inside a product prototype. Be concise and concrete."


class ChatIn(BaseModel):
    messages: list[dict]
    system: str | None = None
    effort: str = "low"
    max_tokens: int = 16000


def params(body: ChatIn, **extra) -> dict:
    return dict(
        model=settings().anthropic_model,
        max_tokens=body.max_tokens,
        system=body.system or DEFAULT_SYSTEM,
        messages=body.messages,
        thinking={"type": "adaptive"},
        output_config={"effort": body.effort},
        # Re-run a safety-classifier refusal on Anthropic's recommended fallback model.
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        **extra,
    )


def provider_error(e: Exception) -> HTTPException:
    if isinstance(e, ReplayMiss):
        return HTTPException(503, str(e))
    if isinstance(e, TypeError):  # raised by the SDK when no credentials are configured
        return HTTPException(503, f"LLM not configured: set ANTHROPIC_API_KEY ({e})")
    if isinstance(e, anthropic.APIError):
        return HTTPException(502, f"{type(e).__name__}: {e}")
    return HTTPException(500, f"{type(e).__name__}: {e}")


async def final_message(p: dict):
    async with client().beta.messages.stream(**p) as stream:
        return await stream.get_final_message()


def text_of(msg) -> str:
    return "".join(b.text for b in msg.content if b.type == "text")


app = create_app("llm", health=lambda: {"model": settings().anthropic_model, "demo_mode": cassette.mode})
router = APIRouter(dependencies=[internal_key_guard(settings)])


@router.post("/chat")
async def chat(body: ChatIn):
    """Server-sent events: data: {"text": "..."} ... data: [DONE]. Recorded as a whole answer; replay re-streams it."""
    key = {"kind": "chat", **body.model_dump()}

    async def events():
        try:
            if cassette.mode == "replay":
                text = cassette.load(key)
                if text is None:
                    raise ReplayMiss("DEMO_MODE=replay and no recording for this chat")
                for i in range(0, len(text), 24):
                    yield f"data: {json.dumps({'text': text[i:i + 24]})}\n\n"
                    await asyncio.sleep(0.02)
            else:
                parts: list[str] = []
                try:
                    async with client().beta.messages.stream(**params(body)) as stream:
                        async for t in stream.text_stream:
                            parts.append(t)
                            yield f"data: {json.dumps({'text': t})}\n\n"
                    if cassette.mode == "record":
                        cassette.save(key, "".join(parts))
                except Exception:
                    hit = cassette.load(key)
                    if hit is None or parts:
                        raise
                    yield f"data: {json.dumps({'text': hit})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': provider_error(e).detail})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")


@router.post("/complete")
async def complete(body: ChatIn):
    async def live():
        msg = await final_message(params(body))
        if msg.stop_reason == "refusal":
            return {"text": "The model declined this request.", "refused": True}
        return {"text": text_of(msg), "refused": False}

    try:
        return await cassette.run({"kind": "complete", **body.model_dump()}, live)
    except Exception as e:
        raise provider_error(e) from e


class CiteIn(BaseModel):
    question: str
    documents: list[dict] = Field(description="[{title, text}] passages to answer from")
    system: str | None = None


@router.post("/cite")
async def cite(body: CiteIn):
    """Answer only from the given passages; returns text segments with their citations."""
    content = [
        {"type": "document", "source": {"type": "text", "media_type": "text/plain", "data": d["text"]},
         "title": d.get("title", f"Source {i + 1}"), "citations": {"enabled": True}}
        for i, d in enumerate(body.documents)
    ]
    content.append({"type": "text", "text": body.question})
    req = ChatIn(
        messages=[{"role": "user", "content": content}],
        system=body.system or "Answer only from the provided documents. If they do not contain the answer, say so plainly.",
    )

    async def live():
        msg = await final_message(params(req))
        segments = []
        for b in msg.content:
            if b.type != "text":
                continue
            cites = [{"document_index": c.document_index, "document_title": c.document_title, "cited_text": c.cited_text}
                     for c in (getattr(b, "citations", None) or [])]
            segments.append({"text": b.text, "citations": cites})
        return {"segments": segments, "text": "".join(s["text"] for s in segments)}

    try:
        return await cassette.run({"kind": "cite", **body.model_dump()}, live)
    except Exception as e:
        raise provider_error(e) from e


class VisionIn(BaseModel):
    image_b64: str
    media_type: str = "image/jpeg"
    prompt: str = "Transcribe all text in this image exactly. Then add one line starting 'Summary:' explaining what it is."


@router.post("/vision")
async def vision(body: VisionIn):
    req = ChatIn(messages=[{"role": "user", "content": [
        {"type": "image", "source": {"type": "base64", "media_type": body.media_type, "data": body.image_b64}},
        {"type": "text", "text": body.prompt},
    ]}])

    async def live():
        return {"text": text_of(await final_message(params(req)))}

    try:
        return await cassette.run({"kind": "vision", **body.model_dump()}, live)
    except Exception as e:
        raise provider_error(e) from e


class AgentTool(BaseModel):
    name: str
    description: str
    input_schema: dict
    url: str  # the calling app's endpoint that executes this tool


class AgentIn(BaseModel):
    messages: list[dict]
    system: str | None = None
    tools: list[AgentTool]
    user_id: str | None = None
    max_steps: int = 8
    effort: str = "medium"


@router.post("/agent")
async def agent(body: AgentIn):
    """Manual tool loop. Each tool call is POSTed to its app URL with the internal key and the user id,
    so tools run with the app's own auth and data rules. Returns the answer plus a trace of every step."""
    s = settings()
    tool_defs = [{"name": t.name, "description": t.description, "input_schema": t.input_schema} for t in body.tools]
    urls = {t.name: t.url for t in body.tools}

    async def run_tool(name: str, args: dict) -> tuple[str, bool]:
        if name not in urls:
            return f"unknown tool {name}", True
        headers = {"x-internal-key": s.internal_api_key, "x-user-id": body.user_id or "", "x-request-id": request_id.get()}
        try:
            async with httpx.AsyncClient(timeout=60) as c:
                r = await c.post(urls[name], json=args, headers=headers)
            return r.text[:20000], r.status_code >= 400
        except httpx.HTTPError as e:
            return f"tool endpoint unreachable: {e}", True

    async def live():
        messages = list(body.messages)
        steps = []
        for _ in range(body.max_steps):
            msg = await final_message(params(ChatIn(messages=messages, system=body.system, effort=body.effort), tools=tool_defs))
            if msg.stop_reason == "refusal":
                return {"text": "The model declined this request.", "steps": steps}
            calls = [b for b in msg.content if b.type == "tool_use"]
            if not calls:
                return {"text": text_of(msg), "steps": steps}
            messages.append({"role": "assistant", "content": msg.content})
            # Parallel tool calls: run together, return every result in ONE user message.
            outputs = await asyncio.gather(*(run_tool(c.name, c.input) for c in calls))
            results = []
            for c, (out, is_err) in zip(calls, outputs):
                steps.append({"tool": c.name, "input": c.input, "output": out[:2000], "error": is_err})
                results.append({"type": "tool_result", "tool_use_id": c.id, "content": out, "is_error": is_err})
            messages.append({"role": "user", "content": results})
        return {"text": "Stopped after the maximum number of steps.", "steps": steps}

    try:
        return await cassette.run({"kind": "agent", **body.model_dump()}, live)
    except Exception as e:
        log.exception("agent failed")
        raise provider_error(e) from e


app.include_router(router)
