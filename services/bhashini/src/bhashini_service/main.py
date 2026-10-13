from functools import lru_cache

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from mega_common import Cassette, CommonSettings, call_service, create_app, internal_key_guard
from mega_common.cassette import ReplayMiss

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

cassette = Cassette("bhashini")
app = create_app("bhashini", health=lambda: {"configured": bhashini().configured, "demo_mode": cassette.mode})
router = APIRouter(dependencies=[internal_key_guard(settings)])


async def run(**kw) -> dict:
    try:
        # Demo mode: recorded Bhashini responses are replayed when live calls fail (or always, in replay mode).
        return await cassette.run({k: v for k, v in kw.items()}, lambda: bhashini().run(**kw))
    except (BhashiniError, ReplayMiss) as e:
        raise HTTPException(502 if bhashini().configured else 503, str(e)) from e


async def llm(messages: list[dict], system: str) -> str:
    s = settings()
    out = await call_service(s.llm_service_url, "/complete", {"messages": messages, "system": system, "effort": "low"}, s.internal_api_key)
    return out["text"]


async def llm_translate(text: str, source: str, target: str) -> str:
    """Fallback when Bhashini is not configured: the LLM translates (good for demos, not a Bhashini replacement)."""
    return await llm([{"role": "user", "content": text}],
                     f"Translate the user's text from {LANGUAGES.get(source, source)} to {LANGUAGES.get(target, target)}. "
                     "Reply with the translation only, in the target language's native script.")


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
    if not bhashini().configured and cassette.mode != "replay":
        return {"text": await llm_translate(body.text, body.source, body.target), "engine": "llm-fallback"}
    r = await run(tasks=["translation"], src=body.source, tgt=body.target, text=body.text)
    return {"text": output_text(r, "translation"), "engine": "bhashini"}


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
        if lang != "en" and not bhashini().configured and cassette.mode != "replay":
            # No Bhashini keys: the LLM reads and answers in the user's language directly; the browser speaks it.
            system = DOMAINS[body.domain] + f" Reply in {LANGUAGES.get(lang, lang)} using its native script, in at most 4 short sentences, plain text."
            answer = await llm([*body.history, {"role": "user", "content": native}], system)
            return {"question": {"native": native, "english": native}, "answer": {"native": answer, "english": answer},
                    "audio_b64": None, "engine": "llm-fallback"}
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


class SpeechTranslateIn(BaseModel):
    audio_b64: str
    source: str
    target: str
    speak: bool = True


@router.post("/speech-translate")
async def speech_translate(body: SpeechTranslateIn):
    """One side of a two-person conversation: speech in one language -> text + speech in the other."""
    tasks = ["asr", "translation"] + (["tts"] if body.speak else [])
    r = await run(tasks=tasks, src=body.source, tgt=body.target, audio_b64=body.audio_b64)
    return {"heard": output_text(r, "asr"), "translated": output_text(r, "translation"),
            "audio_b64": output_audio(r) if body.speak else None}


class ReadImageIn(BaseModel):
    image_b64: str
    media_type: str = "image/jpeg"
    language: str = "hi"
    speak: bool = True


@router.post("/read-image")
async def read_image(body: ReadImageIn):
    """Photo of a form, notice or medicine label -> text + plain explanation -> user's language -> speech."""
    s = settings()
    prompt = ("Read this image. First give the important text it contains (short), then explain in 2 to 3 simple sentences "
              "what it means for an ordinary person and what they should do. Plain text, no markdown.")
    seen = await call_service(s.llm_service_url, "/vision", {"image_b64": body.image_b64, "media_type": body.media_type, "prompt": prompt},
                              s.internal_api_key)
    english = seen["text"]
    if body.language == "en":
        audio = output_audio(await run(tasks=["tts"], src="en", text=english)) if body.speak and bhashini().configured else None
        return {"english": english, "native": english, "audio_b64": audio}
    if not bhashini().configured and cassette.mode != "replay":
        return {"english": english, "native": await llm_translate(english, "en", body.language), "audio_b64": None, "engine": "llm-fallback"}
    steps = ["translation", "tts"] if body.speak else ["translation"]
    r = await run(tasks=steps, src="en", tgt=body.language, text=english)
    return {"english": english, "native": output_text(r, "translation"), "audio_b64": output_audio(r) if body.speak else None}


app.include_router(router)
