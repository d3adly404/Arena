"""Speech-to-text.

Two engines:
  * whisper  - offline, on-device (faster-whisper). No key, no internet after the
               one-time model download. Default when no API key is present.
  * gemini   - cloud, uses the Gemini key. Highest quality; used automatically
               when a key is configured.
"""
from __future__ import annotations

import base64
import io
import logging
import wave

import numpy as np

from ai_agent.config import Config

log = logging.getLogger("stt")


def audio_to_wav(audio: np.ndarray, sample_rate: int = 16000) -> bytes:
    """float32 mono (0..1 scale) -> 16-bit PCM WAV bytes."""
    audio = np.asarray(audio, dtype=np.float32)
    audio = np.clip(audio * 32767.0, -32768, 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(audio.tobytes())
    return buf.getvalue()


def wav_to_b64(audio: np.ndarray, sample_rate: int = 16000) -> str:
    return base64.b64encode(audio_to_wav(audio, sample_rate)).decode("ascii")


class SpeechToText:
    name = "base"

    def transcribe(self, audio: np.ndarray, sample_rate: int = 16000) -> str:
        raise NotImplementedError


class WhisperSTT(SpeechToText):
    name = "whisper"

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self._model = None

    def _load(self):
        if self._model is None:
            from faster_whisper import WhisperModel  # lazy, heavy import
            log.info("Loading Whisper model '%s' (first run may download it).",
                     self.cfg.whisper_model)
            self._model = WhisperModel(self.cfg.whisper_model, device="cpu",
                                       compute_type="int8")
        return self._model

    def transcribe(self, audio: np.ndarray, sample_rate: int = 16000) -> str:
        model = self._load()
        audio = np.ascontiguousarray(audio, dtype=np.float32)
        segments, _info = model.transcribe(
            audio,
            language=None if self.cfg.language in ("", "auto") else self.cfg.language,
            beam_size=1,
            vad_filter=True,
        )
        text = " ".join(s.text.strip() for s in segments).strip()
        return text


class GeminiSTT(SpeechToText):
    name = "gemini"

    def __init__(self, cfg: Config, brain) -> None:
        self.cfg = cfg
        self._brain = brain

    def transcribe(self, audio: np.ndarray, sample_rate: int = 16000) -> str:
        b64 = wav_to_b64(audio, sample_rate)
        return self._brain.transcribe(b64, "audio/wav")


def build_stt(cfg: Config, brain) -> SpeechToText:
    engine = cfg.resolved_stt()
    if engine == "gemini" and cfg.gemini_api_key:
        try:
            return GeminiSTT(cfg, brain)
        except Exception as exc:  # noqa: BLE001
            log.warning("Gemini STT unavailable (%s); using Whisper.", exc)
    # Whisper (offline) is the safe default / fallback.
    try:
        return WhisperSTT(cfg)
    except Exception as exc:  # noqa: BLE001
        log.warning("Whisper STT construction failed: %s", exc)
        return WhisperSTT(cfg)  # will surface the real error on first use
