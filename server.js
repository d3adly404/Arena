const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Downloads directory
const DOWNLOADS_DIR = path.join(__dirname, 'public', 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// Store active downloads
const activeDownloads = new Map();

// ── Get media info ──────────────────────────────────────────────
app.post('/api/media/info', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const proc = spawn('yt-dlp', [
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      url
    ], { timeout: 30000 });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);

    proc.on('close', code => {
      if (code !== 0) {
        return res.status(400).json({ error: stderr || 'Failed to fetch media info' });
      }
      try {
        const info = JSON.parse(stdout);
        const formats = (info.formats || [])
          .filter(f => f.url && (f.vcodec !== 'none' || f.acodec !== 'none'))
          .map(f => ({
            format_id: f.format_id,
            ext: f.ext,
            quality: f.quality_label || f.format_note || `${f.height || '?'}p`,
            height: f.height,
            width: f.width,
            fps: f.fps,
            vcodec: f.vcodec,
            acodec: f.acodec,
            filesize: f.filesize || f.filesize_approx,
            has_video: f.vcodec !== 'none',
            has_audio: f.acodec !== 'none',
            tbr: f.tbr
          }));

        res.json({
          title: info.title,
          thumbnail: info.thumbnail,
          duration: info.duration,
          uploader: info.uploader,
          webpage_url: info.webpage_url,
          extractor: info.extractor,
          formats
        });
      } catch (e) {
        res.status(500).json({ error: 'Failed to parse media info' });
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start download ──────────────────────────────────────────────
app.post('/api/media/download', async (req, res) => {
  const { url, format_id, mode } = req.body; // mode: 'video', 'audio', 'both'
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const downloadId = uuidv4();
  const outputTemplate = path.join(DOWNLOADS_DIR, `${downloadId}.%(ext)s`);

  let args = ['--no-playlist', '--no-warnings', '-o', outputTemplate];

  if (mode === 'audio') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else if (format_id) {
    args.push('-f', `${format_id}+bestaudio/best`);
  } else {
    args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best');
  }

  args.push(url);

  const proc = spawn('yt-dlp', args);
  let progress = 0;
  let filename = '';
  let error = '';

  activeDownloads.set(downloadId, { proc, progress, filename, status: 'downloading' });

  proc.stdout.on('data', data => {
    const str = data.toString();
    const match = str.match(/(\d+\.?\d*)%/);
    if (match) {
      progress = parseFloat(match[1]);
      const dl = activeDownloads.get(downloadId);
      if (dl) dl.progress = progress;
    }
    const nameMatch = str.match(/\[download\] Destination: (.+)/);
    if (nameMatch) {
      filename = path.basename(nameMatch[1]);
      const dl = activeDownloads.get(downloadId);
      if (dl) dl.filename = filename;
    }
    const mergeMatch = str.match(/\[Merger\] Merging formats into "(.+)"/);
    if (mergeMatch) {
      filename = path.basename(mergeMatch[1]);
      const dl = activeDownloads.get(downloadId);
      if (dl) dl.filename = filename;
    }
  });

  proc.stderr.on('data', data => { error += data.toString(); });

  proc.on('close', code => {
    const dl = activeDownloads.get(downloadId);
    if (dl) {
      dl.status = code === 0 ? 'complete' : 'error';
      dl.progress = code === 0 ? 100 : dl.progress;
      // Find actual filename
      if (code === 0 && !dl.filename) {
        const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(downloadId));
        if (files.length) dl.filename = files[0];
      }
    }
  });

  res.json({ downloadId, status: 'started' });
});

// ── Check download progress ─────────────────────────────────────
app.get('/api/media/progress/:id', (req, res) => {
  const dl = activeDownloads.get(req.params.id);
  if (!dl) return res.status(404).json({ error: 'Download not found' });

  res.json({
    progress: dl.progress,
    status: dl.status,
    filename: dl.filename
  });
});

// ── List completed downloads ────────────────────────────────────
app.get('/api/downloads', (req, res) => {
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR).map(name => {
      const stat = fs.statSync(path.join(DOWNLOADS_DIR, name));
      const ext = path.extname(name).toLowerCase();
      let type = 'other';
      if (['.mp4', '.webm', '.mkv', '.avi'].includes(ext)) type = 'video';
      else if (['.mp3', '.m4a', '.ogg', '.wav', '.opus', '.flac', '.aac'].includes(ext)) type = 'audio';
      return {
        name,
        size: stat.size,
        type,
        ext,
        date: stat.mtime,
        url: `/downloads/${name}`
      };
    });
    res.json(files);
  } catch (err) {
    res.json([]);
  }
});

// ── Delete download ─────────────────────────────────────────────
app.delete('/api/downloads/:filename', (req, res) => {
  const filePath = path.join(DOWNLOADS_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// ── Proxy endpoint for fetching web pages ───────────────────────
app.get('/api/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('URL required');
  // This is a simple redirect — real proxying would require more work
  res.redirect(url);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║   🚀 Novase Browser is running!      ║`);
  console.log(`  ║   http://0.0.0.0:${PORT}               ║`);
  console.log(`  ╚══════════════════════════════════════╝\n`);
});
