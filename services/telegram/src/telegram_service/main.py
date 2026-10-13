"""Telegram bot for Boli: works on any phone, no app install.

Text or a voice note in -> bhashini /assist (speech -> English -> LLM -> your language -> speech) -> text + voice reply.
Commands: /start, /lang hi|te|ta|..., /topic agriculture|healthcare|banking|tourism, /reset
Long polling: no public URL or webhook needed. Needs TELEGRAM_BOT_TOKEN (from @BotFather) and ffmpeg for voice.
"""

import asyncio
import base64
import json
import shutil
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path

import httpx

from mega_common import CommonSettings, call_service, log, redis_client

LANGS = {"hi", "te", "ta", "kn", "ml", "mr", "bn", "gu", "pa", "or", "as", "ur", "en"}
DOMAINS = {"agriculture", "healthcare", "banking", "tourism"}
HELP = (
    "Namaste! Ask me anything by text or voice note.\n"
    "/lang hi  (te, ta, kn, ml, mr, bn, gu, pa, or, as, ur, en)\n"
    "/topic agriculture  (healthcare, banking, tourism)\n"
    "/reset  start a new conversation"
)


class Settings(CommonSettings):
    telegram_bot_token: str = ""
    bhashini_service_url: str = "http://localhost:8003"


@lru_cache
def settings() -> Settings:
    return Settings()


class Bot:
    def __init__(self, token: str):
        self.api = f"https://api.telegram.org/bot{token}"
        self.files = f"https://api.telegram.org/file/bot{token}"
        self.http = httpx.AsyncClient(timeout=70)
        self.r = redis_client(settings().redis_url)
        self.ffmpeg = shutil.which("ffmpeg")

    async def call(self, method: str, **kw):
        r = await self.http.post(f"{self.api}/{method}", **kw)
        data = r.json()
        if not data.get("ok"):
            raise RuntimeError(f"telegram {method}: {data}")
        return data["result"]

    def state(self, chat: int) -> dict:
        raw = self.r.get(f"tg:{chat}")
        return json.loads(raw) if raw else {"lang": "hi", "domain": "agriculture", "history": []}

    def save(self, chat: int, st: dict):
        st["history"] = st["history"][-12:]
        self.r.set(f"tg:{chat}", json.dumps(st), ex=7 * 86400)

    def convert(self, src: bytes, args: list[str], suffix: str) -> bytes:
        with tempfile.TemporaryDirectory() as d:
            i, o = Path(d) / "in", Path(d) / f"out{suffix}"
            i.write_bytes(src)
            subprocess.run([self.ffmpeg, "-y", "-loglevel", "error", "-i", str(i), *args, str(o)], check=True)
            return o.read_bytes()

    async def handle(self, msg: dict):
        chat = msg["chat"]["id"]
        st = self.state(chat)
        text = (msg.get("text") or "").strip()
        if text.startswith("/"):
            cmd, _, arg = text.partition(" ")
            if cmd == "/lang" and arg in LANGS:
                st["lang"], st["history"] = arg, []
                reply = f"Language set to {arg}."
            elif cmd == "/topic" and arg in DOMAINS:
                st["domain"], st["history"] = arg, []
                reply = f"Topic set to {arg}."
            elif cmd == "/reset":
                st["history"] = []
                reply = "New conversation started."
            else:
                reply = HELP
            self.save(chat, st)
            await self.call("sendMessage", json={"chat_id": chat, "text": reply})
            return

        payload = {"language": st["lang"], "domain": st["domain"], "history": st["history"], "speak": True}
        if "voice" in msg:
            if not self.ffmpeg:
                await self.call("sendMessage", json={"chat_id": chat, "text": "Voice notes need ffmpeg on the server. Please type instead."})
                return
            f = await self.call("getFile", json={"file_id": msg["voice"]["file_id"]})
            ogg = (await self.http.get(f"{self.files}/{f['file_path']}")).content
            wav = self.convert(ogg, ["-ac", "1", "-ar", "16000"], ".wav")
            payload["audio_b64"] = base64.b64encode(wav).decode()
        elif text:
            payload["text"] = text
        else:
            return

        await self.call("sendChatAction", json={"chat_id": chat, "action": "typing"})
        s = settings()
        try:
            out = await call_service(s.bhashini_service_url, "/assist", payload, s.internal_api_key, f"telegram:{chat}")
        except Exception as e:
            await self.call("sendMessage", json={"chat_id": chat, "text": f"Sorry, something went wrong: {str(e)[:200]}"})
            return
        st["history"] += [{"role": "user", "content": out["question"]["english"]}, {"role": "assistant", "content": out["answer"]["english"]}]
        self.save(chat, st)
        await self.call("sendMessage", json={"chat_id": chat, "text": out["answer"]["native"]})
        if out.get("audio_b64") and self.ffmpeg:
            opus = self.convert(base64.b64decode(out["audio_b64"]), ["-c:a", "libopus", "-b:a", "32k"], ".ogg")
            await self.call("sendVoice", data={"chat_id": chat}, files={"voice": ("answer.ogg", opus, "audio/ogg")})

    async def run(self):
        me = await self.call("getMe")
        log.info(f"telegram bot @{me['username']} polling")
        offset = 0
        while True:
            try:
                updates = await self.call("getUpdates", json={"offset": offset, "timeout": 50, "allowed_updates": ["message"]})
            except Exception as e:
                log.warning(f"getUpdates failed: {e}")
                await asyncio.sleep(3)
                continue
            for u in updates:
                offset = u["update_id"] + 1
                if "message" in u:
                    asyncio.create_task(self.safe(u["message"]))

    async def safe(self, msg: dict):
        try:
            await self.handle(msg)
        except Exception:
            log.exception("handler failed")


def run():
    token = settings().telegram_bot_token
    if not token:
        log.warning("TELEGRAM_BOT_TOKEN not set; telegram bot idle (talk to @BotFather to create one)")
        while True:  # stay up so the platform does not crash-loop
            asyncio.run(asyncio.sleep(3600))
    asyncio.run(Bot(token).run())


if __name__ == "__main__":
    run()
