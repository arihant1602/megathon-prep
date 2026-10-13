"""Demo-mode record/replay for external provider calls (Claude, Bhashini).

DEMO_MODE=record  live calls, and every response is saved to CASSETTE_DIR
DEMO_MODE=replay  never calls providers: recorded answers only (venue Wi-Fi died? flip this)
DEMO_MODE=off     live calls (default)
In every mode, a failed live call falls back to a recording of the same request when one exists.
Cassettes are plain JSON files: commit them to ship a demo that works offline.
"""

import hashlib
import json
import logging
import os
from collections.abc import Awaitable, Callable
from pathlib import Path

log = logging.getLogger("mega.cassette")


class ReplayMiss(RuntimeError):
    pass


class Cassette:
    def __init__(self, name: str):
        self.name = name

    @property
    def mode(self) -> str:
        return os.getenv("DEMO_MODE", "off").lower()

    @property
    def dir(self) -> Path:
        return Path(os.getenv("CASSETTE_DIR", "../cassettes" if Path("../cassettes").exists() else "./cassettes")) / self.name

    def key(self, payload: dict) -> str:
        return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:24]

    def load(self, payload: dict):
        p = self.dir / f"{self.key(payload)}.json"
        return json.loads(p.read_text())["response"] if p.exists() else None

    def save(self, payload: dict, response) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)
        (self.dir / f"{self.key(payload)}.json").write_text(json.dumps({"request": payload, "response": response}, ensure_ascii=False, indent=1, default=str))

    async def run(self, payload: dict, live: Callable[[], Awaitable]):
        if self.mode == "replay":
            hit = self.load(payload)
            if hit is None:
                raise ReplayMiss(f"DEMO_MODE=replay and no recording for this {self.name} request")
            return hit
        try:
            out = await live()
        except Exception as e:
            hit = self.load(payload)
            if hit is not None:
                log.warning(f"{self.name} live call failed ({e}); served the recording")
                return hit
            raise
        if self.mode == "record":
            self.save(payload, out)
        return out
