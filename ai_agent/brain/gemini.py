"""Google Gemini 2.x multimodal brain (vision + audio + text) over plain REST.

No SDK required - just an API key. Supports image and raw-audio input, a system
persona, and short-term chat history.
"""
from __future__ import annotations

import logging
from typing import List, Optional, Tuple

import requests

from ai_agent.brain.base import Brain, ImagePart, BrainError
from ai_agent.config import Config

log = logging.getLogger("brain.gemini")

_TRANSCRIBE_PROMPT = (
    "Transcribe the spoken words in this audio clip exactly as they are said. "
    "Return only the transcript - no preamble, no quotes, no punctuation "
    "corrections. If no one speaks, return an empty string."
)


class GeminiBrain(Brain):
    provider_name = "gemini"

    def __init__(self, cfg: Config, persona: str) -> None:
        self.cfg = cfg
        self.persona = persona

    def _headers(self) -> dict:
        return {
            "x-goog-api-key": self.cfg.gemini_api_key,
            "Content-Type": "application/json",
        }

    def is_available(self) -> Tuple[bool, str]:
        if not self.cfg.gemini_api_key:
            return False, "no Gemini API key configured"
        try:
            url = f"{self.cfg.gemini_base_url}/models?pageSize=1"
            r = requests.get(url, headers=self._headers(), timeout=10)
            if r.status_code == 200:
                return True, f"connected (model={self.cfg.gemini_model})"
            return False, f"HTTP {r.status_code}: {r.text[:120]}"
        except Exception as exc:  # noqa: BLE001
            return False, str(exc)

    def respond(self, prompt: str,
                images: Optional[List[ImagePart]] = None,
                history: Optional[List[dict]] = None,
                audio_b64: Optional[str] = None,
                audio_mime: str = "audio/wav",
                max_tokens: int = 400) -> str:
        images = images or []
        parts: List[dict] = [{"text": self._annotate_images(prompt, images)}]
        for img in images:
            parts.append({"inline_data": {"mime_type": img.mime, "data": img.b64}})
        if audio_b64 and self.cfg.gemini_send_raw_audio:
            parts.append({"inline_data": {"mime_type": audio_mime, "data": audio_b64}})

        contents: List[dict] = []
        for h in (history or []):
            role = "model" if h.get("role") == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": h.get("text", "")}]})
        contents.append({"role": "user", "parts": parts})

        body = {
            "contents": contents,
            "systemInstruction": {"parts": [{"text": self.persona}]},
            "generationConfig": {"temperature": 0.7, "maxOutputTokens": max_tokens},
        }
        url = f"{self.cfg.gemini_base_url}/models/{self.cfg.gemini_model}:generateContent"
        return self._generate(url, body)

    def transcribe(self, audio_b64: str, audio_mime: str = "audio/wav") -> str:
        url = f"{self.cfg.gemini_base_url}/models/{self.cfg.gemini_stt_model}:generateContent"
        body = {
            "contents": [{"role": "user", "parts": [
                {"text": _TRANSCRIBE_PROMPT},
                {"inline_data": {"mime_type": audio_mime, "data": audio_b64}},
            ]}],
            "generationConfig": {"temperature": 0.0, "maxOutputTokens": 300},
        }
        return self._generate(url, body).strip()

    def _generate(self, url: str, body: dict) -> str:
        try:
            r = requests.post(url, headers=self._headers(), json=body,
                              timeout=self.cfg.brain_timeout_s)
        except requests.RequestException as exc:
            raise BrainError(f"Gemini request failed: {exc}") from exc
        if r.status_code != 200:
            snippet = r.text[:200]
            raise BrainError(f"Gemini HTTP {r.status_code}: {snippet}")
        data = r.json()
        candidates = data.get("candidates") or []
        if not candidates:
            block = data.get("promptFeedback", {}).get("blockReason", "no candidates")
            raise BrainError(f"Gemini returned no candidates ({block})")
        parts = (candidates[0].get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts).strip()
        if not text:
            raise BrainError("Gemini returned an empty reply")
        return text
