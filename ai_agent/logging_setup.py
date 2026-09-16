"""Logging setup: console + rotating file, friendly format."""
from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path


def setup_logging(level: str = "INFO", log_file: str = "ai_agent.log",
                  base_dir: Path | None = None, console: bool = True) -> logging.Logger:
    base_dir = Path(base_dir) if base_dir else Path.cwd()
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    root.handlers.clear()

    fmt = logging.Formatter(
        "%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S"
    )

    if console:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(fmt)
        root.addHandler(handler)

    if log_file:
        try:
            file_handler = RotatingFileHandler(
                base_dir / log_file, maxBytes=1_000_000, backupCount=3, encoding="utf-8"
            )
            file_handler.setFormatter(fmt)
            root.addHandler(file_handler)
        except OSError:
            pass

    # Quiet noisy third-party loggers.
    for noisy in ("urllib3", "httpx", "httpcore", "PIL", "matplotlib"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    return root
