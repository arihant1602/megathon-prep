"""LLM gateway. Every app talks to Claude through here, so keys and model choice live in one place."""

import json
from functools import lru_cache

import anthropic
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from mega_common import CommonSettings, create_app, internal_key_guard


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


DEFAULT_SYSTEM = "You are a helpful assistant inside a product prototype. Be concise and concrete."


class ChatIn(BaseModel):
    messages: list[dict]
    system: str | None = None
    effort: str = "low"
    max_tokens: int = 16000


def params(body: ChatIn) -> dict:
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
    )


def configured() -> bool:
    try:
        client()
        return True
    except Exception:
        return False


app = create_app("llm", health=lambda: {"model": settings().anthropic_model})
router = APIRouter(dependencies=[internal_key_guard(settings)])


@router.post("/chat")
async def chat(body: ChatIn):
    """Server-sent events: data: {"text": "..."} ... data: [DONE]"""

    async def events():
        try:
            async with client().beta.messages.stream(**params(body)) as stream:
                async for text in stream.text_stream:
                    yield f"data: {json.dumps({'text': text})}\n\n"
        except anthropic.APIError as e:
            yield f"data: {json.dumps({'error': f'{type(e).__name__}: {e}'})}\n\n"
        except TypeError as e:  # raised by the SDK when no credentials are configured
            yield f"data: {json.dumps({'error': f'LLM not configured: set ANTHROPIC_API_KEY ({e})'})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")


@router.post("/complete")
async def complete(body: ChatIn):
    try:
        async with client().beta.messages.stream(**params(body)) as stream:
            msg = await stream.get_final_message()
    except TypeError as e:
        raise HTTPException(503, f"LLM not configured: set ANTHROPIC_API_KEY ({e})") from e
    except anthropic.APIError as e:
        raise HTTPException(502, f"{type(e).__name__}: {e}") from e
    if msg.stop_reason == "refusal":
        return {"text": "The model declined this request.", "refused": True}
    return {"text": "".join(b.text for b in msg.content if b.type == "text"), "refused": False}


app.include_router(router)
