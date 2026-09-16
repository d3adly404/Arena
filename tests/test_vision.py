import base64

import numpy as np

from ai_agent.config import Config
from ai_agent.sensing.vision import Frame, Vision
from tests.mocks import small_frame


def _frame() -> Frame:
    return Frame(bgr=small_frame(200, 240, 160), label="camera")


def test_resize_limits_long_edge():
    out = Vision.resize(small_frame(1, 1000, 500), 250)
    assert max(out.shape[:2]) <= 250


def test_resize_noop_when_small():
    img = small_frame(1, 10, 10)
    assert Vision.resize(img, 100) is img


def test_encode_b64_produces_jpeg():
    b64 = Vision.encode_b64(_frame(), 1024, 70)
    assert b64
    data = base64.b64decode(b64)
    assert data[:2] == b"\xff\xd8"  # JPEG SOI marker


def test_get_frames_empty_before_capture():
    v = Vision(Config())
    assert v.get_frames() == []
    assert v.get_latest() is None


def test_get_frames_returns_inserted():
    v = Vision(Config())
    v._frames["camera"] = Frame(bgr=small_frame(0), label="camera")
    v._frames["screen"] = Frame(bgr=small_frame(9), label="screen")
    labels = {f.label for f in v.get_frames()}
    assert labels == {"camera", "screen"}
    assert v.get_latest() is not None
