# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for AIAgent.

Build the Windows executable on Windows with:
    pyinstaller ai_agent.spec --noconfirm --clean

The spec is platform-tolerant: every optional/heavy dependency is collected
only if it is importable, so the build still succeeds if an optional component
(e.g. the offline Whisper STT) is missing.
"""
import os
import sys

from PyInstaller.utils.hooks import collect_all, collect_submodules

# SPECPATH is provided by PyInstaller: the directory containing this spec.
ROOT = SPECPATH

# App icon (a .ico is only meaningful on Windows; keep None elsewhere so the
# spec also works for Linux/macOS builds).
ICON_PATH = os.path.join(SPECPATH, "assets", "icon.ico")
APP_ICON = ICON_PATH if (sys.platform == "win32" and os.path.isfile(ICON_PATH)) else None


def try_collect(name):
    """collect_all that degrades to a no-op when the package is absent."""
    try:
        return collect_all(name)
    except Exception:
        return [], [], []


# Packages that mix pure-Python code with native libs / data files and are
# historically tricky for PyInstaller. Everything else is found by normal
# import analysis.
TRICKY = [
    "faster_whisper",
    "ctranslate2",
    "tokenizers",
    "huggingface_hub",
    "sounddevice",
    "_sounddevice_data",   # bundles the PortAudio binary on Windows
    "webrtcvad",
    "simpleaudio",
    "edge_tts",
    "aiohttp",             # edge-tts async HTTP client (has native parts)
    "certifi",             # CA bundle edge-tts needs for HTTPS
    "pyttsx3",
    "comtypes",            # SAPI bridge used by pyttsx3 on Windows
    "mss",
]

extra_datas, extra_bins, extra_hidden = [], [], []
for _pkg in TRICKY:
    _d, _b, _h = try_collect(_pkg)
    extra_datas += _d
    extra_bins += _b
    extra_hidden += _h

# Ship a ready-to-edit config next to the exe (PyInstaller data path = root).
app_datas = [("config.example.json", "."), ("README.md", ".")]

hiddenimports = (
    collect_submodules("ai_agent")
    + extra_hidden
    + [
        "cv2", "numpy", "requests", "httpx", "mss",
        "sounddevice", "webrtcvad", "simpleaudio",
        "edge_tts", "aiohttp", "certifi", "pyttsx3",
    ]
)

a = Analysis(
    ["ai_agent/main.py"],
    pathex=[ROOT],
    binaries=extra_bins,
    datas=extra_datas + app_datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "PyQt5", "PySide2", "PySide6",
              "IPython", "jupyter", "notebook", "pytest", "test"],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="AIAgent",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,  # keep a console so the user can see logs & press Ctrl+C
    icon=APP_ICON,
)
