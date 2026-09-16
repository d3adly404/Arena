"""Microphone capture + voice-activity detection (VAD).

A PortAudio input callback pushes raw 16-bit mono frames into a queue; a worker
thread runs webrtcvad and a small state machine to split the stream into
utterances (one each time the user stops talking). The main agent is invoked
via an `on_utterance` callback.

The whole class degrades gracefully: if no microphone / PortAudio is available
it simply reports itself as unavailable instead of crashing the app.
"""
from __future__ import annotations

import logging
import queue
import struct
import threading
from dataclasses import dataclass
from typing import Callable, List, Optional

import numpy as np

from ai_agent.config import Config

log = logging.getLogger("audio")


@dataclass
class Utterance:
    audio: np.ndarray          # float32, mono, 16 kHz
    duration_s: float
    source: str = "mic"


class Microphone:
    def __init__(self, cfg: Config, on_utterance: Callable[[Utterance], None]) -> None:
        self.cfg = cfg
        self.on_utterance = on_utterance
        self._q: "queue.Queue[bytes]" = queue.Queue(maxsize=1000)
        self._worker: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._stream = None
        self._vad = None
        self.muted = False
        self.available = False
        self.error: str = ""

        # state machine
        self._buf: List[bytes] = []
        self._samples = 0
        self._speech_streak = 0
        self._silence_streak = 0
        self._collecting = False
        self._last_level = 0.0
        self._level_lock = threading.Lock()

        sr = cfg.sample_rate
        self._frame_samples = max(1, int(sr * cfg.vad_frame_ms / 1000))
        self._frame_bytes = self._frame_samples * 2

    # ----------------------------------------------------------------- helpers
    @property
    def level(self) -> float:
        """RMS level (0..1) of the most recent frame - for barge-in / UI."""
        with self._level_lock:
            return self._last_level

    def set_muted(self, muted: bool) -> None:
        self.muted = muted

    # ---------------------------------------------------------------- lifecycle
    def start(self) -> bool:
        try:
            import sounddevice as sd
            import webrtcvad
        except Exception as exc:  # noqa: BLE001
            self.error = f"audio libraries unavailable: {exc}"
            log.error(self.error)
            return False

        try:
            self._vad = webrtcvad.Vad(int(self.cfg.vad_aggressiveness))
        except Exception as exc:  # noqa: BLE001
            self.error = f"VAD init failed: {exc}"
            log.error(self.error)
            return False

        device = self.cfg.mic_device_index
        try:
            self._stream = sd.InputStream(
                samplerate=self.cfg.sample_rate,
                channels=1,
                dtype="int16",
                blocksize=self._frame_samples,
                device=device if device >= 0 else None,
                callback=self._callback,
            )
            self._stream.start()
        except Exception as exc:  # noqa: BLE001
            self.error = f"could not open microphone: {exc}"
            log.error(self.error)
            return False

        self.available = True
        self._stop.clear()
        self._worker = threading.Thread(target=self._process, name="vad", daemon=True)
        self._worker.start()
        log.info("Microphone live (device=%s, %d Hz, VAD aggr=%d).",
                 device if device >= 0 else "default", self.cfg.sample_rate,
                 self.cfg.vad_aggressiveness)
        return True

    def stop(self) -> None:
        self._stop.set()
        if self._stream is not None:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:  # noqa: BLE001
                pass
            self._stream = None
        if self._worker:
            self._worker.join(timeout=1)
            self._worker = None
        self.available = False

    # --------------------------------------------------------------- callback
    def _callback(self, indata, frames, time_info, status) -> None:  # noqa: ANN001
        frame = bytes(indata[:, 0].tobytes())
        with self._level_lock:
            self._last_level = self._rms(frame)
        try:
            self._q.put_nowait(frame)
        except queue.Full:
            pass  # drop the oldest-ish frame; VAD tolerates gaps

    @staticmethod
    def _rms(frame: bytes) -> float:
        if len(frame) < 2:
            return 0.0
        n = len(frame) // 2
        samples = struct.unpack("<%dh" % n, frame[: n * 2])
        if n == 0:
            return 0.0
        ss = 0
        for s in samples:
            ss += s * s
        return min(1.0, (ss / n) ** 0.5 / 32768.0)

    # ------------------------------------------------------------------ worker
    def _process(self) -> None:
        cfg = self.cfg
        frame_s = cfg.vad_frame_ms / 1000.0
        silence_limit = max(1, int(cfg.silence_threshold_s / frame_s))
        start_limit = max(1, int(cfg.speech_start_frames))

        while not self._stop.is_set():
            try:
                frame = self._q.get(timeout=0.2)
            except queue.Empty:
                continue
            if self.muted:
                self._reset()
                continue
            try:
                is_speech = self._vad.is_speech(frame, cfg.sample_rate)
            except Exception:  # noqa: BLE001
                is_speech = False

            if not self._collecting:
                if is_speech:
                    self._speech_streak += 1
                    if self._speech_streak >= start_limit:
                        self._collecting = True
                        self._buf = [frame]
                        self._samples = self._frame_samples
                        self._silence_streak = 0
                else:
                    self._speech_streak = 0
            else:
                self._buf.append(frame)
                self._samples += self._frame_samples
                duration = self._samples / float(cfg.sample_rate)
                if is_speech:
                    self._silence_streak = 0
                else:
                    self._silence_streak += 1
                done = (
                    self._silence_streak >= silence_limit and duration >= cfg.min_utterance_s
                ) or duration >= cfg.max_utterance_s
                if done:
                    self._emit()

    def _reset(self) -> None:
        self._buf = []
        self._samples = 0
        self._collecting = False
        self._speech_streak = 0
        self._silence_streak = 0

    def _emit(self) -> None:
        buf = b"".join(self._buf)
        self._reset()
        if len(buf) < self._frame_bytes:
            return
        n = len(buf) // 2
        samples = struct.unpack("<%dh" % n, buf[: n * 2])
        audio = np.fromiter(samples, dtype=np.int16).astype(np.float32) / 32768.0
        duration_s = n / float(self.cfg.sample_rate)
        if duration_s < self.cfg.min_utterance_s:
            return
        log.info("Heard an utterance (%.1fs).", duration_s)
        try:
            self.on_utterance(Utterance(audio=audio, duration_s=duration_s))
        except Exception:  # noqa: BLE001
            log.exception("on_utterance callback failed")
