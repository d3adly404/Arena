"""The Agent: the real-time brain + body loop.

It keeps a vision thread and a microphone (with VAD) running, listens for
utterances, reasons with the brain, and speaks replies - while optionally
commenting proactively on what it sees ("always watching + talking" mode).

Threading model (everything except the main loop runs on its own thread):
  * main thread  : this loop - single owner of history / status
  * vision thread: refreshes the latest frame(s)
  * vad thread   : splits the mic into utterances -> queue
  * tts thread   : synthesizes + plays audio
  * ui thread    : renders the live window

Speech is non-blocking: the agent starts talking and keeps listening, so it
can be interrupted ("be quiet", a loud barge-in, or the user just talking).
While it speaks, the microphone is muted by default (echo guard); set
`barge_in: true` in config to keep the mic live for interruptions.
"""
from __future__ import annotations

import logging
import queue
import threading
import time
from typing import List, Optional

from ai_agent.brain.base import Brain, BrainError, ImagePart
from ai_agent.config import Config, WATCH_PROMPT
from ai_agent.sensing.audio import Microphone, Utterance
from ai_agent.sensing.vision import Vision
from ai_agent.speech.stt import SpeechToText, wav_to_b64
from ai_agent.speech.tts import SpeakHandle, TextToSpeech

log = logging.getLogger("agent")


