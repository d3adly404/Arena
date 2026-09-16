"""Live webcam capture via OpenCV.

Works cross-platform. On Windows OpenCV will use the best available backend
(DirectShow / MSMF). If the default backend fails we try a couple of common
ones before giving up.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

import numpy as np

log = logging.getLogger("vision.camera")


class Camera:
    def __init__(self, index: int = 0, width: int = 640, height: int = 480,
                 backend: int = -1) -> None:
        self.index = index
        self.width = width
        self.height = height
        self.backend = backend
        self._cap = None

    def open(self) -> bool:
        import cv2  # lazy: keeps the module importable without OpenCV

        backends = [self.backend] if self.backend not in (-1, 0) else [
            cv2.CAP_ANY, cv2.CAP_DSHOW, cv2.CAP_MSMF,
        ]
        for be in backends:
            try:
                cap = cv2.VideoCapture(self.index, be)
            except Exception as exc:  # noqa: BLE001
                log.debug("cv2.VideoCapture(%s, %s) raised %s", self.index, be, exc)
                continue
            if cap is not None and cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
                self._cap = cap
                log.info("Camera %s opened (backend=%s).", self.index, be)
                return True
            cap.release()
        log.error("Could not open camera index %s.", self.index)
        return False

    def read(self) -> Optional[np.ndarray]:
        """Return the newest BGR frame, or None."""
        if self._cap is None:
            return None
        ok, frame = self._cap.read()
        if not ok or frame is None:
            return None
        return frame

    def close(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, *exc):
        self.close()
