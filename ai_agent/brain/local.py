"""Local brain backed by an Ollama vision model (e.g. llava).

Runs on the user's machine at OLLAMA_URL (default http://127.0.0.1:11434).
Fully offline once the model is pulled. Sends the latest frame(s) as base64
JPEGs so the model can actually *see* the camera / screen.
"""
from __future__ import annotations

import logging
from typing import List, Optional, Tuple

import requests

from ai_agent.brain.base import Brain, ImagePart, BrainError
from ai_agent.config import Config

log = logging.getLogger("brain.ollama")


class OllamaBrain(Brain):
    provider_name = "ollama"

    def __init__(self, cfg: Config, persona: str) -> None:
        self.cfg = cfg
        self.persona = persona

    def _post(self, path: str, payload: dict, timeout: float) -> dict:
        url = self.cfg.ollama_url.rstrip("/") + path
        try:
            r = requests.post(url, json=payload, timeout=timeout)
        except requests.RequestException as exc:
            raise BrainError(f"Ollama unreachable at {url}: {exc}") from exc
        if r.status_code != 200:
            raise BrainError(f"Ollama HTTP {r.status_code}: {r.text[:200]}")
        return r.json()

    def is_available(self) -> Tuple[bool, str]:
        url = self.cfg.ollama_url.rstrip("/") + "/api/tags"
        try:
            r = requests.get(url, timeout=5)
            if r.status_code != 200:
                return False, f"Ollama HTTP {r.status_code}"
            models = [m.get("name", "") for m in r.json().get("models", [])]
            if self.cfg.ollama_model not in models:
                # Try to match by base name (e.g. "llava" matches "llava:13b").
                base = self.cfg.ollama_model.split(":")[0]
                if not any(base in m for m in models):
                    return False, (f"model '{self.cfg.ollama_model}' not pulled "
                                   f"(have: {', '.join(models) or 'none'})")
            return True, f"connected (model={self.cfg.ollama_model})"
        except Exception as exc:  # noqa: BLE001
            return False, f"Ollama not running at {self.cfg.ollama_url} ({exc})"

    def respond(self, prompt: str,
                images: Optional[List[ImagePart]] = None,
                history: Optional[List[dict]] = None,
                audio_b64: Optional[str] = None,
                audio_mime: str = "audio/wav",
                max_tokens: int = 400) -> str:
        images = images or []
        text = self._annotate_images(prompt, images)

        messages: List[dict] = [{"role": "system", "content": self.persona}]
        for h in (history or []):
            role = "assistant" if h.get("role") == "assistant" else "user"
            messages.append({"role": role, "content": h.get("text", "")})
        user: dict = {"role": "user", "content": text}
        if images:
            user["images"] = [img.b64 for img in images]
        messages.append(user)

        payload = {
            "model": self.cfg.ollama_model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": 0.7, "num_predict": max_tokens},
        }
        data = self._post("/api/chat", payload, self.cfg.brain_timeout_s)
        content = (data.get("message") or {}).get("content", "").strip()
        if not content:
            raise BrainError("Ollama returned an empty reply")
        return content
