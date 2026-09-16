"""Integration test: drive the real Ollama HTTP client (the no-key default
brain) against a live local mock server, using a real encoded JPEG. This
validates URLs, JSON body, headers and response parsing over actual sockets."""
import base64
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from ai_agent.brain.base import ImagePart
from ai_agent.brain.local import OllamaBrain
from ai_agent.config import Config
from tests.mocks import small_frame

pytestmark = pytest.mark.filterwarnings("ignore")


class _State:
    tags_hits = 0
    chat_body = None


def _make_handler(state: _State):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):  # silence
            pass

        def do_GET(self):
            if self.path.startswith("/api/tags"):
                state.tags_hits += 1
                body = json.dumps({"models": [{"name": "llava:13b"}]}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(404)
                self.end_headers()

        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            if self.path.startswith("/api/chat"):
                state.chat_body = json.loads(raw)
                body = json.dumps({"message": {"content": "I see a desk."}}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(404)
                self.end_headers()

    return Handler


def _real_jpeg_b64() -> str:
    import cv2
    ok, buf = cv2.imencode(".jpg", small_frame(120), [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    assert ok
    return base64.b64encode(buf.tobytes()).decode("ascii")


def test_ollama_over_real_http():
    state = _State()
    server = ThreadingHTTPServer(("127.0.0.1", 0), _make_handler(state))
    port = server.server_address[1]
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    try:
        cfg = Config(ollama_url=f"http://127.0.0.1:{port}", ollama_model="llava:13b")
        brain = OllamaBrain(cfg, persona="You are Nova.")

        ok, msg = brain.is_available()
        assert ok, msg
        assert state.tags_hits == 1

        img = ImagePart(b64=_real_jpeg_b64(), label="camera")
        reply = brain.respond("What do you see?", images=[img])
        assert reply == "I see a desk."

        body = state.chat_body
        assert body["model"] == "llava:13b"
        assert body["stream"] is False
        assert body["messages"][0] == {"role": "system", "content": "You are Nova."}
        user = body["messages"][-1]
        assert user["role"] == "user"
        assert user["images"] == [img.b64]
        assert "camera" in user["content"]  # source label annotated
    finally:
        server.shutdown()
        server.server_close()
