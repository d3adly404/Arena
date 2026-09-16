"""Text-to-speech with interruptible, thread-safe playback.

Engines (selected by config `tts_engine`, default `auto`):
  * sapi   - Windows built-in SAPI5 (pyttsx3). Offline, native, zero setup.
             Used automatically on Windows.
  * edge   - Microsoft Edge neural voices via `edge-tts`. Free, online, no key.
             Sounds much better than SAPI.
  * piper  - fully local neural TTS (`piper-tts`), needs a model file.
  * none   - no speech (UI only).

Every engine returns a SpeakHandle so the agent can wait for completion (to
unmute the microphone) or stop mid-sentence (barge-in / "stop talking").
"""
from __future__ import annotations

import io
import logging
import threading
import time
import wave
from abc import ABC
from typing import Optional

from ai_agent.config import Config

log = logging.getLogger("tts")


class SpeakHandle:
    def __init__(self) -> None:
        self._done = threading.Event()
        self._stopped = False

    def wait(self, timeout: Optional[float] = None) -> bool:
        return self._done.wait(timeout)

    def stop(self) -> None:
        self._stopped = True

    @property
    def done(self) -> bool:
        return self._done.is_set()

    @property
    def stopped(self) -> bool:
        return self._stopped


def _build_wav(pcm: bytes, rate: int, channels: int = 1, sample_width: int = 2) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(sample_width)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


def _wav_info(wav: bytes):
    with wave.open(io.BytesIO(wav), "rb") as w:
        return w.getframerate(), w.getnchannels(), w.getsampwidth()


def _play_wav(wav: bytes, stop_evt: threading.Event) -> None:
    """Block until playback finishes or stop_evt is set."""
    import simpleaudio as sa
    rate, channels, width = _wav_info(wav)
    pcm = wav[44:] if wav[:4] == b"RIFF" else wav
    buf = sa.AudioBuffer.from_data(pcm, channels, width, rate)
    play = buf.play()
    while play.is_playing():
        if stop_evt.is_set():
            play.stop()
            break
        time.sleep(0.02)


class TextToSpeech(ABC):
    name = "base"

    def __init__(self) -> None:
        self._stop_evt = threading.Event()
        self._speaking = False

    @property
    def is_speaking(self) -> bool:
        return self._speaking

    def speak(self, text: str) -> SpeakHandle:
        handle = SpeakHandle()
        if not text or not text.strip():
            handle._done.set()
            return handle
        self._stop_evt.clear()

        def worker() -> None:
            self._speaking = True
            try:
                self._speak_impl(text, handle)
            except Exception as exc:  # noqa: BLE001
                log.error("TTS failed: %s", exc)
            finally:
                self._speaking = False
                handle._done.set()

        threading.Thread(target=worker, name=f"tts-{self.name}", daemon=True).start()
        return handle

    def stop(self) -> None:
        self._stop_evt.set()

    @property
    def stop_event(self) -> threading.Event:
        return self._stop_evt

    def _speak_impl(self, text: str, handle: SpeakHandle) -> None:
        raise NotImplementedError


# --------------------------------------------------------------------------- SAPI
class SapiTTS(TextToSpeech):
    name = "sapi"

    def __init__(self, cfg: Config) -> None:
        super().__init__()
        self.cfg = cfg
        self._engine = None

    def _ensure_engine(self):
        import pyttsx3  # lazy
        if self._engine is None:
            self._engine = pyttsx3.init()
            try:
                self._engine.setProperty("rate", int(175 * max(0.4, self.cfg.tts_rate)))
            except Exception:  # noqa: BLE001
                pass
            if self.cfg.tts_voice:
                try:
                    for v in self._engine.getProperty("voices"):
                        if self.cfg.tts_voice.lower() in (v.name or "").lower():
                            self._engine.setProperty("voice", v.id)
                            break
                except Exception:  # noqa: BLE001
                    pass
        return self._engine

    def _speak_impl(self, text: str, handle: SpeakHandle) -> None:
        engine = self._ensure_engine()
        engine.say(text)
        # runAndWait blocks until the voice finishes; stop() interrupts it.
        while engine.isBusy():
            if handle.stopped or self._stop_evt.is_set():
                try:
                    engine.stop()
                except Exception:  # noqa: BLE001
                    pass
                break
            time.sleep(0.05)


# --------------------------------------------------------------------------- Edge
class EdgeTTS(TextToSpeech):
    name = "edge"

    def __init__(self, cfg: Config) -> None:
        super().__init__()
        self.cfg = cfg
        self._voice = cfg.tts_voice or "en-US-AriaNeural"

    def _synthesize_pcm(self, text: str) -> bytes:
        import asyncio
        import edge_tts
        rate_pct = int(round((max(0.4, self.cfg.tts_rate) - 1.0) * 100))
        sign = "+" if rate_pct >= 0 else ""
        comm = edge_tts.Communicate(
            text, self._voice,
            rate=f"{sign}{rate_pct}%",
            output_format="audio-16khz-16bit-mono-pcm",
        )
        chunks = []

        async def run():
            async for ch in comm.stream():
                if ch.get("type") == "audio":
                    chunks.append(ch["data"])
        asyncio.run(run())
        return b"".join(chunks)

    def _speak_impl(self, text: str, handle: SpeakHandle) -> None:
        pcm = self._synthesize_pcm(text)
        if not pcm:
            return
        wav = _build_wav(pcm, 16000, 1, 2)
        _play_wav(wav, self._stop_evt)


# --------------------------------------------------------------------------- Piper
class PiperTTS(TextToSpeech):
    name = "piper"

    def __init__(self, cfg: Config) -> None:
        super().__init__()
        self.cfg = cfg
        self._voice = None

    def _load(self):
        if self._voice is None:
            from piper import PiperVoice  # lazy, optional
            self._voice = PiperVoice.load(self.cfg.piper_model,
                                          config_path=self.cfg.piper_data or None)
        return self._voice

    def _speak_impl(self, text: str, handle: SpeakHandle) -> None:
        voice = self._load()
        buf = io.BytesIO()
        voice.synthesize(text, buf)
        wav = buf.getvalue()
        _play_wav(wav, self._stop_evt)


# --------------------------------------------------------------------------- None
class NullTTS(TextToSpeech):
    name = "none"

    def _speak_impl(self, text: str, handle: SpeakHandle) -> None:
        return


def build_tts(cfg: Config) -> TextToSpeech:
    """Pick the best available engine, degrading gracefully."""
    engine = cfg.resolved_tts()
    order = [engine]
    for fallback in ("edge", "sapi", "none"):
        if fallback not in order:
            order.append(fallback)
    for name in order:
        try:
            if name == "sapi":
                tts = SapiTTS(cfg)
                tts._ensure_engine()  # fail fast if SAPI isn't present
            elif name == "edge":
                tts = EdgeTTS(cfg)
            elif name == "piper":
                tts = PiperTTS(cfg)
                tts._load()
            elif name == "none":
                return NullTTS()
            else:
                continue
            log.info("TTS engine: %s", name)
            return tts
        except Exception as exc:  # noqa: BLE001
            log.warning("TTS engine '%s' unavailable (%s); trying next.", name, exc)
    log.warning("No TTS engine available; the agent will stay silent.")
    return NullTTS()
