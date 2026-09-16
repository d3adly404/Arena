import pytest

from ai_agent.brain.base import BrainError, ImagePart
from ai_agent.brain.gemini import GeminiBrain
from ai_agent.config import Config


class FakeResp:
    def __init__(self, status, json_data):
        self.status_code = status
        self._j = json_data
        self.text = str(json_data)

    def json(self):
        return self._j

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def test_respond_builds_correct_request(monkeypatch):
    import ai_agent.brain.gemini as g
    calls = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.update(url=url, headers=headers, json=json, timeout=timeout)
        return FakeResp(200, {"candidates": [{"content": {"parts": [{"text": "hello there"}]}}]})

    monkeypatch.setattr(g.requests, "post", fake_post)
    cfg = Config(gemini_api_key="K", gemini_model="gemini-2.0-flash")
    brain = GeminiBrain(cfg, persona="P")
    out = brain.respond("What do you see?", images=[ImagePart(b64="aW1n", label="camera")])

    assert out == "hello there"
    assert calls["url"].endswith("/models/gemini-2.0-flash:generateContent")
    assert calls["headers"]["x-goog-api-key"] == "K"
    assert calls["timeout"] == cfg.brain_timeout_s

    body = calls["json"]
    assert body["systemInstruction"]["parts"][0]["text"] == "P"
    user = body["contents"][-1]
    assert user["role"] == "user"
    part_keys = [list(p.keys())[0] for p in user["parts"]]
    assert "inline_data" in part_keys
    assert any(k == "text" for k in part_keys)


def test_respond_includes_history(monkeypatch):
    import ai_agent.brain.gemini as g
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["json"] = json
        return FakeResp(200, {"candidates": [{"content": {"parts": [{"text": "ok"}]}}]})

    monkeypatch.setattr(g.requests, "post", fake_post)
    brain = GeminiBrain(Config(gemini_api_key="K"), "P")
    brain.respond("hi", history=[
        {"role": "user", "text": "a"}, {"role": "assistant", "text": "b"},
    ])
    roles = [c["role"] for c in captured["json"]["contents"]]
    assert roles == ["user", "model", "user"]


def test_http_error_raises_brain_error(monkeypatch):
    import ai_agent.brain.gemini as g
    monkeypatch.setattr(g.requests, "post", lambda *a, **k: FakeResp(400, {"error": "bad"}))
    brain = GeminiBrain(Config(gemini_api_key="K"), "P")
    with pytest.raises(BrainError):
        brain.respond("hi")


def test_no_key_unavailable():
    brain = GeminiBrain(Config(gemini_api_key=""), "P")
    ok, msg = brain.is_available()
    assert not ok
    assert "key" in msg


def test_is_available_ok(monkeypatch):
    import ai_agent.brain.gemini as g
    monkeypatch.setattr(g.requests, "get", lambda *a, **k: FakeResp(200, {"models": []}))
    brain = GeminiBrain(Config(gemini_api_key="K"), "P")
    ok, _ = brain.is_available()
    assert ok


def test_transcribe(monkeypatch):
    import ai_agent.brain.gemini as g
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["json"] = json
        return FakeResp(200, {"candidates": [{"content": {"parts": [{"text": "the words"}]}}]})

    monkeypatch.setattr(g.requests, "post", fake_post)
    brain = GeminiBrain(Config(gemini_api_key="K", gemini_stt_model="gemini-2.0-flash"), "P")
    assert brain.transcribe("data", "audio/wav") == "the words"
    assert "Transcribe" in captured["json"]["contents"][0]["parts"][0]["text"]