class Agent:
    def __init__(self, cfg: Config, vision: Vision, stt: SpeechToText,
                 tts: TextToSpeech, brain: Optional[Brain]) -> None:
        self.cfg = cfg
        self.vision = vision
        self.stt = stt
        self.tts = tts
        self.brain = brain

        self._speech_q: "queue.Queue[Utterance]" = queue.Queue()
        self.mic = Microphone(cfg, on_utterance=self._speech_q.put)

        self._stop = threading.Event()
        self._speak_handle: Optional[SpeakHandle] = None
        self._barge_streak = 0
        self._watch_last = 0.0
        self.quiet_until = 0.0

        # Shared state (read by the UI thread).
        self.history: List[dict] = []
        self.status = "starting"
        self.last_user = ""
        self.last_reply = ""
        self.last_watch = ""
        self.provider_label = (brain.provider_name if brain else "none")
        self.error = ""

    # ------------------------------------------------------------- lifecycle
    def request_stop(self) -> None:
        self._stop.set()

    @property
    def stopped(self) -> bool:
        return self._stop.is_set()

    def run(self) -> None:
        self._bootstrap()
        try:
            while not self._stop.is_set():
                self._tick_speaking()
                utt = self._pop_utterance(0.05)
                if utt is not None:
                    self._process_utterance(utt)
                else:
                    self._maybe_watch()
        except KeyboardInterrupt:
            pass
        finally:
            self._shutdown()

    def _bootstrap(self) -> None:
        cfg = self.cfg
        self.status = "starting up"
        log.info("=== %s booting (provider=%s, vision=%s, mode=%s) ===",
                 cfg.assistant_name, self.provider_label, cfg.vision_source, cfg.mode)
        self.vision.start()
        if not self.mic.start():
            self.error = "microphone unavailable - running vision-only"
            log.warning(self.error)
        if self.brain is not None:
            ok, msg = self.brain.is_available()
            if not ok:
                self.error = f"brain not ready ({msg})"
                log.warning(self.error + " - it can still see and hear, but replies "
                             "will be limited until it's configured.")
        if cfg.on_start_greeting and self.tts.name != "none":
            self._speak_wait(cfg.on_start_message.format(name=cfg.assistant_name))
        self.status = "listening"

    def _shutdown(self) -> None:
        log.info("Shutting down...")
        self._stop_speech()
        self.status = "stopped"
        try:
            self.tts.stop()
        except Exception:  # noqa: BLE001
            pass
        self.mic.stop()
        self.vision.stop()
        log.info("Bye.")

    # ------------------------------------------------------------ utterances
    def _pop_utterance(self, timeout: float) -> Optional[Utterance]:
        try:
            return self._speech_q.get(timeout=timeout)
        except queue.Empty:
            return None

    def _drain_queue(self) -> None:
        while True:
            try:
                self._speech_q.get_nowait()
            except queue.Empty:
                break

    def _process_utterance(self, utt: Utterance) -> None:
        # Barge-in: if the agent is talking, stop it so we can listen.
        self._stop_speech()

        self.status = "hearing"
        transcript = ""
        try:
            transcript = (self.stt.transcribe(utt.audio, self.cfg.sample_rate) or "").strip()
        except Exception as exc:  # noqa: BLE001
            log.warning("STT failed: %s", exc)
        self.last_user = transcript or "(could not transcribe)"
        log.info("You: %s", self.last_user)
        if not transcript:
            self.status = "listening"
            return

        handled, reply = self._match_command(transcript)
        if handled:
            self._push_history("user", transcript)
            if reply:
                self.last_reply = reply
                log.info("%s: %s", self.cfg.assistant_name, reply)
                self._speak(reply)
            return

        self.status = "thinking"
        reply = self._think(transcript, utt)
        self._push_history("user", transcript)
        self._push_history("assistant", reply)
        self.last_reply = reply
        log.info("%s: %s", self.cfg.assistant_name, reply)
        self._speak(reply)

    # ----------------------------------------------------------------- think
    def _think(self, transcript: str, utt: Utterance) -> str:
        images = self._current_image_parts()
        audio_b64 = (wav_to_b64(utt.audio, self.cfg.sample_rate)
                     if self.cfg.gemini_send_raw_audio else None)
        if self.brain is None:
            return self._brain_error_reply(RuntimeError("no brain configured"))
        try:
            reply = self.brain.respond(transcript, images=images,
                                       history=self._history(), audio_b64=audio_b64)
            return reply or "Hmm, I didn't get a good answer."
        except BrainError as exc:
            log.warning("Brain error: %s", exc)
            return self._brain_error_reply(exc)
        except Exception as exc:  # noqa: BLE001
            log.exception("Unexpected brain failure")
            return self._brain_error_reply(exc)

    def _describe_now(self) -> str:
        images = self._current_image_parts()
        if not images:
            return "I can't see anything right now - the camera and screen aren't available."
        if self.brain is None:
            return self._brain_error_reply(RuntimeError("no brain"))
        prompt = ("Describe briefly, in one or two conversational sentences, what "
                  "you see in the attached image(s) right now.")
        try:
            return self.brain.respond(prompt, images=images, history=self._history())
        except Exception as exc:  # noqa: BLE001
            log.warning("Describe failed: %s", exc)
            return self._brain_error_reply(exc)

    def _brain_error_reply(self, exc: Exception) -> str:
        return ("Sorry, my brain isn't connected right now. Please check that a "
                "Gemini API key is set in config.json, or that Ollama is running.")

    def _current_image_parts(self) -> List[ImagePart]:
        parts: List[ImagePart] = []
        for f in self.vision.get_frames():
            b64 = Vision.encode_b64(f, self.cfg.max_image_dim, self.cfg.jpeg_quality)
            if b64:
                parts.append(ImagePart(b64=b64, mime="image/jpeg", label=f.label))
        return parts

    # ------------------------------------------------------------------ watch
    def _maybe_watch(self) -> None:
        cfg = self.cfg
        if cfg.mode != "watch" or cfg.watch_interval_s <= 0:
            return
        if self.tts.is_speaking or self._speak_handle is not None:
            return
        if time.time() < self.quiet_until:
            return
        if time.time() - self._watch_last < cfg.watch_interval_s:
            return
        if self.brain is None:
            return
        self._watch_last = time.time()
        images = []
        for f in self.vision.get_frames():
            b64 = Vision.encode_b64(f, cfg.watch_max_image_dim, cfg.jpeg_quality)
            if b64:
                images.append(ImagePart(b64=b64, mime="image/jpeg", label=f.label))
        if not images:
            return
        try:
            reply = self.brain.respond(WATCH_PROMPT, images=images, max_tokens=120)
        except Exception as exc:  # noqa: BLE001
            log.debug("Watch tick failed: %s", exc)
            return
        reply = (reply or "").strip()
        if not reply or reply.upper().startswith("NONE"):
            return
        self.last_watch = reply
        log.info("Watch: %s", reply)
        self._speak(reply)

    # ------------------------------------------------------------------ speak
    def _speak(self, text: str) -> None:
        """Start speaking without blocking the loop."""
        if not text or not text.strip() or self.tts.name == "none":
            return
        self._stop_speech()
        self.status = "speaking"
        # Mute the mic while talking unless barge-in is enabled (echo guard).
        self.mic.set_muted(not self.cfg.barge_in)
        self._barge_streak = 0
        self._speak_handle = self.tts.speak(text)

    def _speak_wait(self, text: str) -> None:
        """Blocking variant for the startup greeting: mute the mic for the whole
        utterance, then drop any echo that landed in the queue while we spoke."""
        if not text or not text.strip() or self.tts.name == "none":
            return
        self.mic.set_muted(True)
        self.status = "speaking"
        try:
            self._speak_handle = self.tts.speak(text)
            self._speak_handle.wait()
        finally:
            self.mic.set_muted(False)
            self._speak_handle = None
            self.status = "listening"
        self._drain_queue()

    def _stop_speech(self) -> None:
        if self._speak_handle is not None:
            self._speak_handle.stop()
            self.tts.stop()
            self._speak_handle = None
            self._barge_streak = 0
        if not self.tts.is_speaking:
            self.mic.set_muted(False)
            if self.status == "speaking":
                self.status = "listening"

    def _tick_speaking(self) -> None:
        handle = self._speak_handle
        if handle is None:
            return
        if handle.done:
            self._stop_speech()
            return
        if self.cfg.barge_in and not self.mic.muted:
            self._barge_streak = self._barge_streak + 1 \
                if self.mic.level > self.cfg.barge_in_level else 0
            if self._barge_streak >= 8:
                log.info("Barge-in: interrupting speech.")
                self._stop_speech()

    # ---------------------------------------------------------------- history
    def _push_history(self, role: str, text: str) -> None:
        self.history.append({"role": role, "text": text})
        limit = max(2, self.cfg.history_turns * 2)
        del self.history[:-limit]

    def _history(self) -> List[dict]:
        return list(self.history)

    # --------------------------------------------------------------- commands
    def _match_command(self, transcript: str):
        """Return (handled, reply). reply None => handled silently."""
        t = transcript.lower().strip()

        def has(*kws: str) -> bool:
            return any(k in t for k in kws)

        if has("stop talking", "be quiet", "keep quiet", "shut up", "silence",
               "enough of that", "hold on"):
            self.quiet_until = time.time() + 60
            self._stop_speech()
            silent = has("shut up", "silence")
            return True, (None if silent else "Okay, I'll stay quiet for a bit.")
        if has("look at the screen", "switch to the screen", "show me the screen",
               "screen view", "what's on my screen"):
            self.vision.set_source("screen")
            return True, "Switching to your screen."
        if has("look at the camera", "switch to the camera", "show me the camera",
               "camera view", "webcam view"):
            self.vision.set_source("camera")
            return True, "Switching to the camera."
        if has("show both", "both views", "camera and screen", "show everything"):
            self.vision.set_source("both")
            return True, "Showing both the camera and the screen."
        if has("what do you see", "what's on screen", "what is on screen",
               "describe what you see", "tell me what you see", "what are you looking at"):
            return True, self._describe_now()
        if has("who are you", "your name", "what can you do", "help me", "help"):
            return True, (f"I'm {self.cfg.assistant_name}. I can see your camera and "
                          "screen, and I can hear you. Try 'what do you see', "
                          "'look at the screen', 'be quiet', or just talk to me. "
                          "Say 'exit' to close.")
        if has("exit", "quit", "goodbye", "bye", "shut down", "power off", "close"):
            self._stop.set()
            return True, "Goodbye!"
        return False, None
