import numpy as np

from ai_agent.agent import Agent
from ai_agent.config import Config
from ai_agent.sensing.audio import Utterance
from ai_agent.sensing.vision import Frame, Vision
from tests.mocks import MockBrain, MockSTT, MockTTS, small_frame


def make_agent(reply="mock reply"):
    cfg = Config(provider="ollama", on_start_greeting=False, watch_interval_s=0,
                 mode="watch")
    vision = Vision(cfg)
    vision._frames = {"camera": Frame(bgr=small_frame(128), label="camera")}
    brain = MockBrain(reply)
    stt = MockSTT("hello agent")
    tts = MockTTS()
    agent = Agent(cfg, vision=vision, stt=stt, tts=tts, brain=brain)
    return agent, brain, stt, tts


def test_process_utterance_end_to_end():
    agent, brain, stt, tts = make_agent()
    utt = Utterance(audio=np.zeros(1600, dtype=np.float32), duration_s=0.1)
    agent._process_utterance(utt)

    assert agent.last_user == "hello agent"
    assert agent.last_reply == "mock reply"
    assert tts.spoken == ["mock reply"]
    roles = [h["role"] for h in agent.history]
    assert roles == ["user", "assistant"]
    assert agent.history[0]["text"] == "hello agent"
    assert agent.history[1]["text"] == "mock reply"
    # The brain must have received a fresh camera image.
    assert brain.calls and brain.calls[0]["images"]
    assert brain.calls[0]["images"][0].label == "camera"


def test_thinking_receives_history():
    agent, brain, _, _ = make_agent()
    agent._push_history("user", "earlier question")
    agent._push_history("assistant", "earlier answer")
    utt = Utterance(audio=np.zeros(800, dtype=np.float32), duration_s=0.05)
    agent._process_utterance(utt)
    sent = brain.calls[-1]["history"]
    assert [h["role"] for h in sent] == ["user", "assistant"]


def test_command_quiet_sets_quiet_until():
    agent, *_ = make_agent()
    handled, reply = agent._match_command("be quiet")
    assert handled
    assert agent.quiet_until > 0
    assert reply is not None


def test_command_shut_up_is_silent():
    agent, *_ = make_agent()
    handled, reply = agent._match_command("shut up")
    assert handled
    assert reply is None


def test_command_switch_screen():
    agent, *_ = make_agent()
    handled, _ = agent._match_command("look at the screen")
    assert handled
    assert agent.vision.source == "screen"


def test_command_exit_stops_agent():
    agent, *_ = make_agent()
    handled, reply = agent._match_command("goodbye")
    assert handled
    assert agent.stopped


def test_command_describe_uses_brain():
    agent, brain, _, tts = make_agent(reply="I see a wall.")
    handled, reply = agent._match_command("what do you see?")
    assert handled
    assert reply == "I see a wall."
    assert "Describe" in brain.calls[-1]["prompt"]


def test_chat_not_matched_as_command():
    agent, *_ = make_agent()
    handled, _ = agent._match_command("tell me a joke")
    assert not handled


def test_brain_error_is_spoken_politely():
    from ai_agent.brain.base import Brain, BrainError

    class BrokenBrain(Brain):
        provider_name = "broken"

        def is_available(self):
            return True, "x"

        def respond(self, *a, **k):
            raise BrainError("boom")

    cfg = Config(provider="ollama", on_start_greeting=False)
    vision = Vision(cfg)
    vision._frames = {"camera": Frame(bgr=small_frame(1), label="camera")}
    agent = Agent(cfg, vision=vision, stt=MockSTT("hi"), tts=MockTTS(), brain=BrokenBrain())
    utt = Utterance(audio=np.zeros(800, dtype=np.float32), duration_s=0.05)
    agent._process_utterance(utt)
    assert "brain" in agent.last_reply.lower()
    assert agent.tts.spoken  # the apology was spoken


def test_watch_tick_skips_none():
    agent, brain, _, tts = make_agent(reply="NONE")
    agent.cfg.watch_interval_s = 0.001  # tiny positive => the tick is allowed to run
    agent._watch_last = 0
    agent.quiet_until = 0
    agent._maybe_watch()
    # "NONE" must not be spoken.
    assert tts.spoken == []


def test_watch_tick_speaks_notable():
    agent, brain, _, tts = make_agent(reply="You have a notification.")
    agent.cfg.watch_interval_s = 0.001
    agent._watch_last = 0
    agent.quiet_until = 0
    agent._maybe_watch()
    assert tts.spoken == ["You have a notification."]
    assert agent.last_watch == "You have a notification."
