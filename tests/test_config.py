from ai_agent.config import Config


def test_defaults_are_sane():
    c = Config()
    assert c.vision_source == "both"
    assert c.provider == "auto"
    assert c.mode == "watch"
    assert c.assistant_name


def test_auto_provider_without_key_is_ollama():
    assert Config().resolved_provider() == "ollama"


def test_auto_provider_with_key_is_gemini():
    assert Config(gemini_api_key="x").resolved_provider() == "gemini"


def test_forced_provider():
    assert Config(provider="gemini").resolved_provider() == "gemini"
    assert Config(provider="ollama").resolved_provider() == "ollama"


def test_resolved_stt_follows_key():
    assert Config().resolved_stt() == "whisper"
    assert Config(gemini_api_key="x").resolved_stt() == "gemini"


def test_save_load_roundtrip(tmp_path):
    c = Config(assistant_name="Testy", vision_source="screen", watch_interval_s=7)
    p = c.save(tmp_path / "config.json")
    c2 = Config.load(p)
    assert c2.assistant_name == "Testy"
    assert c2.vision_source == "screen"
    assert c2.watch_interval_s == 7


def test_load_missing_file_uses_defaults(tmp_path):
    c = Config.load(tmp_path / "nope.json")
    assert c.vision_source == "both"


def test_env_key_overrides_file(tmp_path, monkeypatch):
    p = tmp_path / "config.json"
    Config(gemini_api_key="filekey").save(p)
    monkeypatch.setenv("GEMINI_API_KEY", "envkey")
    c = Config.load(p)
    assert c.gemini_api_key == "envkey"
    assert c.resolved_provider() == "gemini"


def test_unknown_keys_ignored(tmp_path):
    p = tmp_path / "config.json"
    p.write_text('{"vision_source": "screen", "bogus_key": 123}')
    c = Config.load(p)
    assert c.vision_source == "screen"
    assert not hasattr(c, "bogus_key")


def test_persona_formatting():
    c = Config(assistant_name="Nova")
    assert "Nova" in c.persona
    c2 = Config(assistant_name="Nova", system_prompt="custom")
    assert c2.persona == "custom"
