import pytest

from ai_agent.brain.base import BrainError
from ai_agent.brain.local import OllamaBrain
from ai_agent.config import Config


class FakeResp:
    def __init__(self, status, json_data):
        self.status_code = status
        self._j = json_data
        self.text = str(json_data)

    def json(self):
        return self._j


def test_respond(monkeypatch):
    import ai_agent.brain.local as m
    calls = {}

    def fake_post(url, json=None, timeout=None):
        calls.update(url=url, json=json, timeout=timeout)
        return FakeResp(200, {"message": {"content": "local reply"}})

    monkeypatch.setattr(m.requests, "post", fake_post)
    brain = OllamaBrain(Config(ollama_model="llava:13b"), "P")
    out = brain.respond("hi")
    assert out == "local reply"
    assert calls["url"].endswith("/api/chat")
    assert calls["json"]["model"] == "llava:13b"
    assert calls["json"]["stream"] is False
    assert calls["json"]["messages"][0] == {"role": "system", "content": "P"}


def test_respond_with_images(monkeypatch):
    import ai_agent.brain.local as m
    from ai_agent.brain.base import ImagePart
    captured = {}

    def fake_post(url, json=None, timeout=None):
        captured["json"] = json
        return FakeResp(200, {"message": {"content": "seen"}})

    monkeypatch.setattr(m.requests, "post", fake_post)
    brain = OllamaBrain(Config(), "P")
    brain.respond("look", images=[ImagePart(b64="aW1n", label="camera")])
    user = captured["json"]["messages"][-1]
    assert user["role"] == "user"
    assert user["images"] == ["aW1n"]


def test_unreachable_raises(monkeypatch):
    import requests
    import ai_agent.brain.local as m

    def fake_post(url, json=None, timeout=None):
        raise requests.exceptions.ConnectionError("connection refused")

    monkeypatch.setattr(m.requests, "post", fake_post)
    brain = OllamaBrain(Config(), "P")
    with pytest.raises(BrainError):
        brain.respond("hi")


def test_is_available_lists_models(monkeypatch):
    import ai_agent.brain.local as m
    monkeypatch.setattr(m.requests, "get",
                        lambda *a, **k: FakeResp(200, {"models": [{"name": "llava:13b"}]}))
    ok, msg = OllamaBrain(Config(ollama_model="llava:13b"), "P").is_available()
    assert ok


def test_is_available_model_missing(monkeypatch):
    import ai_agent.brain.local as m
    monkeypatch.setattr(m.requests, "get",
                        lambda *a, **k: FakeResp(200, {"models": [{"name": "llama3:8b"}]}))
    ok, msg = OllamaBrain(Config(ollama_model="llava:13b"), "P").is_available()
    assert not ok
    assert "not pulled" in msg
