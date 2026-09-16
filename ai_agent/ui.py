"""Optional live window: shows the current camera/screen view plus the
conversation and agent status. Runs on its own thread; all highgui calls happen
there. If OpenCV highgui can't create a window (headless box), it disables
itself cleanly instead of crashing.
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Optional

import numpy as np

from ai_agent.config import Config

log = logging.getLogger("ui")

HEADER_H = 46
FOOTER_H = 118
BAR_BG = (38, 38, 42)
TXT = (235, 235, 235)
ACCENT = (90, 180, 255)
SPEAK = (120, 220, 120)


class UI:
    def __init__(self, cfg: Config, agent, vision) -> None:
        self.cfg = cfg
        self.agent = agent
        self.vision = vision
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self.enabled = cfg.show_window

    def start(self) -> None:
        if not self.enabled:
            return
        self._thread = threading.Thread(target=self._run, name="ui", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)

    # ------------------------------------------------------------------ loop
    def _run(self) -> None:
        try:
            import cv2
        except Exception as exc:  # noqa: BLE001
            log.warning("OpenCV unavailable; disabling window: %s", exc)
            self.enabled = False
            return

        name = self.cfg.window_name
        try:
            cv2.namedWindow(name, cv2.WINDOW_NORMAL)
        except Exception as exc:  # noqa: BLE001
            log.warning("Could not open window (%s); continuing headless.", exc)
            self.enabled = False
            return

        try:
            while not self._stop.is_set():
                img = self._compose()
                try:
                    cv2.imshow(name, img)
                    key = cv2.waitKey(50) & 0xFF
                except Exception as exc:  # noqa: BLE001
                    log.debug("imshow failed: %s", exc)
                    time.sleep(0.1)
                    continue
                if key in (27, ord("q")):
                    log.info("Window closed - stopping agent.")
                    self.agent.request_stop()
                    break
        finally:
            try:
                cv2.destroyAllWindows()
            except Exception:  # noqa: BLE001
                pass

    # --------------------------------------------------------------- compose
    def _compose(self) -> "np.ndarray":
        import cv2
        a = self.agent
        frames = self.vision.get_frames()
        canvas = self._stack(frames, cv2)
        self._draw_header(canvas, cv2)
        self._draw_footer(canvas, cv2)
        return canvas

    def _stack(self, frames, cv2) -> "np.ndarray":
        W = 960
        if not frames:
            canvas = np.full((540, W, 3), 24, dtype=np.uint8)
            self._center_text(canvas, "No video source available", cv2, (120, 120, 120), 32)
            return canvas
        tiles = []
        per = max(1, W // len(frames))
        for f in frames:
            img = self._fit(f.bgr, per, cv2)
            label = f.label.upper()
            cv2.rectangle(img, (0, 0), (per, 26), (0, 0, 0), -1)
            cv2.putText(img, label, (10, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.7, ACCENT, 2)
            tiles.append(img)
        h = max(t.shape[0] for t in tiles)
        canvas = np.full((h, W, 3), 24, dtype=np.uint8)
        x = 0
        for t in tiles:
            pad = (h - t.shape[0]) // 2
            canvas[pad:pad + t.shape[0], x:x + t.shape[1]] = t
            x += t.shape[1]
        return canvas

    def _fit(self, img, width, cv2) -> "np.ndarray":
        h, w = img.shape[:2]
        if w == 0:
            return img
        scale = width / float(w)
        new_h = max(1, int(h * scale))
        return cv2.resize(img, (width, new_h), interpolation=cv2.INTER_AREA)

    def _draw_header(self, canvas, cv2) -> None:
        a = self.agent
        cv2.rectangle(canvas, (0, 0), (canvas.shape[1], HEADER_H), BAR_BG, -1)
        status = a.status
        color = SPEAK if status == "speaking" else TXT
        title = f"{self.cfg.assistant_name}  -  {status.upper()}"
        cv2.putText(canvas, title, (14, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2)
        meta = f"brain: {a.provider_label}   vision: {self.cfg.vision_source}   " \
               f"mic: {'MUTED' if a.mic.muted else 'live'}   level: {a.mic.level:.2f}"
        cv2.putText(canvas, meta, (canvas.shape[1] - cv2.getTextSize(meta,
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)[0][0] - 14, 29),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1)
        if a.error:
            cv2.putText(canvas, a.error, (14, HEADER_H + 24),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 160, 0), 1)

    def _draw_footer(self, canvas, cv2) -> None:
        a = self.agent
        h, w = canvas.shape[:2]
        top = h - FOOTER_H
        cv2.rectangle(canvas, (0, top), (w, h), BAR_BG, -1)
        self._wrapped(canvas, top + 16, 14, w - 28, "You: " + (a.last_user or "…"),
                      cv2, TXT, 12, 1)
        self._wrapped(canvas, top + 62, 14, w - 28,
                      f"{self.cfg.assistant_name}: " + (a.last_reply or "…"),
                      cv2, ACCENT, 12, 1)

    def _wrapped(self, canvas, y, x, maxw, text, cv2, color, font, thick) -> None:
        words = text.split()
        line = ""
        yy = y
        for word in words:
            trial = (line + " " + word).strip()
            if cv2.getTextSize(trial, cv2.FONT_HERSHEY_SIMPLEX, font / 10.0, thick)[0][0] > maxw:
                cv2.putText(canvas, line, (x, yy), cv2.FONT_HERSHEY_SIMPLEX, font / 10.0, color, thick)
                yy += int(16 * font / 10.0) + 4
                line = word
            else:
                line = trial
        if line:
            cv2.putText(canvas, line, (x, yy), cv2.FONT_HERSHEY_SIMPLEX, font / 10.0, color, thick)

    def _center_text(self, canvas, text, cv2, color, font) -> None:
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 1.0, 2)
        x = (canvas.shape[1] - tw) // 2
        y = (canvas.shape[0] + th) // 2
        cv2.putText(canvas, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, 1.0, color, 2)
