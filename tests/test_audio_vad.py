import struct
import threading
import time

import numpy as np
import webrtcvad

from ai_agent.config import Config
from ai_agent.sensing.audio import Microphone


def _frame_bytes(n: int = 480) -> bytes:
    """30 ms of a 440 Hz sine at 16 kHz, 16-bit mono."""
    sr = 16000
    t = np.arange(n) / sr
    sig = (0.5 * np.sin(2 * np.pi * 440 * t) * 32767).astype("<i2")
    return sig.tobytes()


def _make_mic(on_utterance) -> Microphone:
    cfg = Config(
        sample_rate=16000,
        vad_frame_ms=30,
        speech_start_frames=3,
        silence_threshold_s=0.12,   # 4 silent frames end an utterance
        min_utterance_s=0.1,
        max_utterance_s=30.0,
    )
    mic = Microphone(cfg, on_utterance=on_utterance)
    mic._vad = webrtcvad.Vad(2)
    return mic


def _run_worker(mic: Microphone, speech_script) -> list:
    """Feed a scripted VAD classification through the real state machine."""
    got = []
    # We build a fresh mic to capture emissions.
    got_box = []

    def cb(u):
        got_box.append(u)

    mic2 = _make_mic(cb)
    it = iter(speech_script)
    mic2._vad.is_speech = lambda frame, sr: next(it, False)  # scripted
    mic2._stop.clear()
    worker = threading.Thread(target=mic2._process, daemon=True)
    worker.start()
    for _ in speech_script:
        mic2._q.put(_frame_bytes())
        time.sleep(0.001)
    for _ in range(200):
        if got_box:
            break
        time.sleep(0.01)
    mic2._stop.set()
    worker.join(timeout=3)
    return got_box


def test_utterance_emitted_after_silence():
    # 8 speech frames (starts at frame 3, collects to 8) + 4 silence frames -> emit.
    got = _run_worker(None, [True] * 8 + [False] * 4)
    assert len(got) == 1
    u = got[0]
    assert u.duration_s >= 0.1
    assert u.audio.dtype == np.float32
    assert u.audio.shape[0] == int(u.duration_s * 16000)


def test_no_utterance_for_pure_silence():
    got = _run_worker(None, [False] * 40)
    assert got == []


def test_short_burst_ignored():
    # 2 speech frames never reach the start threshold of 3.
    got = _run_worker(None, [True, True] + [False] * 20)
    assert got == []


def test_mute_drops_in_progress_utterance():
    cfg = Config(sample_rate=16000, vad_frame_ms=30, speech_start_frames=2,
                 silence_threshold_s=0.06, min_utterance_s=0.05, max_utterance_s=30)
    mic = Microphone(cfg, on_utterance=lambda u: None)
    mic._vad = webrtcvad.Vad(2)
    mic.muted = True
    it = iter([True] * 10)
    mic._vad.is_speech = lambda frame, sr: next(it, False)
    mic._stop.clear()
    w = threading.Thread(target=mic._process, daemon=True)
    w.start()
    for _ in range(10):
        mic._q.put(_frame_bytes())
    time.sleep(0.1)
    mic._stop.set()
    w.join(timeout=3)
    assert mic._collecting is False  # never started while muted


def test_rms_of_silence_is_zero():
    assert Microphone._rms(b"\x00" * 960) == 0.0


def test_rms_of_loud_signal():
    loud = struct.pack("<%dh" % 480, *([30000] * 480))
    assert Microphone._rms(loud) > 0.5
