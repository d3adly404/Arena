"""Shared test doubles - no hardware, no network."""
import numpy as np

from ai_agent.brain.base import Brain
from ai_agent.speech.stt import SpeechToText
from ai_agent.speech.tts import SpeakHandle, TextToSpeech


class MockBrain(Brain):
    provider_name = "mock"

    def __init__(self, reply: str = "mock reply") -> None:
        self.reply = reply
        self.calls = []

    def is_available(self):
        return True, "mock"

    def respond(self, prompt, images=None, history=None,
                audio_b64=None, audio_mime="audio/wav", max_tokens=400) -> str:
        self.calls.append({"prompt": prompt, "images": images, "history": history})
        return self.reply


class MockSTT(SpeechToText):
    name = "mock"

    def __init__(self, transcript: str = "hello agent") -> None:
        self.transcript = transcript
        self.calls = []

    def transcribe(self, audio, sample_rate=16000) -> str:
        self.calls.append((len(audio), sample_rate))
        return self.transcript


class MockTTS(TextToSpeech):
    """Fully synchronous TTS so tests don't race the worker thread."""
    name = "mock"

    def __init__(self) -> None:
        super().__init__()
        self.spoken = []

    def speak(self, text) -> SpeakHandle:
        handle = SpeakHandle()
        if text and text.strip():
            self._speaking = True
            try:
                self.spoken.append(text)
            finally:
                self._speaking = False
                handle._done.set()
        else:
            handle._done.set()
        return handle

    def _speak_impl(self, text, handle) -> None:  # pragma: no cover - not used
        self.spoken.append(text)


def small_frame(color: int = 128, w: int = 64, h: int = 64) -> np.ndarray:
    return np.full((h, w, 3), color, np.uint8)
