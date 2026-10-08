"""Bhashini (ULCA / Dhruva) pipeline client.

Flow: 1) POST getModelsPipeline with userID + ulcaApiKey -> serviceIds + callbackUrl + inference key
      2) POST callbackUrl with the inference key and the audio/text.
Tasks chain inside one call, e.g. ["asr", "translation", "tts"] (speech-to-speech).
Keys: https://bhashini.gov.in/ulca -> profile -> generate API key.
"""

import json
import logging

import httpx
import redis

CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
log = logging.getLogger(__name__)


class BhashiniError(RuntimeError):
    pass


class Bhashini:
    def __init__(self, user_id: str, api_key: str, pipeline_id: str, redis_url: str) -> None:
        self.user_id, self.api_key, self.pipeline_id = user_id, api_key, pipeline_id
        self.cache = redis.Redis.from_url(redis_url, decode_responses=True, socket_connect_timeout=2) if redis_url else None
        self._mem: dict[str, dict] = {}

    @property
    def configured(self) -> bool:
        return bool(self.user_id and self.api_key)

    def _cache_get(self, key: str) -> dict | None:
        if key in self._mem:
            return self._mem[key]
        try:
            if self.cache and (hit := self.cache.get(key)):
                return json.loads(hit)
        except redis.RedisError as e:
            log.warning("redis unavailable: %s", e)
        return None

    def _cache_set(self, key: str, value: dict) -> None:
        self._mem[key] = value
        try:
            if self.cache:
                self.cache.setex(key, 3600, json.dumps(value))
        except redis.RedisError:
            pass

    @staticmethod
    def _languages(tasks: list[str], src: str, tgt: str | None) -> list[dict]:
        # After a translation step, downstream tasks (tts) run in the target language.
        out, cur = [], src
        for t in tasks:
            lang = {"sourceLanguage": cur}
            if t == "translation":
                lang["targetLanguage"] = tgt
                cur = tgt
            out.append({"taskType": t, "config": {"language": lang}})
        return out

    async def _config(self, tasks: list[str], src: str, tgt: str | None) -> dict:
        if not self.configured:
            raise BhashiniError("Bhashini is not configured: set BHASHINI_USER_ID and BHASHINI_ULCA_API_KEY")
        key = f"bhashini:cfg:{'-'.join(tasks)}:{src}:{tgt}"
        if cfg := self._cache_get(key):
            return cfg
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                CONFIG_URL,
                headers={"userID": self.user_id, "ulcaApiKey": self.api_key},
                json={"pipelineTasks": self._languages(tasks, src, tgt), "pipelineRequestConfig": {"pipelineId": self.pipeline_id}},
            )
        if r.status_code >= 400:
            raise BhashiniError(f"Bhashini config {r.status_code}: {r.text[:300]}")
        cfg = r.json()
        self._cache_set(key, cfg)
        return cfg

    async def run(
        self, tasks: list[str], src: str, tgt: str | None = None, text: str | None = None, audio_b64: str | None = None,
        gender: str = "female", audio_format: str = "wav", sampling_rate: int = 16000,
    ) -> dict:
        cfg = await self._config(tasks, src, tgt)
        ep = cfg["pipelineInferenceAPIEndPoint"]
        service_ids = {p["taskType"]: p["config"][0]["serviceId"] for p in cfg["pipelineResponseConfig"]}
        pipeline = []
        for step in self._languages(tasks, src, tgt):
            t = step["taskType"]
            c = step["config"] | {"serviceId": service_ids[t]}
            if t == "asr":
                c |= {"audioFormat": audio_format, "samplingRate": sampling_rate}
            if t == "tts":
                c |= {"gender": gender, "samplingRate": 8000}
            pipeline.append({"taskType": t, "config": c})
        input_data = {"audio": [{"audioContent": audio_b64}]} if tasks[0] == "asr" else {"input": [{"source": text}]}
        async with httpx.AsyncClient(timeout=90) as c:
            r = await c.post(
                ep["callbackUrl"],
                headers={ep["inferenceApiKey"]["name"]: ep["inferenceApiKey"]["value"]},
                json={"pipelineTasks": pipeline, "inputData": input_data},
            )
        if r.status_code >= 400:
            raise BhashiniError(f"Bhashini inference {r.status_code}: {r.text[:300]}")
        return r.json()


def output_text(resp: dict, task: str) -> str:
    for p in resp.get("pipelineResponse", []):
        if p["taskType"] == task:
            o = p["output"][0]
            return o.get("target") or o.get("source", "")
    raise BhashiniError(f"no {task} output in Bhashini response")


def output_audio(resp: dict) -> str:
    for p in resp.get("pipelineResponse", []):
        if p["taskType"] == "tts":
            return p["audio"][0]["audioContent"]
    raise BhashiniError("no tts output in Bhashini response")
