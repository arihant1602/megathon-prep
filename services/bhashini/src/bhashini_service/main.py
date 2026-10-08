from functools import lru_cache

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from mega_common import CommonSettings, call_service, create_app, internal_key_guard

from .client import Bhashini, BhashiniError, output_audio, output_text


class Settings(CommonSettings):
    bhashini_user_id: str = ""
    bhashini_ulca_api_key: str = ""
    bhashini_pipeline_id: str = "64392f96daac500b55c543cd"
    redis_url: str = "redis://localhost:6379/0"
    llm_service_url: str = "http://localhost:8002"


@lru_cache
def settings() -> Settings:
    return Settings()


@lru_cache
def bhashini() -> Bhashini:
    s = settings()
    return Bhashini(s.bhashini_user_id, s.bhashini_ulca_api_key, s.bhashini_pipeline_id, s.redis_url)


LANGUAGES = {
    "hi": "Hindi", "te": "Telugu", "ta": "Tamil", "kn": "Kannada", "ml": "Malayalam", "mr": "Marathi",
    "bn": "Bengali", "gu": "Gujarati", "pa": "Punjabi", "or": "Odia", "as": "Assamese", "ur": "Urdu", "en": "English",
}

DOMAINS = {
    "agriculture": "You advise small farmers in India on crops, pests, weather, soil, mandi prices and government schemes such as PM-KISAN.",
    "healthcare": "You help patients in India understand symptoms, medicines, appointments and schemes such as Ayushman Bharat. You never diagnose; you tell people when to see a doctor or call 108.",
    "banking": "You help people in India with basic banking: UPI, account opening, KYC, loans, and avoiding fraud. Never ask for OTPs, PINs or passwords.",
    "tourism": "You help travellers in India with directions, local customs, food, safety and booking tips.",
}

app = create_app("bhashini", health=lambda: {"configured": bhashini().configured})
router = APIRouter(dependencies=[internal_key_guard(settings)])


async def run(**kw) -> dict:
    try:
        return await bhashini().run(**kw)
    except BhashiniError as e:
        raise HTTPException(502 if bhashini().configured else 503, str(e)) from e


class TranslateIn(BaseModel):
    text: str
    source: str
    target: str


class TtsIn(BaseModel):
    text: str
    language: str
    gender: str = "female"


class AsrIn(BaseModel):
    audio_b64: str
    language: str
    audio_format: str = "wav"
    sampling_rate: int = 16000


class AssistIn(BaseModel):
    language: str
    domain: str = "agriculture"
    text: str | None = None  # typed question, or
    audio_b64: str | None = None  # spoken question (wav, 16 kHz mono)
    history: list[dict] = []  # prior turns in English: [{"role": "user"|"assistant", "content": "..."}]
    speak: bool = True


@router.get("/languages")
def languages():
    return {"languages": LANGUAGES, "domains": list(DOMAINS), "configured": bhashini().configured}


@router.post("/translate")
async def translate(body: TranslateIn):
    if body.source == body.target:
        return {"text": body.text}
    r = await run(tasks=["translation"], src=body.source, tgt=body.target, text=body.text)
    return {"text": output_text(r, "translation")}


@router.post("/tts")
async def tts(body: TtsIn):
    r = await run(tasks=["tts"], src=body.language, text=body.text, gender=body.gender)
    return {"audio_b64": output_audio(r), "format": "wav"}


@router.post("/asr")
async def asr(body: AsrIn):
    r = await run(tasks=["asr"], src=body.language, audio_b64=body.audio_b64, audio_format=body.audio_format, sampling_rate=body.sampling_rate)
    return {"text": output_text(r, "asr")}


@router.post("/assist")
async def assist(body: AssistIn):
    """Native speech/text -> English -> LLM gateway -> native text -> speech. Microservice chain."""
    if body.domain not in DOMAINS:
        raise HTTPException(400, f"domain must be one of {list(DOMAINS)}")
    lang = body.language
    if body.audio_b64:
        steps = ["asr", "translation"] if lang != "en" else ["asr"]
        r = await run(tasks=steps, src=lang, tgt="en", audio_b64=body.audio_b64)
        native = output_text(r, "asr")
        english = output_text(r, "translation") if lang != "en" else native
    elif body.text:
        native = body.text
        english = native if lang == "en" else output_text(await run(tasks=["translation"], src=lang, tgt="en", text=native), "translation")
    else:
        raise HTTPException(400, "send text or audio_b64")

    s = settings()
    system = (
        DOMAINS[body.domain]
        + f" The user speaks {LANGUAGES.get(lang, lang)}; your answer will be machine-translated, so use short, simple sentences."
        " Answer in at most 4 sentences, plain text, no lists, no markdown."
    )
    llm = await call_service(
        s.llm_service_url, "/complete",
        {"messages": [*body.history, {"role": "user", "content": english}], "system": system, "effort": "low"},
        s.internal_api_key,
    )
    answer_en = llm["text"]
    answer_native = answer_en
    audio = None
    if lang != "en":
        steps = ["translation", "tts"] if body.speak else ["translation"]
        r = await run(tasks=steps, src="en", tgt=lang, text=answer_en)
        answer_native = output_text(r, "translation")
        audio = output_audio(r) if body.speak else None
    elif body.speak:
        audio = output_audio(await run(tasks=["tts"], src="en", text=answer_en))
    return {
        "question": {"native": native, "english": english},
        "answer": {"native": answer_native, "english": answer_en},
        "audio_b64": audio,
    }


app.include_router(router)
