# Nova Player

A lightweight **Windows media player** for video and audio files, built with [Electron](https://www.electronjs.org/).

![Nova Player](build/icon.png)

## Features

- Plays **video** (MP4, MKV, WebM, MOV, AVI, …) and **audio** (MP3, FLAC, AAC, OGG, WAV, …) files
- **Slick frameless UI** — custom glass title bar with native-style minimize / maximize / close,
  double-click the title bar to maximize, live gradient status line, micro-animations everywhere
- **Cinematic fullscreen** — chrome fades into glass overlays and auto-hides after ~3 s of
  inactivity (mouse or keys bring it back), cursor hides
- **Playlist**: open files or whole folders, drag & drop from Explorer, drag to reorder, filter, remove, show-in-folder
- **Transport controls**: play/pause, next/previous, seek bar with **buffered progress** + time
  preview, hover-to-expand volume, **playback speed popover** (0.5×–2×)
- **Shuffle & repeat** (off / all / one), picture-in-picture for video, true window **fullscreen**
- **Keyboard shortcuts** and hardware **media keys** (play/pause/next/prev on your keyboard)
- **Audio "now playing" card** — per-track generated cover art with ambient glow, animated
  equalizer, track title
- **Plays nicely with your library**: playlist and position are restored on launch, recent files remembered
- **Import / export playlists** (`.m3u8` / `.txt`)
- Remembers your window size and position

## Requirements (to build)

- **Windows 10 or 11 (x64)**
- **Node.js 20+** (LTS recommended) — https://nodejs.org

## Quick start (run from source)

```powershell
cd nova-player
npm install
npm start
```

## Build the Windows app

```powershell
cd nova-player
npm install
npm run build:win
```

This creates two artifacts in `nova-player/dist/`:

| Artifact | What it is |
| --- | --- |
| `Nova Player-1.1.0-win-x64.exe` | Installer (NSIS) — desktop + start-menu shortcuts |
| `Nova Player-1.1.0-win-x64-portable.exe` | Single portable exe, no install needed |

Build only the portable exe: `npm run build:win:portable`. Build an unpacked folder: `npm run build:dir`.

> First build downloads the Electron runtime and packaging tools, so it may take a few minutes and requires internet access.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` / `→` | Seek ±5 s |
| `J` / `L` | Seek ±10 s |
| `↑` / `↓` | Volume ±5 % |
| `0`–`9` | Jump to 0–90 % of the file |
| `Home` / `End` | Jump to start / end |
| `M` | Mute |
| `F` or `F11` | Fullscreen |
| `S` | Toggle shuffle |
| `R` | Repeat: off → all → one |
| `,` / `.` | Slower / faster playback |
| `Ctrl+O` | Open files |
| `Ctrl+Shift+O` | Open folder |
| `Ctrl+I` / `Ctrl+E` | Import / export playlist |

Double-click the video stage for fullscreen.

## Supported formats

Playback uses the **Chromium media engine on the Windows codec stack**, so what you can play depends on the codecs installed on your machine (just like in Edge/Chrome):

- **Always works**: MP3, WAV, AAC, OGG Vorbis, Opus, FLAC; MP4/H.264, WebM/VP8, WebM/VP9, MKV/H.264, 3GP
- **AV1** (MP4/WebM/MKV): works on Windows 10+ (Chromium includes a software AV1 decoder)
- **HEVC / H.265**: needs the **Microsoft HEVC Video Extensions** (or a third-party codec pack)
- **Legacy formats** (AVI, FLV, WMV, ASF, MP…): play when the corresponding Windows codec is present

If a file won't play, Nova Player shows a toast telling you the codec is missing.

## Project structure

```
nova-player/
├── package.json            # scripts + electron-builder (Windows) config
├── build/icon.png          # app icon (converted to .ico at build time)
├── src/
│   ├── main/main.js        # Electron main process: window, menu, dialogs,
│   │                       #   folder scan, playlists, state, media keys
│   ├── preload/preload.js  # contextBridge API exposed to the UI (nova.*)
│   └── renderer/
│       ├── index.html      # UI markup (CSP-locked, no external resources)
│       ├── css/main.css    # dark theme, controls, playlist, equalizer
│       └── js/
│           ├── utils.js    # pure helpers (paths, times, file:// URLs)
│           ├── playlist.js # pure playlist state machine (shuffle/repeat)
│           └── app.js      # wiring: playback, controls, drag & drop, keys
└── test/logic.test.js      # node-based unit tests (npm test)
```

## Development

```powershell
npm test        # run the pure-logic unit tests (no Electron needed)
npm start       # run the app in dev
```

The renderer is intentionally dependency-free (vanilla JS + CSS) and runs with
`contextIsolation` and no `nodeIntegration`; everything native goes through the
small, audited preload API in `src/preload/preload.js`.

## Troubleshooting

- **Where's the menu bar?** — the window is frameless and the menu is hidden;
  press `Alt` to reveal it (Open files `Ctrl+O`, Full screen `F11`, DevTools `Ctrl+Shift+I`, …).
- **"Cannot play … not supported by your system"** — the file's codec isn't
  installed on Windows. Install the Microsoft HEVC extension or a codec pack
  (e.g. K-Lite) and try again.
- **SmartScreen warning on first launch** — the build is unsigned by default.
  Click *More info → Run anyway*, or sign the installer with your own certificate.
- **Rebuild after changing the icon** — put a 512×512+ PNG in `build/icon.png`.

## License

MIT — do whatever you like, no warranty.
