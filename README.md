# 🚀 Novase Browser

A sleek, modern browser application with built-in games, multi-engine search, and a powerful media downloader.

![Novase](https://img.shields.io/badge/Novase-v1.0.0-6c5ce7?style=for-the-badge&labelColor=0a0a1a)
![Node](https://img.shields.io/badge/Node.js-18+-00b894?style=for-the-badge&labelColor=0a0a1a)
![License](https://img.shields.io/badge/License-MIT-a29bfe?style=for-the-badge&labelColor=0a0a1a)

---

## ✨ Features

### 🌐 Full Browser Interface
- **Multi-tab browsing** — Create, close, and switch tabs (`Ctrl+T` / `Ctrl+W`)
- **Navigation controls** — Back, forward, refresh, and home
- **Smart address bar** — Auto-detects URLs vs search queries
- **Bookmarks** — Save pages with `Ctrl+D`, persistent across sessions
- **Browsing history** — Automatically tracked

### 🔍 8 Search Engines
Switch between search engines instantly with one click:

| Engine | Engine | Engine | Engine |
|--------|--------|--------|--------|
| Google | Bing | DuckDuckGo | Yahoo |
| Brave Search | Ecosia | Yandex | Startpage |

### 🎮 6 Built-in Games
Play directly in the browser — no installs, no loading:

| Game | Controls |
|------|----------|
| **Snake** | Arrow Keys / WASD |
| **Tetris** | ← → ↑ rotate, ↓ soft drop, Space hard drop |
| **2048** | Arrow Keys to slide tiles |
| **Breakout** | ← → move paddle, Space launch |
| **Flappy Bird** | Space / ↑ to flap |
| **Minesweeper** | Click reveal, Right-click flag |

### 📥 Media Downloader
Download videos and music directly from the internet:

- **Paste any URL** from YouTube, Vimeo, Twitter, SoundCloud, and 1000+ sites
- **Analyze** — Fetches title, thumbnail, duration, and available formats
- **Video download** — MP4 in multiple quality options (720p, 1080p, etc.)
- **Audio extraction** — MP3 with one click
- **Progress tracking** — Real-time progress bar
- **Download manager** — Browse, download, and manage all saved files

### 🎨 4 Themes
| Theme | Style |
|-------|-------|
| **Dark** | Deep navy with purple accents (default) |
| **Light** | Clean and bright |
| **Midnight Blue** | Deep ocean blue |
| **Cyberpunk** | Neon pink and cyan on dark purple |

---

## 🛠️ Installation

### Prerequisites
- **Node.js** 18 or higher
- **yt-dlp** (for media downloading)

### Setup

```bash
# Clone the repository
git clone https://github.com/d3adly404/Arena.git
cd Arena

# Install dependencies
npm install

# Install yt-dlp (required for media downloads)
pip install yt-dlp
# or
brew install yt-dlp

# Start the server
npm start
```

The browser will be available at **http://localhost:3000**

### Development

```bash
npm run dev
```

---

## 📁 Project Structure

```
Arena/
├── server.js              # Express.js backend + media download API
├── package.json           # Dependencies and scripts
├── .gitignore
├── public/
│   ├── index.html         # Main browser UI
│   ├── css/
│   │   └── styles.css     # Full stylesheet with 4 themes
│   └── js/
│       └── app.js         # Core app logic, games engine, download manager
└── downloads/             # Downloaded media files (gitignored)
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/media/info` | Analyze a media URL and get available formats |
| `POST` | `/api/media/download` | Start downloading a video or audio file |
| `GET` | `/api/media/progress/:id` | Check download progress |
| `GET` | `/api/downloads` | List all downloaded files |
| `DELETE` | `/api/downloads/:filename` | Delete a downloaded file |

### Example: Analyze a URL

```bash
curl -X POST http://localhost:3000/api/media/info \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close tab |
| `Ctrl+L` | Focus address bar |
| `Ctrl+D` | Bookmark current page |
| `Enter` | Navigate / Search |

---

## 🧰 Tech Stack

- **Frontend** — Vanilla HTML, CSS, JavaScript (zero dependencies, blazing fast)
- **Backend** — Node.js + Express.js
- **Media Engine** — yt-dlp (supports 1000+ websites)
- **Fonts** — Inter by Google Fonts

---

## 📄 License

MIT License — feel free to use, modify, and distribute.

---

<p align="center">
  <strong>Novase</strong> — Browse. Play. Download.
</p>
