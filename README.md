# AIAgent — an AI that can **see**, **hear**, and **talk** through your laptop

A real-time, multimodal desktop assistant for **Windows** (also runs on
Linux/macOS). It watches your **webcam** and/or **screen**, listens to you
through the **microphone**, thinks with a large multimodal model, and answers
you **out loud** through the **speaker**.

```
   ___ _ _                   _
  / __| (_)_ _ _ __  ___ _ _| |_   _ A I   A g e n t
  \__ \ | | ' \ '_\/ -_) ' \  | |_| |  see . hear . talk
  |___/_|_|_|_//_| \___|_||_\__|\__, |
                                |___/
```

> **What you get:** the complete, tested agent **plus a one-click script that
> builds a real, self-contained `AIAgent.exe`** on your Windows PC. See
> [Building the Windows executable](#building-the-windows-exe).

---

## What it does

- 👀 **Sees** the laptop webcam and/or the screen (switchable live, side by side
  in the window).
- 👂 **Hears** you through the microphone with on-device voice-activity
  detection (it knows when you start and stop talking).
- 🧠 **Thinks** with a multimodal LLM, using the latest image(s) *and* your
  words plus short-term conversation context.
- 🔊 **Talks** its replies back through the speaker.
- 🕵️ **Always watching (optional):** in `watch` mode it periodically glances at
  what's happening and only speaks up when something is *notable*.

### Example
You: *"Hey, what do you see?"*
Nova: *"You're looking at a code editor — there's a red error squiggle on line 42."*

Later, on its own: *"You've got an unread notification in the top-right corner."*

---

## The "brain" (and why it works with no key)

The brain is a large multimodal model. The app auto-selects the best backend
based on what's configured:

| Provider  | When used                          | Needs | Quality |
|-----------|------------------------------------|-------|---------|
| **Gemini 2.x** | automatically, as soon as an API key is present | a free [Google AI Studio](https://aistudio.google.com/apikey) key | Excellent (vision + audio + text) |
| **Ollama (local)** | default when **no** key is set | [Ollama](https://ollama.com) + a vision model (e.g. `ollama pull llava`) | Good, fully offline |

So **out of the box it runs 100% locally** (Ollama + on-device speech), and the
moment you drop a Gemini API key into `config.json` (or set the
`GEMINI_API_KEY` environment variable) it upgrades to the cloud brain with no
code changes.

### Speech
- **Speech-to-text:** on-device **faster-whisper** by default (offline).
  Uses **Gemini** automatically when a key is present.
- **Text-to-speech:** on **Windows** it uses the built-in **SAPI5** voice
  (offline, zero setup). Set `tts_engine: "edge"` to use a free, much nicer
  neural voice (Microsoft Edge TTS, no key needed, needs internet). A fully
  local neural option (**Piper**) is supported too.

---

## Building the Windows executable

### One-click (recommended)
1. Install [Python 3.10+](https://python.org) and tick **“Add python.exe to PATH”**.
2. Put a **vision model** in Ollama (for the no-key brain):
   ```
   ollama pull llava
   ```
   (optional but recommended for offline use)
3. Double-click **`Build_AIAgent_on_Windows.bat`**.
4. Wait a few minutes — it creates a virtual environment, installs everything,
   and runs PyInstaller.
5. Your executable is at **`dist\AIAgent.exe`**. Copy it anywhere and
   double-click to run.

> The build is a **single-file** `.exe` (~150–300 MB). First launch is a little
> slower because it unpacks to a temp folder — that's normal.

### What the build does
`Build_AIAgent_on_Windows.bat` →
`python -m venv .venv` → `pip install -r requirements.txt` →
`pip install pyinstaller` → `pyinstaller ai_agent.spec --clean` →
`dist\AIAgent.exe`. The spec (`ai_agent.spec`) is platform-tolerant: every
optional heavy dependency is collected only if present, so the build is robust.

### Troubleshooting the build
- **“Python was not found”** — install Python and add it to PATH, then reopen a
  new terminal and re-run the batch file.
- **Antivirus flags the exe** — PyInstaller onefile exes are sometimes
  false-positived; allow it, or build in “onedir” mode (see below).
- **Whisper is large** — if you don't need offline speech, you can remove
  `faster-whisper` from `requirements.txt` to shrink the exe (the app still
  works; it just falls back to Gemini STT when a key is present).

<details>
<summary><b>Build a smaller “folder” (onedir) exe instead of one-file</b></summary>

Change the final `EXE(...)` call in `ai_agent.spec` so it does **not** include
`a.binaries, a.datas` (use `a.scripts, []` for the EXE and add a
`COLLECT(...)` step). Onedir starts faster and is less likely to trip
antivirus.
</details>

---

## Run from source (no build) — quickest way to try it

If you just want to see it work right away on Windows (or anywhere):

1. `python -m venv .venv`
2. `.venv\Scripts\activate` (Windows) or `source .venv/bin/activate` (mac/linux)
3. `pip install -r requirements.txt`
4. `python -m ai_agent`

Useful flags:
```
python -m ai_agent --headless              # no window
python -m ai_agent --source screen         # camera | screen | both
python -m ai_agent --provider gemini       # auto | gemini | ollama
python -m ai_agent --mode on_demand        # watch | on_demand
python -m ai_agent --config path\to.json   # use a specific config file
```

There's also **`Run_AIAgent_on_Windows.bat`** which automates steps 1–4.

---

## Configuration

On first run (or copy `config.example.json` → `config.json` next to the exe),
the app reads **`config.json`**. Everything is optional — defaults are sensible.

```jsonc
{
  "provider": "auto",            // auto | gemini | ollama
  "assistant_name": "Nova",
  "language": "en",

  // ---- Brain ----
  "gemini_api_key": "",          // or set env GEMINI_API_KEY (preferred)
  "gemini_model": "gemini-2.0-flash",
  "gemini_stt_model": "gemini-2.0-flash",
  "gemini_send_raw_audio": false,
  "ollama_url": "http://127.0.0.1:11434",
  "ollama_model": "llava:13b",

  // ---- Vision (what it sees) ----
  "vision_source": "both",       // camera | screen | both
  "camera_index": 0,
  "screen_monitor": 1,           // 1 = primary monitor
  "capture_fps": 2.0,
  "max_image_dim": 1024,         // downscale before sending (token/cost saver)

  // ---- Hearing ----
  "mic_device_index": -1,        // -1 = system default
  "vad_aggressiveness": 2,       // 0..3 (higher = stricter)
  "silence_threshold_s": 0.9,    // stop listening after this much quiet
  "barge_in": false,             // true = loud speech can interrupt (see note)

  // ---- Speech ----
  "stt_engine": "auto",          // auto | whisper | gemini
  "whisper_model": "base.en",    // tiny.en | base.en | small.en
  "tts_engine": "auto",          // auto | sapi | edge | piper | none
  "tts_voice": "",               // e.g. "Microsoft Zira" (sapi) / "en-US-AriaNeural" (edge)

  // ---- Behaviour ----
  "mode": "watch",               // watch = proactive, on_demand = only when spoken to
  "watch_interval_s": 30.0,      // proactive "anything notable?" tick (0 = off)
  "on_start_greeting": true,

  "show_window": true,
  "log_level": "INFO"
}
```

### Choosing the brain / TTS
- **Best quality (needs internet + key):** set `gemini_api_key` (or the env
  var). `provider`/`stt_engine`/`tts_engine` can stay `"auto"`.
- **Fully offline:** leave the key empty, install Ollama + `llava`, keep
  `tts_engine: "sapi"` (Windows) — no internet needed after first model pulls.
- **Nicer offline→online voice:** `tts_engine: "edge"` (free neural voice).

> **`barge_in` note:** when `true`, the mic stays live while the agent talks so
> a loud voice can cut it off. On many laptops the mic also picks up the agent's
> own speaker output, which can cause it to interrupt itself unless your system
> does echo cancellation. Leave it `false` unless you know your setup is clean.

---

## Voice commands

Say any of these and the agent acts immediately (no brain round-trip):

| You say | It does |
|---|---|
| “what do you see” / “describe what you see” | Describes the current view aloud |
| “look at the screen” / “look at the camera” / “show both” | Switches what it's watching |
| “be quiet” / “shut up” | Stays quiet for a minute |
| “who are you” / “help” | Explains what it can do |
| “exit” / “goodbye” | Shuts down |

Everything else is sent to the brain as normal conversation.

---

## Project layout

```
Arena/
├─ ai_agent/                 # the application package
│  ├─ main.py                # entry point + wiring
│  ├─ config.py              # config loading + defaults
│  ├─ agent.py               # the real-time loop (see/hear/think/talk)
│  ├─ ui.py                  # live OpenCV window
│  ├─ logging_setup.py
│  ├─ sensing/               # camera.py, screen.py, vision.py, audio.py (VAD)
│  ├─ brain/                 # base.py, gemini.py, local.py (Ollama)
│  └─ speech/                # stt.py (whisper/gemini), tts.py (sapi/edge/piper)
├─ tests/                    # 47 unit + integration tests
├─ ai_agent.spec             # PyInstaller spec (the .exe recipe)
├─ Build_AIAgent_on_Windows.bat   # one-click → dist\AIAgent.exe
├─ Run_AIAgent_on_Windows.bat     # run from source (no build)
├─ requirements.txt          # runtime deps
├─ requirements-build.txt    # pyinstaller
└─ config.example.json
```

---

## Tests

```
python -m pytest -q        # 47 passed
```
Covers config, VAD state machine, image encoding, the Gemini/Ollama request
building (including a **real-HTTP** integration test with a real JPEG), TTS
wrapping, and the agent's command/thinking/watch logic — all without hardware
or network.

---

## Notes & limitations
- **First run:** offline Whisper downloads a small model (~75 MB for
  `base.en`) once; Ollama downloads its model once (`ollama pull llava`).
- **Echo / barge-in:** the mic is muted while the agent talks (safe default).
  See the `barge_in` note above.
- **Proactive mode** sends a tiny image to the brain every `watch_interval_s`;
  set it to `0` for silent-by-default, and keep `max_image_dim` modest to
  control cost/latency.
- **Privacy:** in local mode, images and audio never leave your machine. With
  a Gemini key, the current frame and your audio are sent to Google's API to be
  understood.
