"""Vision: a background thread keeps the latest frame(s) fresh.

`source` can be "camera", "screen", or "both". The agent (and the UI) simply
ask for the current frame(s) whenever they need them, so capture never blocks
reasoning.
"""
from __future__ import annotations

import base64
import io
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import List, Optional

import numpy as np

from ai_agent.config import Config
from ai_agent.sensing.camera import Camera
from ai_agent.sensing.screen import Screen

log = logging.getLogger("vision")


@dataclass
class Frame:
    bgr: np.ndarray
    label: str            # "camera" | "screen"
    ts: float = field(default_factory=time.time)


class Vision:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.source: str = cfg.vision_source
        self._lock = threading.Lock()
        self._frames: dict[str, Frame] = {}
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._camera = Camera(cfg.camera_index, cfg.camera_width, cfg.camera_height,
                              cfg.camera_backend)
        self._screen = Screen(cfg.screen_monitor)
        self.camera_ok = False
        self.screen_ok = False

    # ---------------------------------------------------------------- lifecycle
    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        if "camera" in self.source:
            self.camera_ok = self._camera.open()
            if not self.camera_ok:
                log.warning("Camera unavailable - continuing with other sources.")
        if "screen" in self.source:
            self.screen_ok = self._screen.grab() is not None
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="vision", daemon=True)
        self._thread.start()
        log.info("Vision started (source=%s, camera_ok=%s, screen_ok=%s).",
                 self.source, self.camera_ok, self.screen_ok)

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
        self._camera.close()
        self._screen.close()

    def _run(self) -> None:
        interval = 1.0 / max(0.1, self.cfg.capture_fps)
        while not self._stop.is_set():
            t0 = time.time()
            if "camera" in self.source and self.camera_ok:
                f = self._camera.read()
                if f is not None:
                    with self._lock:
                        self._frames["camera"] = Frame(f, "camera")
            if "screen" in self.source:
                f = self._screen.grab()
                if f is not None:
                    with self._lock:
                        self._frames["screen"] = Frame(f, "screen")
            elapsed = time.time() - t0
            self._stop.wait(max(0.0, interval - elapsed))

    # ------------------------------------------------------------------ source
    def set_source(self, source: str) -> None:
        source = source.lower().strip()
        if source not in ("camera", "screen", "both"):
            return
        self.source = source
        if "camera" in source and not self.camera_ok:
            self.camera_ok = self._camera.open()
        log.info("Vision source -> %s", source)

    # ------------------------------------------------------------------- frames
    def get_frames(self) -> List[Frame]:
        with self._lock:
            frames = [self._frames[k] for k in ("camera", "screen") if k in self._frames]
        return frames

    def get_latest(self) -> Optional[Frame]:
        frames = self.get_frames()
        return max(frames, key=lambda f: f.ts) if frames else None

    @staticmethod
    def resize(bgr: np.ndarray, max_dim: int) -> np.ndarray:
        if max_dim and max(bgr.shape[:2]) > max_dim:
            scale = max_dim / float(max(bgr.shape[:2]))
            h, w = bgr.shape[:2]
            bgr = cv2_resize(bgr, (max(1, int(w * scale)), max(1, int(h * scale))))
        return bgr

    @staticmethod
    def encode_b64(frame: Frame, max_dim: int, quality: int = 70) -> str:
        import cv2  # lazy
        img = Vision.resize(frame.bgr, max_dim)
        ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)])
        if not ok:
            return ""
        return base64.b64encode(buf.tobytes()).decode("ascii")


def cv2_resize(img: np.ndarray, size):
    try:
        import cv2
        return cv2.resize(img, size, interpolation=cv2.INTER_AREA)
    except Exception:  # noqa: BLE001 - very defensive, resizing is non-critical
        return img
