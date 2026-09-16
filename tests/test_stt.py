import base64
import io
import wave

import numpy as np

from ai_agent.speech.stt import audio_to_wav, wav_to_b64


def test_audio_to_wav_roundtrip():
    sr = 16000
    audio = (np.random.randn(sr) * 0.1).astype(np.float32)  # 1 second
    wav = audio_to_wav(audio, sr)
    with wave.open(io.BytesIO(wav), "rb") as w:
        assert w.getframerate() == sr
        assert w.getnchannels() == 1
        assert w.getsampwidth() == 2
        assert w.getnframes() == sr


def test_audio_to_wav_clips():
    # Values above 1.0 must be clipped, not overflow.
    audio = np.array([5.0, -5.0, 0.5], dtype=np.float32)
    wav = audio_to_wav(audio, 16000)
    with wave.open(io.BytesIO(wav), "rb") as w:
        frames = w.readframes(w.getnframes())
    samples = np.frombuffer(frames, dtype="<i2")
    assert samples[0] == 32767
    assert samples[1] == -32768


def test_wav_to_b64():
    b = wav_to_b64(np.zeros(1600, dtype=np.float32), 16000)
    raw = base64.b64decode(b)
    assert raw[:4] == b"RIFF"
    assert len(raw) > 44
