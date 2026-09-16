'use strict';

/**
 * NovaUtils — small pure helpers shared by the player UI.
 * Works in the browser (window.NovaUtils) and under Node (module.exports)
 * so the logic can be unit-tested without Electron.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NovaUtils = api;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const VIDEO_EXTS = new Set([
    '.mp4', '.m4v', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv',
    '.mpg', '.mpeg', '.m2ts', '.mts', '.3gp', '.ogv', '.asf', '.vob'
  ]);
  const AUDIO_EXTS = new Set([
    '.mp3', '.wav', '.flac', '.aac', '.ogg', '.oga', '.opus', '.m4a',
    '.m4b', '.wma', '.mid', '.midi', '.aiff', '.aif', '.amr'
  ]);

  /** File extension of a path, lowercase, e.g. ".mp4" (empty when none). */
  function extOf(p) {
    const s = String(p);
    const base = s.replace(/[\\/]+$/, '');
    const i = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'));
    const name = base.slice(i + 1);
    const j = name.lastIndexOf('.');
    return j > 0 ? name.slice(j).toLowerCase() : '';
  }

  /** "video" | "audio" | "unknown" based on the file extension. */
  function kindOf(p) {
    const e = extOf(p);
    if (VIDEO_EXTS.has(e)) return 'video';
    if (AUDIO_EXTS.has(e)) return 'audio';
    return 'unknown';
  }

  /** Last path segment (file name). Handles / and \ separators. */
  function basename(p) {
    const s = String(p).replace(/\\/g, '/');
    const i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
  }

  /** Convert a Windows/POSIX file path to a file:// URL for <video src>. */
  function toFileUrl(p) {
    const s = String(p).replace(/\\/g, '/');
    let prefix;
    let rest;
    if (/^[A-Za-z]:\//.test(s)) {
      // Drive letter: C:/...  ->  file:///C:/...
      prefix = 'file:///';
      rest = s;
    } else if (s.startsWith('/')) {
      // UNC share \\server\share -> /server/share -> file://server/share
      prefix = 'file://';
      rest = s.replace(/^\/+/, '');
    } else {
      prefix = 'file://';
      rest = s;
    }
    return prefix + rest
      .split('/')
      .map((seg, i) => {
        // Keep the drive-letter colon (C:) literal — it is part of the
        // Windows path identifier, not something to percent-encode.
        if (i === 0 && /^[A-Za-z]:$/.test(seg)) return seg;
        return encodeURIComponent(seg);
      })
      .join('/');
  }

  /** Format seconds as m:ss or h:mm:ss. */
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const total = Math.floor(sec);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = h ? String(m).padStart(2, '0') : String(m);
    const ss = String(s).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function debounce(fn, ms = 300) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }

  return {
    VIDEO_EXTS,
    AUDIO_EXTS,
    extOf,
    kindOf,
    basename,
    toFileUrl,
    fmtTime,
    clamp,
    debounce
  };
});
