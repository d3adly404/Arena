"""Configuration loading and defaults.

The app reads `config.json` from the *config directory* and lets environment
variables override a few key fields (so you never have to hardcode secrets).

Config directory:
  - Running from source : the repository root (this folder's parent).
  - Running as a .exe   : the folder that contains AIAgent.exe.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Dict, Optional

APP_NAME = "AIAgent"

DEFAULT_PERSONA = (
    "You are {name}, a friendly real-time AI assistant living on the user's "
    "laptop. You can SEE a live image from the laptop's webcam and/or its "
    "screen, and you HEAR the user through the microphone. You reply with "
    "speech that is read aloud through the laptop's speaker, so keep answers "
    "short, warm and conversational (one to three sentences). Never use "
    "markdown, bullet lists, code blocks or emoji in your replies because "
    "they would be read out loud verbatim. Only describe what you see when it "
    "is relevant or the user asks. If you are unsure, say so briefly and "
    "politely."
)

WATCH_PROMPT = (
    "You are watching the user's laptop in real time. The image(s) attached "
    "are the current view(s). Is there anything notable, or is the user doing "
    "something you should gently point out or help with? If nothing notable, "
    "reply with the single word NONE. Otherwise reply with ONE short, "
    "conversational sentence (max 15 words) suitable for being read aloud."
)


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


def config_dir() -> Path:
    """Where config.json lives (and is created if missing)."""
    if getattr(sys, "frozen", False):  # PyInstaller .exe
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


@dataclass
class Config:
    # ------------------------------------------------------------------ brain
    provider: str = "auto"                 # auto | gemini | ollama
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    gemini_stt_model: str = "gemini-2.0-flash"
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_send_raw_audio: bool = False    # also send the raw audio clip, not just the transcript
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llava:13b"
    assistant_name: str = "Nova"
    system_prompt: str = ""                # empty -> DEFAULT_PERSONA
    history_turns: int = 12
    brain_timeout_s: float = 30.0
    language: str = "en"

    # ----------------------------------------------------------------- vision
    vision_source: str = "both"            # camera | screen | both
    camera_index: int = 0
    camera_width: int = 640
    camera_height: int = 480
    camera_backend: int = -1               # -1 lets OpenCV choose (MSMF/DirectShow on Windows)
    screen_monitor: int = 1                # 1 = primary monitor (mss numbering)
    capture_fps: float = 2.0
    max_image_dim: int = 1024              # downscale long edge before sending (token saver)
    jpeg_quality: int = 70

    # ---------------------------------------------------------------- hearing
    mic_device_index: int = -1             # -1 = system default
    sample_rate: int = 16000
    vad_aggressiveness: int = 2            # webrtcvad: 0 (lenient) .. 3 (strict)
    vad_frame_ms: int = 30                 # 10 | 20 | 30
    speech_start_frames: int = 3           # consecutive VAD frames to start an utterance
    silence_threshold_s: float = 0.9       # end the utterance after this much silence
    min_utterance_s: float = 0.35
    max_utterance_s: float = 30.0
    barge_in: bool = False                 # True = keep mic live while talking so loud
                                           # speech can interrupt (may hear itself on
                                           # laptops without echo cancellation)
    barge_in_level: float = 0.02           # RMS level that counts as "loud" for barge-in

    # ----------------------------------------------------------------- speech
    stt_engine: str = "auto"               # auto | whisper | gemini
    whisper_model: str = "base.en"         # tiny.en | base.en | small.en ...
    tts_engine: str = "auto"               # auto | sapi | edge | piper | none
    tts_voice: str = ""                    # e.g. "Microsoft Zira" (sapi) / "en-US-AriaNeural" (edge)
    tts_rate: float = 1.0                  # speed multiplier (sapi)
    piper_model: str = ""                  # path to a Piper .onnx voice model
    piper_data: str = ""                   # path to the matching .onnx.json

    # --------------------------------------------------------- real-time mode
    mode: str = "watch"                    # watch | on_demand
    watch_interval_s: float = 30.0         # proactive "anything notable?" tick (0 = off)
    watch_max_image_dim: int = 768         # smaller images for the periodic watch
    on_start_greeting: bool = True
    on_start_message: str = "Hi, I am {name}. I can see your camera and screen, and I can hear you. Try asking me what I see."

    # -------------------------------------------------------------------- UI
    show_window: bool = True
    window_name: str = "AIAgent - see & hear"
    log_level: str = "INFO"
    log_file: str = "ai_agent.log"

    # ------------------------------------------------------------------ meta
    @property
    def persona(self) -> str:
        if self.system_prompt.strip():
            return self.system_prompt
        return DEFAULT_PERSONA.format(name=self.assistant_name)

    def resolved_provider(self) -> str:
        """Pick the brain backend. `auto` = Gemini if a key is available, else Ollama."""
        if self.provider != "auto":
            return self.provider
        if self.gemini_api_key:
            return "gemini"
        return "ollama"

    def resolved_stt(self) -> str:
        if self.stt_engine != "auto":
            return self.stt_engine
        return "gemini" if self.gemini_api_key else "whisper"

    def resolved_tts(self) -> str:
        if self.tts_engine != "auto":
            return self.tts_engine
        if sys.platform.startswith("win"):
            return "sapi"
        # On non-Windows prefer Edge (free, online, no key) and fall back at runtime.
        return "edge"

    # ----------------------------------------------------------------- I/O
    @classmethod
    def load(cls, path: Optional[Path] = None, overrides: Optional[Dict[str, Any]] = None) -> "Config":
        path = Path(path) if path else config_dir() / "config.json"
        data: Dict[str, Any] = {}
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except Exception as exc:  # noqa: BLE001
                logging.warning("Could not read %s (%s); using defaults.", path, exc)
                data = {}
        cfg = cls._from_dict(data)
        # Environment variable overrides (keys win, so secrets stay out of files).
        env_key = _env("GEMINI_API_KEY")
        if env_key:
            cfg.gemini_api_key = env_key
        env_provider = _env("AI_AGENT_PROVIDER")
        if env_provider:
            cfg.provider = env_provider
        env_source = _env("AI_AGENT_VISION")
        if env_source:
            cfg.vision_source = env_source
        env_ollama = _env("OLLAMA_URL")
        if env_ollama:
            cfg.ollama_url = env_ollama
        if overrides:
            cfg = cls._from_dict({**asdict(cfg), **{k: v for k, v in overrides.items() if v is not None}})
        return cfg

    @classmethod
    def _from_dict(cls, data: Dict[str, Any]) -> "Config":
        valid = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        clean = {k: v for k, v in data.items() if k in valid}
        return cls(**clean)

    def save(self, path: Optional[Path] = None) -> Path:
        path = Path(path) if path else config_dir() / "config.json"
        path.write_text(json.dumps(asdict(self), indent=2, ensure_ascii=False), encoding="utf-8")
        return path

    @property
    def config_path(self) -> Path:
        return config_dir() / "config.json"
