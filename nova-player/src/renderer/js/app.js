'use strict';

/* Nova Player — renderer application. Runs with contextIsolation; all
 * native access goes through the `nova` API exposed by the preload script. */
(function () {
  const U = window.NovaUtils;
  const nova = window.nova || {};
  const $ = (id) => document.getElementById(id);

  // ------------------------------ elements ------------------------------
  const video = $('player');
  const stage = $('stage');
  const audioPanel = $('audio-panel');
  const audioTitle = $('audio-title');
  const audioSub = $('audio-sub');
  const emptyState = $('empty-state');
  const spinner = $('spinner');
  const toastEl = $('toast');
  const seek = $('seek');
  const timeCur = $('time-cur');
  const timeDur = $('time-dur');
  const vol = $('vol');
  const btnPlay = $('btn-play');
  const btnPrev = $('btn-prev');
  const btnNext = $('btn-next');
  const btnShuffle = $('btn-shuffle');
  const btnRepeat = $('btn-repeat');
  const btnMute = $('btn-mute');
  const btnRate = $('btn-rate');
  const btnPip = $('btn-pip');
  const btnFs = $('btn-fullscreen');
  const ul = $('playlist');
  const plCount = $('pl-count');
  const plFilter = $('pl-filter');
  const appRoot = $('app');
  const topbar = $('topbar');
  const tbTitle = $('tb-title');
  const seekBuffered = $('seek-buffered');
  const speedWrap = $('speed-wrap');
  const speedPop = $('speed-pop');
  const cover = $('cover');
  const coverLetter = $('cover-letter');
  const wcMin = $('wc-min');
  const wcMax = $('wc-max');
  const wcClose = $('wc-close');

  let repeatBadge = null;

  const pl = window.NovaPlaylist.create();
  const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  let isFs = false;
  let recent = [];
  let toastTimer = 0;
  let idleTimer = 0;
  let dragDepth = 0;
  let dragIndex = null;

  // ------------------------------ icons ---------------------------------
  const ICONS = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .8.87 1.3 1.56.89l10.54-6.86a1.05 1.05 0 0 0 0-1.78L9.56 4.25A1.04 1.04 0 0 0 8 5.14z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2.2v12H6zM20 6.7v10.6c0 .83-.9 1.33-1.6.88l-8.2-5.3a1.03 1.03 0 0 1 0-1.75l8.2-5.3c.7-.45 1.6.05 1.6.87z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.8 6H18v12h-2.2zM4 6.7v10.6c0 .83.9 1.33 1.6.88l8.2-5.3a1.03 1.03 0 0 0 0-1.75L5.6 5.83C4.9 5.38 4 5.88 4 6.7z"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    vol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
    volMute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>',
    pip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12.5" y="12.5" width="7" height="5" rx="1" fill="currentColor" stroke="none"/></svg>',
    fs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    minimize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    maximize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
    restore: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="12" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
  };

  // ------------------------------ toast ---------------------------------
  function toast(msg, ms) {
    if (!msg) return;
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms || 4000);
  }

  // ------------------------------ small helpers --------------------------
  function setFill(el, pct) {
    el.style.setProperty('--fill', U.clamp(pct, 0, 100) + '%');
  }

  function rateLabel(r) {
    return (Math.round(r * 100) / 100) + '\u00d7';
  }

  function entryFor(p) {
    const s = String(p);
    return { path: s, name: U.basename(s), kind: U.kindOf(s) };
  }

  function current() {
    return pl.index >= 0 ? pl.items[pl.index] : null;
  }

  // ------------------------------ persistence ----------------------------
  function savePrefs() {
    try {
      nova.saveState && nova.saveState({
        volume: video.volume,
        muted: video.muted,
        rate: video.playbackRate,
        shuffle: pl.shuffle,
        repeat: pl.repeat
      });
    } catch (e) { /* best effort */ }
  }
  const savePrefsSoon = U.debounce(savePrefs, 400);

  function savePlaylist() {
    try {
      nova.saveState && nova.saveState({
        lastPlaylist: pl.items.map((i) => i.path),
        lastIndex: pl.index,
        lastPosition: isFinite(video.duration) ? video.currentTime : 0
      });
    } catch (e) { /* best effort */ }
  }
  const savePlaylistSoon = U.debounce(savePlaylist, 400);

  function saveRecent() {
    try {
      nova.saveRecent && nova.saveRecent(recent);
    } catch (e) { /* best effort */ }
  }
  const saveRecentSoon = U.debounce(saveRecent, 400);

  function pushRecents(paths) {
    if (!paths || !paths.length) return;
    const next = [];
    for (const p of paths.concat(recent)) {
      if (!next.includes(p) && next.length < 25) next.push(p);
    }
    recent = next;
    saveRecentSoon();
  }

  // ------------------------------ UI state -------------------------------
  function isAudioMode() {
    const it = current();
    if (!it) return false;
    if (it.kind === 'audio') return true;
    if (it.kind === 'video') {
      // Some "video" files turn out to be audio-only once loaded.
      return video.readyState >= 1 && video.videoWidth === 0 && video.videoHeight === 0;
    }
    return false;
  }

  function updatePlayIcon() {
    btnPlay.innerHTML = (!video.paused && video.currentSrc) ? ICONS.pause : ICONS.play;
  }

  function updateVolUi() {
    const v = video.muted ? 0 : video.volume * 100;
    vol.value = String(Math.round(v));
    setFill(vol, Math.round(v));
    btnMute.innerHTML = (video.muted || video.volume === 0) ? ICONS.volMute : ICONS.vol;
  }

  function updateRepeatUi() {
    btnRepeat.classList.toggle('active', pl.repeat !== 'none');
    if (repeatBadge) repeatBadge.classList.toggle('hidden', pl.repeat !== 'one');
  }

  function updateStageEmpty() {
    const it = current();
    emptyState.classList.toggle('hidden', !!(it || video.currentSrc));
    if (it) {
      const audio = isAudioMode();
      audioPanel.classList.toggle('hidden', !audio);
      video.classList.toggle('hidden', audio);
      audioTitle.textContent = it.name;
      audioSub.textContent = it.path;
      audioPanel.classList.toggle('playing', audio && !video.paused && !!video.currentSrc);
    } else {
      audioPanel.classList.add('hidden');
    }
    btnPip.classList.toggle('disabled', !it || isAudioMode());
  }

  /** Update play indicators without rebuilding the list (keeps scroll). */
  function markPlaying() {
    for (const li of ul.children) {
      const i = parseInt(li.dataset.index, 10);
      const playing = i === pl.index && !video.paused && video.currentSrc;
      li.classList.toggle('playing', playing);
      const idx = li.querySelector('.pl-idx');
      if (idx) {
        if (playing) {
          if (!idx.classList.contains('mini-eq')) {
            idx.classList.add('mini-eq');
            idx.innerHTML = '<i></i><i></i><i></i>';
          }
        } else if (idx.classList.contains('mini-eq')) {
          idx.classList.remove('mini-eq');
          idx.textContent = String(i + 1);
        }
      }
    }
    audioPanel.classList.toggle(
      'playing',
      isAudioMode() && !video.paused && !!video.currentSrc
    );
    document.body.classList.toggle('playing', !video.paused && !!video.currentSrc);
  }

  // ------------------------------ playback -------------------------------
  function loadItem(i, autoplay, advance) {
    if (autoplay === undefined) autoplay = true;
    const ok = advance ? pl.advanceTo(i) : pl.playIndex(i);
    if (!ok) return;
    const it = current();
    if (!it) return;
    const url = U.toFileUrl(it.path);
    if (video.src !== url) {
      video.src = url;
      video.load();
      stage.classList.remove('switching');
      void stage.offsetWidth;
      stage.classList.add('switching');
    }
    document.title = it.name + ' \u2014 Nova Player';
    setTrackTitle(it.name);
    paintCover(it);
    pushRecents([it.path]);
    savePlaylistSoon();
    renderPlaylist();
    updateStageEmpty();
    updatePlayIcon();
    if (autoplay) video.play().catch(() => { /* user can press play */ });
  }

  // ------------------------------ title & cover ---------------------------
  function setTrackTitle(name) {
    tbTitle.textContent = name || '';
  }

  /** Deterministic hue from a name — drives the per-track cover art. */
  function hueFromName(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 360;
  }

  function paintCover(it) {
    const h1 = hueFromName(it.name);
    audioPanel.style.setProperty('--h1', String(h1));
    audioPanel.style.setProperty('--h2', String((h1 + 65) % 360));
    const bare = it.name.replace(/\.[^.]+$/, '');
    coverLetter.textContent = (bare.charAt(0) || '\u266a').toUpperCase();
    cover.style.animation = 'none';
    void cover.offsetWidth;
    cover.style.animation = '';
  }

  function popPlay() {
    btnPlay.classList.remove('pop');
    void btnPlay.offsetWidth;
    btnPlay.classList.add('pop');
  }

  function togglePlay() {
    if (!video.currentSrc) {
      if (pl.items.length) loadItem(pl.index >= 0 ? pl.index : 0);
      else openFiles(true);
      return;
    }
    popPlay();
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  function nextTrack() {
    if (!pl.items.length) return;
    const n = pl.next();
    if (n >= 0) loadItem(n, true, true);
  }

  function prevTrack() {
    if (!pl.items.length) return;
    if (video.currentTime > 3) {
      video.currentTime = 0;
      return;
    }
    const p = pl.prev();
    if (p >= 0) loadItem(p);
  }

  function seekBy(d) {
    const dur = video.duration;
    if (isFinite(dur) && dur > 0) video.currentTime = U.clamp(video.currentTime + d, 0, dur);
  }

  function seekAbs(t) {
    const dur = video.duration;
    if (isFinite(dur) && dur > 0) video.currentTime = U.clamp(t, 0, dur);
  }

  function changeVol(d) {
    const v = U.clamp((video.muted ? 0 : video.volume) + d, 0, 1);
    video.muted = v <= 0;
    video.volume = v;
  }

  function toggleMute() {
    video.muted = !video.muted;
  }

  function changeRate(dir) {
    const i = RATES.indexOf(video.playbackRate);
    if (i === -1) {
      video.playbackRate = dir > 0 ? 1.25 : 0.75;
      return;
    }
    video.playbackRate = RATES[(i + dir + RATES.length) % RATES.length];
  }

  function toggleShuffle() {
    pl.shuffle = !pl.shuffle;
    btnShuffle.classList.toggle('active', pl.shuffle);
    savePrefsSoon();
  }

  function cycleRepeat() {
    pl.repeat = pl.repeat === 'none' ? 'all' : pl.repeat === 'all' ? 'one' : 'none';
    updateRepeatUi();
    savePrefsSoon();
  }

  function setFs(v) {
    isFs = !!v;
    appRoot.classList.toggle('fs', isFs);
    if (isFs) fsShowChrome();
    else {
      appRoot.classList.remove('idle');
      clearTimeout(idleTimer);
    }
  }

  function toggleFs() {
    const next = !isFs;
    setFs(next);
    try {
      nova.setFullScreen && nova.setFullScreen(next);
    } catch (e) { /* best effort */ }
  }

  /** Fullscreen chrome auto-hides after a moment of inactivity. */
  function fsShowChrome() {
    if (!isFs) return;
    appRoot.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (isFs) appRoot.classList.add('idle');
    }, 2800);
  }

  async function togglePip() {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (video.requestPictureInPicture) await video.requestPictureInPicture();
      else toast('Picture-in-picture is not available for this item.');
    } catch (e) {
      toast('Picture-in-picture is not available for this item.');
    }
  }

  function onEnded() {
    if (pl.repeat === 'one') {
      video.currentTime = 0;
      video.play().catch(() => {});
      return;
    }
    const n = pl.next();
    if (n >= 0) loadItem(n, true, true);
    else {
      updatePlayIcon();
      savePlaylistSoon();
    }
  }

  function onVideoError() {
    if (!video.currentSrc || !video.error) return;
    const it = current();
    const name = it ? it.name : 'the file';
    if (video.error.code === 4) {
      toast(
        'Cannot play ' + name + ' \u2014 this format or codec is not supported by your system. ' +
        '(For HEVC / H.265 files, install the Microsoft HEVC extension or a codec pack.)',
        8000
      );
    } else {
      toast('Playback error for ' + name + ' (code ' + video.error.code + ').', 8000);
    }
  }

  function stopPlayback() {
    video.pause();
    try {
      video.removeAttribute('src');
      video.load();
    } catch (e) { /* best effort */ }
    document.title = 'Nova Player';
    setTrackTitle('');
  }

  // ------------------------------ playlist UI ----------------------------
  function renderPlaylist() {
    const term = plFilter.value.trim().toLowerCase();
    ul.textContent = '';
    const frag = document.createDocumentFragment();
    pl.items.forEach((it, i) => {
      if (term && !it.name.toLowerCase().includes(term)) return;
      const li = document.createElement('li');
      li.className = 'pl-item' + (i === pl.index ? ' active' : '');
      if (i === pl.index && !video.paused && video.currentSrc) li.classList.add('playing');
      li.dataset.index = String(i);
      li.draggable = !term;
      li.title = it.path;

      const idx = document.createElement('span');
      idx.className = 'pl-idx';
      if (li.classList.contains('playing')) {
        idx.classList.add('mini-eq');
        idx.innerHTML = '<i></i><i></i><i></i>';
      } else {
        idx.textContent = String(i + 1);
      }

      const kind = document.createElement('span');
      kind.className = 'pl-kind';
      kind.innerHTML = it.kind === 'audio' ? ICONS.music : ICONS.film;

      const name = document.createElement('span');
      name.className = 'pl-name';
      name.textContent = it.name;

      const tools = document.createElement('span');
      tools.className = 'pl-tools';
      const bShow = document.createElement('button');
      bShow.className = 'pl-tool';
      bShow.type = 'button';
      bShow.title = 'Show in folder';
      bShow.innerHTML = ICONS.folder;
      const bDel = document.createElement('button');
      bDel.className = 'pl-tool del';
      bDel.type = 'button';
      bDel.title = 'Remove from playlist';
      bDel.innerHTML = ICONS.x;
      tools.append(bShow, bDel);

      li.append(idx, kind, name, tools);
      frag.append(li);
    });
    ul.append(frag);
    plCount.textContent = pl.items.length ? String(pl.items.length) : '';
  }

  function removeAt(i) {
    pl.removeAt(i);
    renderPlaylist();
    updateStageEmpty();
    updatePlayIcon();
    savePlaylistSoon();
  }

  function clearPlaylist() {
    if (!pl.items.length) return;
    stopPlayback();
    pl.clear();
    renderPlaylist();
    updateStageEmpty();
    updatePlayIcon();
    savePlaylistSoon();
  }

  // ------------------------------ add / open ------------------------------
  function addFiles(paths, opts) {
    opts = opts || {};
    const wasEmpty = pl.index === -1;
    const list = (paths || []).filter(Boolean).map(entryFor);
    if (!list.length) return;
    const { count, firstIndex } = pl.add(list);
    pushRecents(list.map((e) => e.path).slice(0, 10));
    renderPlaylist();
    updateStageEmpty();
    savePlaylistSoon();
    const start = opts.start === undefined ? wasEmpty : opts.start;
    if (start && count > 0) loadItem(firstIndex);
  }

  async function openFiles(start) {
    try {
      const paths = await nova.openFiles();
      if (paths && paths.length) addFiles(paths, { start: start === undefined ? true : start });
    } catch (e) {
      toast('Could not open the file dialog.');
    }
  }

  async function openFolder() {
    try {
      const res = await nova.openFolder();
      if (!res) return;
      if (res.files.length) {
        addFiles(res.files, { start: true });
        toast(
          res.files.length + ' file' + (res.files.length === 1 ? '' : 's') +
          ' added from ' + U.basename(res.dir)
        );
      } else {
        toast('No media files found in that folder.');
      }
    } catch (e) {
      toast('Could not open the folder dialog.');
    }
  }

  async function importPlaylist() {
    try {
      const paths = await nova.importPlaylist();
      if (paths && paths.length) addFiles(paths, { start: true });
    } catch (e) {
      toast('Could not import the playlist.');
    }
  }

  async function exportPlaylist() {
    if (!pl.items.length) {
      toast('The playlist is empty.');
      return;
    }
    try {
      const p = await nova.savePlaylist({
        name: 'playlist.m3u8',
        entries: pl.items.map((i) => ({ name: i.name, path: i.path }))
      });
      if (p) toast('Saved ' + U.basename(p));
    } catch (e) {
      toast('Could not save the playlist.');
    }
  }

  // ------------------------------ file drop -------------------------------
  function hasFiles(e) {
    return !!(
      e.dataTransfer &&
      e.dataTransfer.types &&
      Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1
    );
  }

  function setDrop(on) {
    $('drop-overlay').classList.toggle('hidden', !on);
  }

  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    dragDepth++;
    setDrop(true);
  });
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) setDrop(false);
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    setDrop(false);
    const paths = [];
    for (const f of e.dataTransfer.files) {
      let p = null;
      try {
        p = nova.fileDropPath ? nova.fileDropPath(f) : null;
      } catch (err) {
        p = null;
      }
      if (p) paths.push(p);
    }
    if (!paths.length) return;
    const onStage = !!(e.target && e.target.closest && e.target.closest('#stage'));
    addFiles(paths, { start: onStage || pl.index === -1 });
  });

  // --------------------------- playlist reordering -------------------------
  ul.addEventListener('dragstart', (e) => {
    const li = e.target.closest ? e.target.closest('li.pl-item') : null;
    if (!li) return;
    dragIndex = parseInt(li.dataset.index, 10);
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(dragIndex));
    } catch (err) { /* required on some platforms */ }
  });
  ul.addEventListener('dragover', (e) => {
    if (dragIndex === null || hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const li = e.target.closest ? e.target.closest('li.pl-item') : null;
    if (!li || li.classList.contains('dragging')) return;
    const rect = li.getBoundingClientRect();
    const before = e.clientY - rect.top < rect.height / 2;
    const dragEl = ul.querySelector('li.dragging');
    if (!dragEl) return;
    if (before) ul.insertBefore(dragEl, li);
    else ul.insertBefore(dragEl, li.nextSibling);
  });
  ul.addEventListener('drop', (e) => {
    if (dragIndex === null) return;
    e.preventDefault();
    e.stopPropagation();
    commitDragOrder();
  });
  ul.addEventListener('dragend', () => {
    if (dragIndex !== null) commitDragOrder();
    dragIndex = null;
    renderPlaylist();
  });

  function commitDragOrder() {
    if (dragIndex === null) return;
    const order = [...ul.querySelectorAll('li.pl-item')].map((li) => parseInt(li.dataset.index, 10));
    const pos = order.indexOf(dragIndex);
    if (pos !== -1 && pos !== dragIndex) {
      pl.move(dragIndex, pos);
      savePlaylistSoon();
    }
  }

  // ------------------------------ keyboard --------------------------------
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const k = e.key;
    if (k === ' ') {
      e.preventDefault();
      togglePlay();
      return;
    }
    switch (k) {
      case 'ArrowLeft': e.preventDefault(); seekBy(-5); break;
      case 'ArrowRight': e.preventDefault(); seekBy(5); break;
      case 'ArrowUp': e.preventDefault(); changeVol(0.05); break;
      case 'ArrowDown': e.preventDefault(); changeVol(-0.05); break;
      case 'j': case 'J': seekBy(-10); break;
      case 'l': case 'L': seekBy(10); break;
      case 'm': case 'M': toggleMute(); break;
      case 'f': case 'F': case 'F11': toggleFs(); break;
      case 's': case 'S': toggleShuffle(); break;
      case 'r': case 'R': cycleRepeat(); break;
      case ',': changeRate(-1); break;
      case '.': changeRate(1); break;
      case 'Home': seekAbs(0); break;
      case 'End': seekAbs(video.duration || 0); break;
      default:
        if (k.length === 1 && k >= '0' && k <= '9') {
          seekAbs((video.duration || 0) * (parseInt(k, 10) / 10));
        }
    }
  });

  // ------------------------------ video events ----------------------------
  video.addEventListener('loadedmetadata', () => {
    timeDur.textContent = U.fmtTime(video.duration);
    seekBuffered.style.width = '0%';
    updateStageEmpty();
  });
  video.addEventListener('durationchange', () => {
    timeDur.textContent = U.fmtTime(video.duration);
  });
  video.addEventListener('progress', () => {
    const d = video.duration;
    if (!isFinite(d) || d <= 0) {
      seekBuffered.style.width = '0%';
      return;
    }
    let end = 0;
    const b = video.buffered;
    for (let i = 0; i < b.length; i++) {
      if (b.start(i) <= video.currentTime + 0.5 && b.end(i) > end) end = b.end(i);
    }
    seekBuffered.style.width = U.clamp((end / d) * 100, 0, 100) + '%';
  });
  video.addEventListener('timeupdate', () => {
    const d = video.duration;
    if (isFinite(d) && d > 0) {
      const pct = (video.currentTime / d) * 1000;
      seek.value = String(pct);
      setFill(seek, pct / 10);
    }
    timeCur.textContent = U.fmtTime(video.currentTime);
  });
  video.addEventListener('play', () => {
    updatePlayIcon();
    markPlaying();
    updateStageEmpty();
  });
  video.addEventListener('pause', () => {
    updatePlayIcon();
    markPlaying();
    updateStageEmpty();
  });
  video.addEventListener('waiting', () => spinner.classList.remove('hidden'));
  video.addEventListener('playing', () => spinner.classList.add('hidden'));
  video.addEventListener('canplay', () => spinner.classList.add('hidden'));
  video.addEventListener('volumechange', () => {
    updateVolUi();
    savePrefsSoon();
  });
  video.addEventListener('ratechange', () => {
    btnRate.textContent = rateLabel(video.playbackRate);
    refreshSpeedPop();
    savePrefsSoon();
  });
  video.addEventListener('ended', onEnded);
  video.addEventListener('error', onVideoError);

  // ------------------------------ control wiring ---------------------------
  seek.addEventListener('input', () => {
    const d = video.duration;
    if (!isFinite(d) || d <= 0) return;
    const t = (parseFloat(seek.value) / 1000) * d;
    timeCur.textContent = U.fmtTime(t);
    setFill(seek, parseFloat(seek.value) / 10);
  });
  seek.addEventListener('change', () => {
    const d = video.duration;
    if (isFinite(d) && d > 0) video.currentTime = (parseFloat(seek.value) / 1000) * d;
  });

  vol.addEventListener('input', () => {
    const v = parseFloat(vol.value) / 100;
    video.volume = v;
    video.muted = v <= 0;
    setFill(vol, parseFloat(vol.value));
  });

  // ------------------------------ speed popover ----------------------------
  function buildSpeedPop() {
    speedPop.textContent = '';
    for (const r of RATES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.rate = String(r);
      b.innerHTML = '<span>' + rateLabel(r) + '</span><span class="chk">' + ICONS.check + '</span>';
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        video.playbackRate = r;
        closeSpeedPop();
      });
      speedPop.append(b);
    }
    refreshSpeedPop();
  }

  function refreshSpeedPop() {
    for (const b of speedPop.children) {
      b.classList.toggle('on', parseFloat(b.dataset.rate) === video.playbackRate);
    }
    btnRate.textContent = rateLabel(video.playbackRate);
  }

  function toggleSpeedPop() {
    const willOpen = speedPop.classList.contains('hidden');
    speedPop.classList.toggle('hidden', !willOpen);
    if (willOpen) refreshSpeedPop();
  }

  function closeSpeedPop() {
    speedPop.classList.add('hidden');
  }

  // ------------------------------ window chrome ----------------------------
  function applyWindowState(st) {
    if (!st) return;
    if (typeof st.maximized === 'boolean') {
      wcMax.innerHTML = st.maximized ? ICONS.restore : ICONS.maximize;
    }
    if (typeof st.fullscreen === 'boolean' && st.fullscreen !== isFs) {
      setFs(st.fullscreen);
    }
  }

  btnPlay.addEventListener('click', togglePlay);
  btnPrev.addEventListener('click', prevTrack);
  btnNext.addEventListener('click', nextTrack);
  btnShuffle.addEventListener('click', toggleShuffle);
  btnRepeat.addEventListener('click', cycleRepeat);
  btnMute.addEventListener('click', toggleMute);
  btnRate.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSpeedPop();
  });
  btnPip.addEventListener('click', togglePip);
  btnFs.addEventListener('click', toggleFs);
  wcMin.addEventListener('click', () => { nova.minimize && nova.minimize(); });
  wcMax.addEventListener('click', () => { nova.toggleMaximize && nova.toggleMaximize(); });
  wcClose.addEventListener('click', () => { nova.closeWindow && nova.closeWindow(); });
  topbar.addEventListener('dblclick', (e) => {
    if (e.target.closest && e.target.closest('button, input, a')) return;
    nova.toggleMaximize && nova.toggleMaximize();
  });
  window.addEventListener('mousemove', fsShowChrome);
  document.addEventListener('click', (e) => {
    if (!speedWrap.contains(e.target)) closeSpeedPop();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSpeedPop();
  });
  if (nova.onWindowState) nova.onWindowState(applyWindowState);
  $('btn-open-files').addEventListener('click', () => openFiles(true));
  $('btn-open-folder').addEventListener('click', openFolder);
  $('btn-playlist-toggle').addEventListener('click', () => appRoot.classList.toggle('no-pl'));
  $('btn-pl-add').addEventListener('click', () => openFiles(undefined));
  $('btn-pl-save').addEventListener('click', exportPlaylist);
  $('btn-pl-import').addEventListener('click', importPlaylist);
  $('btn-pl-clear').addEventListener('click', clearPlaylist);
  plFilter.addEventListener('input', renderPlaylist);

  stage.addEventListener('dblclick', (e) => {
    if (e.target === stage || e.target === video) toggleFs();
  });

  ul.addEventListener('click', (e) => {
    const li = e.target.closest ? e.target.closest('li.pl-item') : null;
    if (!li) return;
    const i = parseInt(li.dataset.index, 10);
    if (e.target.closest('.pl-del')) {
      removeAt(i);
      return;
    }
    if (e.target.closest('.pl-show')) {
      const it = pl.items[i];
      if (it && nova.showInFolder) {
        try {
          nova.showInFolder(it.path);
        } catch (err) { /* best effort */ }
      }
      return;
    }
    if (i === pl.index) {
      togglePlay();
      return;
    }
    loadItem(i);
  });

  // ------------------------------ menu & media keys ------------------------
  if (nova.onMenuAction) {
    nova.onMenuAction((a) => {
      if (a === 'openFiles') openFiles(true);
      else if (a === 'openFolder') openFolder();
      else if (a === 'importPlaylist') importPlaylist();
      else if (a === 'exportPlaylist') exportPlaylist();
      else if (a === 'toggleFullScreen') toggleFs();
    });
  }
  if (nova.onShortcut) {
    nova.onShortcut((a) => {
      if (a === 'play-pause') togglePlay();
      else if (a === 'next') nextTrack();
      else if (a === 'prev') prevTrack();
      else if (a === 'stop') {
        video.pause();
        video.currentTime = 0;
      }
    });
  }

  // ------------------------------ static icons -----------------------------
  function setStaticIcons() {
    btnShuffle.innerHTML = ICONS.shuffle;
    btnRepeat.innerHTML = ICONS.repeat;
    repeatBadge = document.createElement('span');
    repeatBadge.className = 'repeat-badge hidden';
    repeatBadge.textContent = '1';
    btnRepeat.append(repeatBadge);
    btnPip.innerHTML = ICONS.pip;
    btnFs.innerHTML = ICONS.fs;
    btnPrev.innerHTML = ICONS.prev;
    btnNext.innerHTML = ICONS.next;
    wcMin.innerHTML = ICONS.minimize;
    wcMax.innerHTML = ICONS.maximize;
    wcClose.innerHTML = ICONS.close;
    buildSpeedPop();
    updatePlayIcon();
    updateVolUi();
    $('btn-open-files').insertAdjacentHTML('afterbegin', ICONS.folder + '<span>Open files</span>');
    $('btn-open-folder').insertAdjacentHTML('afterbegin', ICONS.folder + '<span>Open folder</span>');
    $('btn-playlist-toggle').innerHTML = ICONS.list;
    $('btn-pl-add').innerHTML = ICONS.plus;
    $('btn-pl-save').innerHTML = ICONS.save;
    $('btn-pl-import').innerHTML = ICONS.upload;
    $('btn-pl-clear').innerHTML = ICONS.trash;
  }

  // ------------------------------ boot -------------------------------------
  async function boot() {
    setStaticIcons();

    try {
      const st = (await nova.loadState()) || {};
      if (typeof st.volume === 'number') video.volume = U.clamp(st.volume, 0, 1);
      if (typeof st.muted === 'boolean') video.muted = st.muted;
      if (typeof st.rate === 'number' && st.rate > 0 && st.rate <= 4) video.playbackRate = st.rate;
      pl.shuffle = !!st.shuffle;
      if (st.repeat === 'all' || st.repeat === 'one') pl.repeat = st.repeat;
    } catch (e) { /* start fresh */ }

    try {
      const r = await nova.loadRecent();
      if (Array.isArray(r)) recent = r;
    } catch (e) { /* no recents */ }

    try {
      const st = (await nova.loadState()) || {};
      const last = Array.isArray(st.lastPlaylist)
        ? st.lastPlaylist.filter((p) => typeof p === 'string' && p.length)
        : [];
      if (last.length) {
        pl.add(last.map(entryFor));
        const idx = Number.isInteger(st.lastIndex) && st.lastIndex >= 0 && st.lastIndex < last.length
          ? st.lastIndex
          : 0;
        pl.playIndex(idx);
        const it = current();
        if (it) {
          video.src = U.toFileUrl(it.path);
          document.title = it.name + ' \u2014 Nova Player';
          setTrackTitle(it.name);
          paintCover(it);
          const resumeAt = Number.isFinite(st.lastPosition) ? st.lastPosition : 0;
          video.addEventListener('loadedmetadata', function once() {
            video.removeEventListener('loadedmetadata', once);
            if (resumeAt > 0 && isFinite(video.duration) && video.duration > 0) {
              video.currentTime = Math.min(resumeAt, Math.max(0, video.duration - 0.5));
            }
            updateStageEmpty();
          });
          video.load();
        }
      }
    } catch (e) {
      console.error('[nova] restore failed:', e);
    }

    btnShuffle.classList.toggle('active', pl.shuffle);
    updateRepeatUi();
    btnRate.textContent = rateLabel(video.playbackRate);
    updateVolUi();
    updatePlayIcon();
    renderPlaylist();
    updateStageEmpty();
  }

  boot();
})();
