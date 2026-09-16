"""Screen (display) capture via `mss`. Cross-platform and fast."""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np

log = logging.getLogger("vision.screen")


class Screen:
    def __init__(self, monitor: int = 1) -> None:
        # mss numbering: 1 = primary monitor, 0 = all monitors combined.
        self.monitor = monitor
        self._sct = None

    def _ensure(self):
        if self._sct is None:
            import mss  # lazy
            self._sct = mss.mss()
        return self._sct

    def _region(self) -> dict:
        sct = self._ensure()
        try:
            return sct.monitors[self.monitor]
        except IndexError:
            log.warning("Monitor %s not found; falling back to primary.", self.monitor)
            self.monitor = 1
            return sct.monitors[1]

    def grab(self) -> Optional[np.ndarray]:
        try:
            sct = self._ensure()
            shot = sct.grab(self._region())
            img = np.asarray(shot)          # BGRA
            return np.ascontiguousarray(img[:, :, :3])  # BGR
        except Exception as exc:  # noqa: BLE001
            log.warning("Screen grab failed: %s", exc)
            return None

    def close(self) -> None:
        if self._sct is not None:
            try:
                self._sct.close()
            finally:
                self._sct = None
