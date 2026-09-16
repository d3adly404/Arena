"""Entry point. Wires config -> vision + mic + stt + tts + brain -> Agent -> UI.

Run from source :  python -m ai_agent            (or  python ai_agent/main.py)
Run the build   :  AIAgent.exe
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from ai_agent import __version__
from ai_agent.agent import Agent
from ai_agent.brain.gemini import GeminiBrain
from ai_agent.brain.local import OllamaBrain
from ai_agent.config import Config, config_dir
from ai_agent.logging_setup import setup_logging
from ai_agent.sensing.vision import Vision
from ai_agent.speech.stt import build_stt
from ai_agent.speech.tts import build_tts
from ai_agent.ui import UI

log = logging.getLogger("main")

BANNER = r"""
   ___ _ _                   _
  / __| (_)_ _ _ __  ___ _ _| |_   _ A I   A g e n t  v%s
  \__ \ | | ' \ '_\/ -_) ' \  | |_| |  see . hear . talk
  |___/_|_|_|_//_| \___|_||_\__|\__, |
                                |___/
"""


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="AIAgent", description="See & hear & talk assistant.")
    p.add_argument("--config", type=Path, default=None, help="path to config.json")
    p.add_argument("--source", choices=["camera", "screen", "both"], default=None,
                   help="override vision source")
    p.add_argument("--provider", choices=["auto", "gemini", "ollama"], default=None,
                   help="override brain provider")
    p.add_argument("--headless", action="store_true", help="no window (UI only via log)")
    p.add_argument("--no-window", dest="headless", action="store_true",
                   help=argparse.SUPPRESS)
    p.add_argument("--mode", choices=["watch", "on_demand"], default=None,
                   help="watch = proactive commentary, on_demand = only when spoken to")
    p.add_argument("--version", action="store_true")
    return p


def build_brain(cfg: Config):
    provider = cfg.resolved_provider()
    if provider == "gemini":
        if cfg.gemini_api_key:
            return GeminiBrain(cfg, cfg.persona)
        log.warning("provider=gemini but no API key found - falling back to Ollama.")
    # Ollama (local) is the default / fallback.
    return OllamaBrain(cfg, cfg.persona)


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    if args.version:
        print(f"AIAgent {__version__}")
        return 0

    overrides = {}
    if args.source:
        overrides["vision_source"] = args.source
    if args.provider:
        overrides["provider"] = args.provider
    if args.headless:
        overrides["show_window"] = False
    if args.mode:
        overrides["mode"] = args.mode

    cfg = Config.load(args.config, overrides=overrides or None)
    setup_logging(cfg.log_level, cfg.log_file, base_dir=config_dir())

    print(BANNER % __version__)
    log.info("Config dir: %s", config_dir())
    log.info("Brain provider: %s | Vision: %s | Mode: %s | Window: %s",
             cfg.resolved_provider(), cfg.vision_source, cfg.mode, cfg.show_window)

    vision = Vision(cfg)
    brain = build_brain(cfg)
    stt = build_stt(cfg, brain)
    tts = build_tts(cfg)

    agent = Agent(cfg, vision=vision, stt=stt, tts=tts, brain=brain)
    ui = UI(cfg, agent, vision)
    ui.start()

    try:
        agent.run()
    finally:
        ui.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
