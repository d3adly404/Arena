"""Abstract brain interface. A Brain turns (text + optional images + optional
raw audio + short-term history) into a spoken reply string.
"""
from __future__ import annotations

import abc
import logging
import time
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

log = logging.getLogger("brain")


class BrainError(RuntimeError):
    """Raised when the brain backend fails; message is safe to surface."""


@dataclass
class ImagePart:
    b64: str
    mime: str = "image/jpeg"
    label: str = ""          # "camera" / "screen" - used in the prompt


class Brain(abc.ABC):
    provider_name: str = "base"

    @abc.abstractmethod
    def is_available(self) -> Tuple[bool, str]:
        """Cheap connectivity check. Returns (ok, message)."""

    @abc.abstractmethod
    def respond(self, prompt: str,
                images: Optional[List[ImagePart]] = None,
                history: Optional[List[dict]] = None,
                audio_b64: Optional[str] = None,
                audio_mime: str = "audio/wav",
                max_tokens: int = 400) -> str:
        """Produce a short spoken reply."""

    # ------------------------------------------------------------------ utils
    def _annotate_images(self, prompt: str, images: List[ImagePart]) -> str:
        if not images:
            return prompt
        labels = ", ".join(sorted({i.label for i in images if i.label}) or {"view"})
        return (prompt.rstrip() +
                f"\n\nAttached image(s) - source: {labels}.")

    def _time(self) -> float:
        return time.perf_counter()
