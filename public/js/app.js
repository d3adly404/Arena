/* ═══════════════════════════════════════════════════════════════
   NOVASE BROWSER — Core Application
   ═══════════════════════════════════════════════════════════════ */

// ── Canvas roundRect polyfill ───────────────────────────────────
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
    let r = typeof radii === 'number' ? radii : (Array.isArray(radii) ? radii[0] : 0);
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

// ── Detect Electron ─────────────────────────────────────────────
const IS_ELECTRON = !!(window.novaseDesktop && window.novaseDesktop.isElectron);

// ── State ───────────────────────────────────────────────────────
const state = {
  tabs: [],
  activeTabId: null,
  currentEngine: 'google',
  bookmarks: JSON.parse(localStorage.getItem('novase_bookmarks') || '[]'),
  history: JSON.parse(localStorage.getItem('novase_history') || '[]'),
  theme: localStorage.getItem('novase_theme') || 'dark',
  activeDownloads: new Map(),
  navigating: false,
};

const SEARCH_ENGINES = {
  google:     { name: 'Google',       icon: '🔍', search: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  bing:       { name: 'Bing',         icon: '🔎', search: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  duckduckgo: { name: 'DuckDuckGo',   icon: '🦆', search: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  yahoo:      { name: 'Yahoo',        icon: '🟣', search: (q) => `https://search.yahoo.com/search?p=${encodeURIComponent(q)}` },
  brave:      { name: 'Brave Search', icon: '🦁', search: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}` },
  ecosia:     { name: 'Ecosia',       icon: '🌱', search: (q) => `https://www.ecosia.org/search?q=${encodeURIComponent(q)}` },
  yandex:     { name: 'Yandex',       icon: '🔴', search: (q) => `https://yandex.com/search/?text=${encodeURIComponent(q)}` },
  startpage:  { name: 'Startpage',    icon: '🔒', search: (q) => `https://www.startpage.com/do/search?q=${encodeURIComponent(q)}` },
};

// ── Browser element helpers ─────────────────────────────────────
function getBrowserView() {
  return IS_ELECTRON
    ? document.getElementById('browser-webview')
    : document.getElementById('browser-frame');
}

function setBrowserURL(url) {
  const loadingBar = document.getElementById('loading-bar');
  if (loadingBar) loadingBar.className = 'loading-bar active';

  if (IS_ELECTRON) {
    const wv = document.getElementById('browser-webview');
    const iframe = document.getElementById('browser-frame');
    wv.style.display = '';
    iframe.style.display = 'none';
    wv.src = url;
  } else {
    document.getElementById('browser-frame').src = url;
  }
}

function getBrowserURL() {
  if (IS_ELECTRON) {
    const wv = document.getElementById('browser-webview');
    try { return wv.getURL(); } catch(e) { return ''; }
  }
  const iframe = document.getElementById('browser-frame');
  try { return iframe.contentWindow.location.href; } catch(e) { return ''; }
}

function browserGoBack() {
  if (IS_ELECTRON) {
    const wv = document.getElementById('browser-webview');
    if (wv.canGoBack()) wv.goBack();
  } else {
    try { document.getElementById('browser-frame').contentWindow.history.back(); } catch(e) {}
  }
}

function browserGoForward() {
  if (IS_ELECTRON) {
    const wv = document.getElementById('browser-webview');
    if (wv.canGoForward()) wv.goForward();
  } else {
    try { document.getElementById('browser-frame').contentWindow.history.forward(); } catch(e) {}
  }
}

function browserReload() {
  if (IS_ELECTRON) {
    document.getElementById('browser-webview').reload();
  } else {
    const iframe = document.getElementById('browser-frame');
    try { iframe.contentWindow.location.reload(); } catch(e) { iframe.src = iframe.src; }
  }
}

function hideLoadingBar() {
  const lb = document.getElementById('loading-bar');
  if (lb) {
    lb.className = 'loading-bar done';
    setTimeout(() => { lb.className = 'loading-bar'; }, 500);
  }
}

// ── DOM Ready ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initTabs();
  initSearchEngine();
  initNavigation();
  initPanels();
  initGames();
  initDownloads();
  initSettings();
  initKeyboardShortcuts();
  createNewTab();
  initBrowserViewEvents();
});

// ── Browser View Events ─────────────────────────────────────────
function initBrowserViewEvents() {
  if (IS_ELECTRON) {
    const wv = document.getElementById('browser-webview');

    wv.addEventListener('did-start-loading', () => {
      const lb = document.getElementById('loading-bar');
      if (lb) lb.className = 'loading-bar active';
    });

    wv.addEventListener('did-stop-loading', () => {
      hideLoadingBar();
    });

    wv.addEventListener('did-finish-load', () => {
      hideLoadingBar();
      // Update tab title and URL from the webview
      const tab = state.tabs.find(t => t.id === state.activeTabId);
      if (tab) {
        try {
          const title = wv.getTitle();
          if (title) {
            tab.title = title.substring(0, 40);
            renderTabs();
            document.title = tab.title + ' — Novase';
          }
        } catch(e) {}
        try {
          const url = wv.getURL();
          if (url && url !== 'about:blank') {
            tab.url = url;
            document.getElementById('url-input').value = url;
          }
        } catch(e) {}
      }
    });

    wv.addEventListener('page-title-updated', (e) => {
      const tab = state.tabs.find(t => t.id === state.activeTabId);
      if (tab && e.title) {
        tab.title = e.title.substring(0, 40);
        renderTabs();
        document.title = tab.title + ' — Novase';
      }
    });

    wv.addEventListener('did-navigate', (e) => {
      const tab = state.tabs.find(t => t.id === state.activeTabId);
      if (tab && e.url && e.url !== 'about:blank') {
        tab.url = e.url;
        document.getElementById('url-input').value = e.url;
      }
    });

    wv.addEventListener('did-fail-load', (e) => {
      hideLoadingBar();
      // Ignore aborted loads (e.g., user navigated away)
      if (e.errorCode === -3) return; // ERR_ABORTED
      if (e.isMainFrame && e.errorCode !== -27) { // -27 = ERR_BLOCKED_BY_RESPONSE
        console.error('Webview load failed:', e.errorCode, e.errorDescription);
      }
    });

    wv.addEventListener('new-window', (e) => {
      // Open popups in the webview itself
      e.preventDefault();
      if (e.url && e.url !== 'about:blank') {
        navigateTo(e.url);
      }
    });

    // Handle certificate errors and blocked responses gracefully
    wv.addEventListener('did-get-response-details', (e) => {
      // Track response details if needed
    });

  } else {
    // Web browser iframe events
    const iframe = document.getElementById('browser-frame');
    iframe.addEventListener('load', () => {
      hideLoadingBar();
      const tab = state.tabs.find(t => t.id === state.activeTabId);
      if (tab && tab.url) {
        try {
          const docTitle = iframe.contentDocument?.title;
          if (docTitle) {
            tab.title = docTitle.substring(0, 40);
            renderTabs();
            document.title = tab.title + ' — Novase';
          }
        } catch (e) { /* cross-origin, expected */ }
      }
    });
    iframe.addEventListener('error', () => {
      hideLoadingBar();
      const tab = state.tabs.find(t => t.id === state.activeTabId);
      if (tab && tab.url) showIframeError(tab.url);
    });
  }
}

// ── Theme ───────────────────────────────────────────────────────
function initTheme() {
  applyTheme(state.theme);
  const select = document.getElementById('theme-select');
  if (select) select.value = state.theme;
}

function applyTheme(theme) {
  document.body.className = '';
  if (theme !== 'dark') document.body.classList.add(`theme-${theme}`);
  state.theme = theme;
  localStorage.setItem('novase_theme', theme);
}

// ── Tab Management ──────────────────────────────────────────────
function initTabs() {
  document.getElementById('btn-new-tab').addEventListener('click', () => createNewTab());
}

function createNewTab(url) {
  const id = 'tab_' + Date.now();
  const tab = { id, title: 'New Tab', url: url || '', favicon: '' };
  state.tabs.push(tab);
  renderTabs();
  activateTab(id);
  if (url) navigateTo(url);
}

function renderTabs() {
  const container = document.getElementById('tabs-container');
  container.innerHTML = '';
  state.tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === state.activeTabId ? ' active' : '');
    el.dataset.tabId = tab.id;
    el.innerHTML =
      (tab.favicon ? '<img class="tab-favicon" src="' + tab.favicon + '" alt="">' : '<span style="font-size:12px">🌐</span>') +
      '<span class="tab-title">' + escapeHtml(tab.title) + '</span>' +
      '<span class="tab-close" data-close-tab="' + tab.id + '">×</span>';
    el.addEventListener('click', (e) => {
      if (e.target.closest('.tab-close')) closeTab(tab.id);
      else activateTab(tab.id);
    });
    container.appendChild(el);
  });
}

function activateTab(id) {
  state.activeTabId = id;
  const tab = state.tabs.find(t => t.id === id);
  renderTabs();

  const urlInput = document.getElementById('url-input');
  if (tab) {
    urlInput.value = tab.url || '';
    document.title = tab.title + ' — Novase';
  }

  const ntp = document.getElementById('new-tab-page');
  const frameContainer = document.getElementById('browser-frame-container');

  hideAllPanels();

  if (!tab || !tab.url) {
    ntp.style.display = '';
    frameContainer.style.display = 'none';
    // Clear browser views
    if (IS_ELECTRON) {
      document.getElementById('browser-webview').src = 'about:blank';
    } else {
      document.getElementById('browser-frame').src = 'about:blank';
    }
  } else {
    ntp.style.display = 'none';
    frameContainer.style.display = '';
    // Only navigate if URL changed
    const currentURL = getBrowserURL();
    if (currentURL !== tab.url) {
      setBrowserURL(tab.url);
    }
  }
}

function closeTab(id) {
  const idx = state.tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  state.tabs.splice(idx, 1);
  if (state.tabs.length === 0) createNewTab();
  else if (state.activeTabId === id) activateTab(state.tabs[Math.min(idx, state.tabs.length - 1)].id);
  else renderTabs();
}

// ── Navigation ──────────────────────────────────────────────────
function initNavigation() {
  const urlInput = document.getElementById('url-input');
  const goBtn = document.getElementById('btn-go');

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = urlInput.value.trim();
      if (val) navigateTo(val);
    }
  });
  goBtn.addEventListener('click', () => {
    const val = urlInput.value.trim();
    if (val) navigateTo(val);
  });

  document.getElementById('btn-back').addEventListener('click', () => browserGoBack());
  document.getElementById('btn-forward').addEventListener('click', () => browserGoForward());
  document.getElementById('btn-refresh').addEventListener('click', () => browserReload());
  document.getElementById('btn-home').addEventListener('click', () => goHome());

  // NTP search
  const ntpInput = document.getElementById('ntp-search-input');
  const ntpBtn = document.getElementById('ntp-search-btn');
  ntpInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = ntpInput.value.trim();
      if (val) navigateTo(val);
    }
  });
  ntpBtn.addEventListener('click', () => {
    const val = ntpInput.value.trim();
    if (val) navigateTo(val);
  });

  // Shortcuts
  document.querySelectorAll('.ntp-shortcut').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.url));
  });

  // Media detect button
  document.getElementById('btn-detect-media').addEventListener('click', () => {
    showPanel('downloads');
    const url = document.getElementById('url-input').value.trim();
    if (url) {
      document.getElementById('media-url-input').value = url;
      fetchMediaInfo(url);
    }
  });
}

function navigateTo(input) {
  if (!input || state.navigating) return;
  state.navigating = true;

  try {
    let url = input.trim();

    if (isURL(url)) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
    } else {
      url = SEARCH_ENGINES[state.currentEngine].search(url);
    }

    const tab = state.tabs.find(t => t.id === state.activeTabId);
    if (tab) {
      tab.url = url;
      tab.title = extractDomain(url);
    }

    document.getElementById('url-input').value = url;
    document.getElementById('new-tab-page').style.display = 'none';
    document.getElementById('browser-frame-container').style.display = '';
    hideAllPanels();

    setBrowserURL(url);
    renderTabs();
    addToHistory(url, tab ? tab.title : '');
    document.title = (tab ? tab.title : 'Loading') + ' — Novase';
  } catch (err) {
    console.error('Navigation error:', err);
    showToast('Navigation failed', 'error');
  } finally {
    setTimeout(() => { state.navigating = false; }, 200);
  }
}

function goHome() {
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (tab) {
    tab.url = '';
    tab.title = 'New Tab';
    tab.favicon = '';
    renderTabs();
  }
  document.getElementById('url-input').value = '';
  document.getElementById('new-tab-page').style.display = '';
  document.getElementById('browser-frame-container').style.display = 'none';
  if (IS_ELECTRON) {
    document.getElementById('browser-webview').src = 'about:blank';
  } else {
    document.getElementById('browser-frame').src = 'about:blank';
  }
  hideAllPanels();
  document.title = 'Novase Browser';
}

function isURL(str) {
  if (/\s/.test(str)) return false;
  if (/^https?:\/\//i.test(str)) return true;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/|$)/.test(str)) return true;
  if (/^localhost(:\d+)?(\/|$)/i.test(str)) return true;
  if (/^[\w-]+\.[\w-]{2,}(\/.*)?$/.test(str)) return true;
  return false;
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch(e) { return url.substring(0, 30); }
}

function showIframeError(url) {
  const container = document.getElementById('browser-frame-container');
  if (container.querySelector('.iframe-error-overlay')) return;

  const safeUrl = escapeHtml(url);
  const overlay = document.createElement('div');
  overlay.className = 'iframe-error-overlay';
  overlay.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg-primary);z-index:10;';
  overlay.innerHTML =
    '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin-bottom:16px;opacity:0.5">' +
      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' +
    '</svg>' +
    '<h3 style="color:var(--text-primary);margin-bottom:8px;">Site cannot be displayed</h3>' +
    '<p style="color:var(--text-muted);font-size:13px;max-width:400px;text-align:center;margin-bottom:20px;">' +
      'This website blocks being loaded inside another page.' +
    '</p>' +
    '<div style="display:flex;gap:10px;">' +
      '<button class="btn-primary" id="iframe-open-ext" style="padding:8px 20px;">Open in System Browser</button>' +
      '<button class="btn-primary" id="iframe-retry" style="padding:8px 20px;background:var(--bg-tertiary);color:var(--text-secondary);border:1px solid var(--border-color);">Try Again</button>' +
    '</div>';
  container.appendChild(overlay);
  overlay.querySelector('#iframe-open-ext').addEventListener('click', () => { window.open(url, '_blank'); overlay.remove(); });
  overlay.querySelector('#iframe-retry').addEventListener('click', () => { overlay.remove(); setBrowserURL(url); });
}

// ── Search Engine ───────────────────────────────────────────────
function initSearchEngine() {
  const btn = document.getElementById('search-engine-btn');
  const dropdown = document.getElementById('engine-dropdown');

  const saved = localStorage.getItem('novase_engine');
  if (saved && SEARCH_ENGINES[saved]) state.currentEngine = saved;
  updateEngineDisplay();

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === 'none' ? '' : 'none';
  });
  document.addEventListener('click', () => { dropdown.style.display = 'none'; });

  dropdown.querySelectorAll('.engine-option').forEach(opt => {
    opt.addEventListener('click', () => {
      state.currentEngine = opt.dataset.engine;
      localStorage.setItem('novase_engine', state.currentEngine);
      updateEngineDisplay();
      dropdown.style.display = 'none';
    });
  });
  updateEngineDropdownActive();
}

function updateEngineDisplay() {
  const engine = SEARCH_ENGINES[state.currentEngine];
  document.getElementById('current-engine-name').textContent = engine.name;
  document.getElementById('ntp-engine-icon').textContent = engine.icon;
  updateEngineDropdownActive();
}

function updateEngineDropdownActive() {
  document.querySelectorAll('.engine-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.engine === state.currentEngine);
  });
}

// ── Panels ──────────────────────────────────────────────────────
function initPanels() {
  document.getElementById('btn-games').addEventListener('click', () => togglePanel('games'));
  document.getElementById('btn-downloads').addEventListener('click', () => togglePanel('downloads'));
  document.getElementById('btn-bookmarks').addEventListener('click', () => togglePanel('bookmarks'));
  document.getElementById('btn-settings').addEventListener('click', () => togglePanel('settings'));

  document.getElementById('close-games').addEventListener('click', () => hidePanel('games'));
  document.getElementById('close-downloads').addEventListener('click', () => hidePanel('downloads'));
  document.getElementById('close-bookmarks').addEventListener('click', () => hidePanel('bookmarks'));
  document.getElementById('close-settings').addEventListener('click', () => hidePanel('settings'));

  document.getElementById('qa-games')?.addEventListener('click', () => showPanel('games'));
  document.getElementById('qa-downloader')?.addEventListener('click', () => showPanel('downloads'));
  document.getElementById('qa-bookmarks')?.addEventListener('click', () => showPanel('bookmarks'));
  document.getElementById('qa-history')?.addEventListener('click', () => showPanel('bookmarks'));
}

function togglePanel(name) {
  const panel = document.getElementById(name + '-panel');
  if (panel.style.display === 'none') showPanel(name);
  else hidePanel(name);
}

function showPanel(name) {
  hideAllPanels();
  document.getElementById(name + '-panel').style.display = '';
  document.getElementById('new-tab-page').style.display = 'none';
  document.getElementById('browser-frame-container').style.display = 'none';
  if (name === 'downloads') refreshDownloads();
  if (name === 'bookmarks') renderBookmarks();
}

function hidePanel(name) {
  document.getElementById(name + '-panel').style.display = 'none';
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (tab && tab.url) {
    document.getElementById('new-tab-page').style.display = 'none';
    document.getElementById('browser-frame-container').style.display = '';
  } else {
    document.getElementById('new-tab-page').style.display = '';
    document.getElementById('browser-frame-container').style.display = 'none';
  }
}

function hideAllPanels() {
  ['games', 'downloads', 'bookmarks', 'settings'].forEach(name => {
    document.getElementById(name + '-panel').style.display = 'none';
  });
}

// ── Bookmarks ───────────────────────────────────────────────────
function addToHistory(url, title) {
  state.history.unshift({ url, title, time: Date.now() });
  if (state.history.length > 200) state.history.pop();
  localStorage.setItem('novase_history', JSON.stringify(state.history));
}

function renderBookmarks() {
  const container = document.getElementById('bookmarks-content');
  if (state.bookmarks.length === 0) {
    container.innerHTML = '<p class="empty-state">No bookmarks yet. Press Ctrl+D to bookmark the current page.</p>';
    return;
  }
  container.innerHTML = state.bookmarks.map((bm, i) =>
    '<div class="bookmark-item" data-url="' + escapeHtml(bm.url) + '">' +
      '<span style="font-size:16px">🔖</span>' +
      '<span class="bm-title">' + escapeHtml(bm.title) + '</span>' +
      '<span class="bm-url">' + escapeHtml(extractDomain(bm.url)) + '</span>' +
      '<button class="bm-remove" data-bm-idx="' + i + '">✕</button>' +
    '</div>'
  ).join('');

  container.querySelectorAll('.bookmark-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.bm-remove')) {
        const idx = parseInt(e.target.closest('.bm-remove').dataset.bmIdx);
        state.bookmarks.splice(idx, 1);
        localStorage.setItem('novase_bookmarks', JSON.stringify(state.bookmarks));
        renderBookmarks();
        return;
      }
      navigateTo(el.dataset.url);
      hidePanel('bookmarks');
    });
  });
}

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'd') {
      e.preventDefault();
      const tab = state.tabs.find(t => t.id === state.activeTabId);
      if (tab && tab.url) {
        if (!state.bookmarks.find(b => b.url === tab.url)) {
          state.bookmarks.push({ url: tab.url, title: tab.title });
          localStorage.setItem('novase_bookmarks', JSON.stringify(state.bookmarks));
          showToast('Bookmark added!', 'success');
        } else showToast('Already bookmarked', 'info');
      }
    }
    if (e.ctrlKey && e.key === 't') { e.preventDefault(); createNewTab(); }
    if (e.ctrlKey && e.key === 'w') { e.preventDefault(); if (state.activeTabId) closeTab(state.activeTabId); }
    if (e.ctrlKey && e.key === 'l') { e.preventDefault(); document.getElementById('url-input').focus(); document.getElementById('url-input').select(); }
  });
}

// ═══════════════════════════════════════════════════════════════
//  GAMES ENGINE (unchanged — kept in full)
// ═══════════════════════════════════════════════════════════════

let currentGame = null;
let gameLoop = null;
let gameScore = 0;

function initGames() {
  document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => launchGame(card.dataset.game));
  });
  document.getElementById('game-back-btn').addEventListener('click', () => stopGame());
}

function launchGame(game) {
  currentGame = game;
  gameScore = 0;
  document.getElementById('game-score').textContent = '0';
  document.getElementById('games-grid').style.display = 'none';
  document.getElementById('game-container').style.display = '';
  document.getElementById('game-title').textContent = getGameName(game);
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 600;
  canvas.height = 500;
  switch(game) {
    case 'snake': initSnakeGame(canvas, ctx); break;
    case 'tetris': initTetrisGame(canvas, ctx); break;
    case '2048': init2048Game(canvas, ctx); break;
    case 'breakout': initBreakoutGame(canvas, ctx); break;
    case 'flappy': initFlappyGame(canvas, ctx); break;
    case 'minesweeper': initMinesweeperGame(canvas, ctx); break;
  }
}

function getGameName(g) { return { snake:'Snake', tetris:'Tetris', '2048':'2048', breakout:'Breakout', flappy:'Flappy Bird', minesweeper:'Minesweeper' }[g] || g; }

function stopGame() {
  if (gameLoop) { cancelAnimationFrame(gameLoop); clearTimeout(gameLoop); clearInterval(gameLoop); gameLoop = null; }
  document.onkeydown = null;
  document.getElementById('games-grid').style.display = '';
  document.getElementById('game-container').style.display = 'none';
  currentGame = null;
}

function getGameControls(g) {
  return { snake:'🎮 Arrow Keys / WASD to move', tetris:'🎮 ← → move, ↑ rotate, ↓ drop, Space hard drop', '2048':'🎮 Arrow Keys to slide tiles', breakout:'🎮 ← → paddle, Space launch', flappy:'🎮 Space / ↑ to flap', minesweeper:'🎮 Click reveal, Right-click flag' }[g] || '';
}

// ── Snake ───────────────────────────────────────────────────────
function initSnakeGame(canvas, ctx) {
  document.getElementById('game-controls-hint').textContent = getGameControls('snake');
  const grid = 20, cols = Math.floor(canvas.width / grid), rows = Math.floor(canvas.height / grid);
  let snake = [{x:10,y:10},{x:9,y:10},{x:8,y:10}], dir = {x:1,y:0}, nextDir = {x:1,y:0}, food = spawn(), speed = 120, alive = true;
  function spawn() { let p; do { p = {x:Math.floor(Math.random()*cols),y:Math.floor(Math.random()*rows)}; } while (snake.some(s=>s.x===p.x&&s.y===p.y)); return p; }
  document.onkeydown = (e) => { const k=e.key.toLowerCase(); if((k==='arrowup'||k==='w')&&dir.y===0) nextDir={x:0,y:-1}; if((k==='arrowdown'||k==='s')&&dir.y===0) nextDir={x:0,y:1}; if((k==='arrowleft'||k==='a')&&dir.x===0) nextDir={x:-1,y:0}; if((k==='arrowright'||k==='d')&&dir.x===0) nextDir={x:1,y:0}; };
  function update() { if(!alive||currentGame!=='snake') return; dir=nextDir; const h={x:snake[0].x+dir.x,y:snake[0].y+dir.y}; if(h.x<0||h.x>=cols||h.y<0||h.y>=rows||snake.some(s=>s.x===h.x&&s.y===h.y)){alive=false;drawOver();return;} snake.unshift(h); if(h.x===food.x&&h.y===food.y){gameScore+=10;document.getElementById('game-score').textContent=gameScore;food=spawn();if(speed>60)speed-=2;} else snake.pop(); draw(); gameLoop=setTimeout(update,speed); }
  function draw() { ctx.fillStyle='#0a0a1a'; ctx.fillRect(0,0,canvas.width,canvas.height); snake.forEach((s,i)=>{ctx.fillStyle=`rgb(${108-i*2},${92-i*2},${231-i*3})`;ctx.beginPath();ctx.roundRect(s.x*grid+2,s.y*grid+2,grid-4,grid-4,4);ctx.fill();}); ctx.fillStyle='#fd79a8';ctx.shadowColor='#fd79a8';ctx.shadowBlur=15;ctx.beginPath();ctx.arc(food.x*grid+grid/2,food.y*grid+grid/2,grid/2-2,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0; }
  function drawOver() { ctx.fillStyle='rgba(10,10,26,0.85)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fd79a8';ctx.font='bold 36px Inter';ctx.textAlign='center';ctx.fillText('Game Over!',canvas.width/2,canvas.height/2-20);ctx.fillStyle='#a29bfe';ctx.font='20px Inter';ctx.fillText('Score: '+gameScore,canvas.width/2,canvas.height/2+20);ctx.fillStyle='#6666aa';ctx.font='14px Inter';ctx.fillText('Press Space to restart',canvas.width/2,canvas.height/2+55);document.onkeydown=(e)=>{if(e.code==='Space'){e.preventDefault();launchGame('snake');}}; }
  draw(); gameLoop=setTimeout(update,speed);
}

// ── Tetris ──────────────────────────────────────────────────────
function initTetrisGame(canvas, ctx) {
  document.getElementById('game-controls-hint').textContent = getGameControls('tetris');
  const C=10,R=20,B=28; canvas.width=C*B+150; canvas.height=R*B;
  const COLS=['#6c5ce7','#fd79a8','#00b894','#fdcb6e','#e17055','#74b9ff','#a29bfe'];
  const SHAPES=[[[1,1,1,1]],[[1,1],[1,1]],[[0,1,0],[1,1,1]],[[1,0,0],[1,1,1]],[[0,0,1],[1,1,1]],[[1,1,0],[0,1,1]],[[0,1,1],[1,1,0]]];
  let board=Array.from({length:R},()=>Array(C).fill(0)), piece=mk(), next=mk(), dropT=0, dropI=500, last=0, over=false;
  function mk(){const i=Math.floor(Math.random()*SHAPES.length);return{shape:SHAPES[i].map(r=>[...r]),color:COLS[i],x:Math.floor(C/2)-1,y:0};}
  function col(s,ox,oy){for(let r=0;r<s.length;r++)for(let c=0;c<s[r].length;c++)if(s[r][c]){const nx=piece.x+c+ox,ny=piece.y+r+oy;if(nx<0||nx>=C||ny>=R)return true;if(ny>=0&&board[ny][nx])return true;}return false;}
  function merge(){piece.shape.forEach((row,r)=>row.forEach((v,c)=>{if(v&&piece.y+r>=0)board[piece.y+r][piece.x+c]=piece.color;}));}
  function clear(){let cl=0;for(let r=R-1;r>=0;r--){if(board[r].every(c=>c)){board.splice(r,1);board.unshift(Array(C).fill(0));cl++;r++;}}if(cl){gameScore+=[0,100,300,500,800][cl]||cl*200;document.getElementById('game-score').textContent=gameScore;if(dropI>100)dropI-=cl*10;}}
  function rot(){const rt=piece.shape[0].map((_,i)=>piece.shape.map(row=>row[i]).reverse());if(!col(rt,0,0))piece.shape=rt;}
  document.onkeydown=(e)=>{if(over){if(e.code==='Space'){e.preventDefault();launchGame('tetris');}return;}if(e.key==='ArrowLeft'&&!col(piece.shape,-1,0))piece.x--;if(e.key==='ArrowRight'&&!col(piece.shape,1,0))piece.x++;if(e.key==='ArrowDown'&&!col(piece.shape,0,1)){piece.y++;gameScore++;}if(e.key==='ArrowUp')rot();if(e.code==='Space'){e.preventDefault();while(!col(piece.shape,0,1)){piece.y++;gameScore+=2;}merge();clear();piece=next;next=mk();if(col(piece.shape,0,0))over=true;}};
  function update(t=0){if(currentGame!=='tetris')return;const dt=t-last;last=t;dropT+=dt;if(dropT>dropI&&!over){dropT=0;if(!col(piece.shape,0,1))piece.y++;else{merge();clear();piece=next;next=mk();if(col(piece.shape,0,0))over=true;}}document.getElementById('game-score').textContent=gameScore;draw();gameLoop=requestAnimationFrame(update);}
  function draw(){ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,canvas.width,canvas.height);board.forEach((row,r)=>row.forEach((cl,c)=>{if(cl){ctx.fillStyle=cl;ctx.beginPath();ctx.roundRect(c*B+1,r*B+1,B-2,B-2,3);ctx.fill();}}));piece.shape.forEach((row,r)=>row.forEach((v,c)=>{if(v){ctx.fillStyle=piece.color;ctx.beginPath();ctx.roundRect((piece.x+c)*B+1,(piece.y+r)*B+1,B-2,B-2,3);ctx.fill();}}));const px=C*B+15;ctx.fillStyle='#9999cc';ctx.font='14px Inter';ctx.textAlign='left';ctx.fillText('Next:',px,25);next.shape.forEach((row,r)=>row.forEach((v,c)=>{if(v){ctx.fillStyle=next.color;ctx.beginPath();ctx.roundRect(px+c*18,35+r*18,16,16,3);ctx.fill();}}));if(over){ctx.fillStyle='rgba(10,10,26,0.85)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fd79a8';ctx.font='bold 32px Inter';ctx.textAlign='center';ctx.fillText('Game Over!',canvas.width/2,canvas.height/2-15);ctx.fillStyle='#a29bfe';ctx.font='18px Inter';ctx.fillText('Score: '+gameScore,canvas.width/2,canvas.height/2+20);}}
  draw();gameLoop=requestAnimationFrame(update);
}

// ── 2048 ────────────────────────────────────────────────────────
function init2048Game(canvas, ctx) {
  document.getElementById('game-controls-hint').textContent = getGameControls('2048');
  const S=4,CELL=110,GAP=10,PAD=15; canvas.width=S*CELL+(S+1)*GAP+PAD*2; canvas.height=canvas.width;
  const TC={0:'#1a1a3e',2:'#eee4da',4:'#ede0c8',8:'#f2b179',16:'#f59563',32:'#f67c5f',64:'#f65e3b',128:'#edcf72',256:'#edcc61',512:'#edc850',1024:'#edc53f',2048:'#edc22e'};
  const TX={0:'transparent',2:'#776e65',4:'#776e65',8:'#f9f6f2',16:'#f9f6f2',32:'#f9f6f2',64:'#f9f6f2',128:'#f9f6f2',256:'#f9f6f2',512:'#f9f6f2',1024:'#f9f6f2',2048:'#f9f6f2'};
  let grid=Array.from({length:S},()=>Array(S).fill(0)),won=false,lost=false;
  function addR(){const e=[];for(let r=0;r<S;r++)for(let c=0;c<S;c++)if(!grid[r][c])e.push({r,c});if(!e.length)return;const{r,c}=e[Math.floor(Math.random()*e.length)];grid[r][c]=Math.random()<.9?2:4;}
  function slide(row){let a=row.filter(v=>v),sc=0;for(let i=0;i<a.length-1;i++)if(a[i]===a[i+1]){a[i]*=2;sc+=a[i];a.splice(i+1,1);}while(a.length<S)a.push(0);return{result:a,score:sc};}
  function move(dir){let moved=false,ts=0;const rot=g=>g[0].map((_,i)=>g.map(r=>r[i]).reverse());let g=grid.map(r=>[...r]),rots={up:1,left:0,down:3,right:2}[dir];for(let i=0;i<rots;i++)g=rot(g);for(let r=0;r<S;r++){const{result,score}=slide(g[r]);if(result.some((v,i)=>v!==g[r][i]))moved=true;g[r]=result;ts+=score;}for(let i=0;i<(4-rots)%4;i++)g=rot(g);if(moved){grid=g;gameScore+=ts;document.getElementById('game-score').textContent=gameScore;addR();check();draw();}}
  function check(){for(let r=0;r<S;r++)for(let c=0;c<S;c++){if(grid[r][c]===2048&&!won)won=true;if(!grid[r][c])return;if(c<S-1&&grid[r][c]===grid[r][c+1])return;if(r<S-1&&grid[r][c]===grid[r+1][c])return;}lost=true;}
  document.onkeydown=(e)=>{if(lost){if(e.code==='Space'){e.preventDefault();launchGame('2048');}return;}if(won)won=false;const d={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};if(d[e.key]){e.preventDefault();move(d[e.key]);}};
  function draw(){ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,canvas.width,canvas.height);for(let r=0;r<S;r++)for(let c=0;c<S;c++){const x=PAD+c*(CELL+GAP),y=PAD+r*(CELL+GAP);ctx.fillStyle='#1a1a3e';ctx.beginPath();ctx.roundRect(x,y,CELL,CELL,8);ctx.fill();}for(let r=0;r<S;r++)for(let c=0;c<S;c++){const v=grid[r][c];if(!v)continue;const x=PAD+c*(CELL+GAP),y=PAD+r*(CELL+GAP);ctx.fillStyle=TC[v]||'#3c3a32';if(v>=128){ctx.shadowColor=TC[v];ctx.shadowBlur=12;}ctx.beginPath();ctx.roundRect(x,y,CELL,CELL,8);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle=TX[v]||'#f9f6f2';ctx.font=v>=1024?'bold 28px Inter':'bold 34px Inter';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(v,x+CELL/2,y+CELL/2+1);}if(lost){ctx.fillStyle='rgba(10,10,26,0.8)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fd79a8';ctx.font='bold 32px Inter';ctx.textAlign='center';ctx.fillText('Game Over!',canvas.width/2,canvas.height/2-15);ctx.fillStyle='#a29bfe';ctx.font='18px Inter';ctx.fillText('Score: '+gameScore,canvas.width/2,canvas.height/2+20);ctx.fillStyle='#6666aa';ctx.font='13px Inter';ctx.fillText('Press Space to restart',canvas.width/2,canvas.height/2+50);}}
  addR();addR();draw();
}

// ── Breakout ────────────────────────────────────────────────────
function initBreakoutGame(canvas, ctx) {
  document.getElementById('game-controls-hint').textContent = getGameControls('breakout');
  const W=canvas.width,H=canvas.height,BR=5,BC=10,BW=(W-20)/BC,BH=22,PW=90,PH=12,BR2=6;
  const BCOL=['#fd79a8','#a29bfe','#fdcb6e','#55efc4','#74b9ff'];
  let px=W/2-PW/2,bx=W/2,by=H-40,bdx=3,bdy=-3,launched=false,alive=true,bricks=[];
  for(let r=0;r<BR;r++)for(let c=0;c<BC;c++)bricks.push({x:10+c*BW,y:40+r*(BH+4),w:BW-4,h:BH,color:BCOL[r],alive:true});
  let keys={};
  document.onkeydown=(e)=>{keys[e.key]=true;if(e.code==='Space'){e.preventDefault();launched=true;}if(!alive&&e.code==='Space')launchGame('breakout');};
  document.onkeyup=(e)=>{keys[e.key]=false;};
  function update(){if(currentGame!=='breakout'||!alive)return;if(keys.ArrowLeft)px=Math.max(0,px-7);if(keys.ArrowRight)px=Math.min(W-PW,px+7);if(!launched){bx=px+PW/2;by=H-30;}else{bx+=bdx;by+=bdy;if(bx-BR2<0||bx+BR2>W)bdx=-bdx;if(by-BR2<0)bdy=-bdy;if(by+BR2>H-20&&bx>px&&bx<px+PW){bdy=-Math.abs(bdy);bdx=((bx-(px+PW/2))/(PW/2))*5;}if(by>H+10)alive=false;bricks.forEach(b=>{if(!b.alive)return;if(bx>b.x&&bx<b.x+b.w&&by-BR2<b.y+b.h&&by+BR2>b.y){b.alive=false;bdy=-bdy;gameScore+=10;document.getElementById('game-score').textContent=gameScore;}});if(bricks.every(b=>!b.alive)){gameScore+=500;document.getElementById('game-score').textContent=gameScore;alive=false;}}draw();gameLoop=requestAnimationFrame(update);}
  function draw(){ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,W,H);bricks.forEach(b=>{if(!b.alive)return;ctx.fillStyle=b.color;ctx.shadowColor=b.color;ctx.shadowBlur=5;ctx.beginPath();ctx.roundRect(b.x,b.y,b.w,b.h,3);ctx.fill();ctx.shadowBlur=0;});const g=ctx.createLinearGradient(px,0,px+PW,0);g.addColorStop(0,'#6c5ce7');g.addColorStop(1,'#a29bfe');ctx.fillStyle=g;ctx.shadowColor='#6c5ce7';ctx.shadowBlur=10;ctx.beginPath();ctx.roundRect(px,H-20,PW,PH,6);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.shadowColor='#fff';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(bx,by,BR2,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;if(!alive){ctx.fillStyle='rgba(10,10,26,0.85)';ctx.fillRect(0,0,W,H);const w=bricks.every(b=>!b.alive);ctx.fillStyle=w?'#00b894':'#fd79a8';ctx.font='bold 32px Inter';ctx.textAlign='center';ctx.fillText(w?'You Win!':'Game Over!',W/2,H/2-15);ctx.fillStyle='#a29bfe';ctx.font='18px Inter';ctx.fillText('Score: '+gameScore,W/2,H/2+20);}if(!launched&&alive){ctx.fillStyle='rgba(162,155,254,0.7)';ctx.font='14px Inter';ctx.textAlign='center';ctx.fillText('Press SPACE to launch',W/2,H/2);}}
  draw();gameLoop=requestAnimationFrame(update);
}

// ── Flappy Bird ─────────────────────────────────────────────────
function initFlappyGame(canvas, ctx) {
  document.getElementById('game-controls-hint').textContent = getGameControls('flappy');
  const W=canvas.width,H=canvas.height;
  let bx=80,by=H/2,bvy=0,G=.35,FL=-6.5,PW=55,GAP=150,PS=2.5,pipes=[],frame=0,alive=true,started=false;
  function flap(){if(!alive){launchGame('flappy');return;}bvy=FL;started=true;}
  document.onkeydown=(e)=>{if(e.code==='Space'||e.key==='ArrowUp'){e.preventDefault();flap();}};
  canvas.onclick=flap;
  function addP(){const t=60+Math.random()*(H-GAP-120);pipes.push({x:W,topH:t});}
  function update(){if(currentGame!=='flappy')return;frame++;if(!started){by=H/2+Math.sin(frame*.05)*10;draw();gameLoop=requestAnimationFrame(update);return;}bvy+=G;by+=bvy;if(frame%90===0)addP();pipes.forEach(p=>p.x-=PS);pipes=pipes.filter(p=>p.x>-PW);const br=12;if(by+br>H||by-br<0)alive=false;pipes.forEach(p=>{if(bx+br>p.x&&bx-br<p.x+PW){if(by-br<p.topH||by+br>p.topH+GAP)alive=false;}if(p.x+PW<bx&&!p.scored){p.scored=true;gameScore++;document.getElementById('game-score').textContent=gameScore;}});draw();gameLoop=requestAnimationFrame(update);}
  function draw(){const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#0c1445');sky.addColorStop(1,'#1a0a40');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);pipes.forEach(p=>{ctx.fillStyle='#00b894';ctx.shadowColor='#00b894';ctx.shadowBlur=8;ctx.fillRect(p.x,0,PW,p.topH);ctx.fillRect(p.x,p.topH+GAP,PW,H-p.topH-GAP);ctx.shadowBlur=0;});ctx.save();ctx.translate(bx,by);ctx.rotate(Math.min(bvy*3,30)*Math.PI/180);ctx.fillStyle='#fdcb6e';ctx.shadowColor='#fdcb6e';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(0,0,14,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='white';ctx.beginPath();ctx.arc(6,-4,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#333';ctx.beginPath();ctx.arc(7,-4,2.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e17055';ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(22,-2);ctx.lineTo(14,4);ctx.fill();ctx.restore();if(!alive){ctx.fillStyle='rgba(10,10,26,0.85)';ctx.fillRect(0,0,W,H);ctx.fillStyle='#fd79a8';ctx.font='bold 32px Inter';ctx.textAlign='center';ctx.fillText('Game Over!',W/2,H/2-15);ctx.fillStyle='#a29bfe';ctx.font='18px Inter';ctx.fillText('Score: '+gameScore,W/2,H/2+20);}if(!started){ctx.fillStyle='rgba(162,155,254,0.8)';ctx.font='bold 20px Inter';ctx.textAlign='center';ctx.fillText('Press SPACE to start',W/2,H/2+60);}}
  draw();gameLoop=requestAnimationFrame(update);
}

// ── Minesweeper ─────────────────────────────────────────────────
function initMinesweeperGame(canvas, ctx) {
  document.getElementById('game-controls-hint').textContent = getGameControls('minesweeper');
  const C2=12,R2=10,CL=40,MN=15; canvas.width=C2*CL; canvas.height=R2*CL;
  let board=[],revealed=[],flagged=[],over=false,first=true,won=false;
  function init(){board=Array.from({length:R2},()=>Array(C2).fill(0));revealed=Array.from({length:R2},()=>Array(C2).fill(false));flagged=Array.from({length:R2},()=>Array(C2).fill(false));over=false;first=true;won=false;gameScore=0;document.getElementById('game-score').textContent='0';}
  function place(sr,sc){let p=0;while(p<MN){const r=Math.floor(Math.random()*R2),c=Math.floor(Math.random()*C2);if(board[r][c]!==-1&&!(Math.abs(r-sr)<=1&&Math.abs(c-sc)<=1)){board[r][c]=-1;p++;}}for(let r=0;r<R2;r++)for(let c=0;c<C2;c++){if(board[r][c]===-1)continue;let n=0;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const nr=r+dr,nc=c+dc;if(nr>=0&&nr<R2&&nc>=0&&nc<C2&&board[nr][nc]===-1)n++;}board[r][c]=n;}}
  function rev(r,c){if(r<0||r>=R2||c<0||c>=C2||revealed[r][c]||flagged[r][c])return;revealed[r][c]=true;gameScore+=5;document.getElementById('game-score').textContent=gameScore;if(!board[r][c])for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)rev(r+dr,c+dc);}
  function chkWin(){for(let r=0;r<R2;r++)for(let c=0;c<C2;c++)if(board[r][c]!==-1&&!revealed[r][c])return false;return true;}
  canvas.oncontextmenu=(e)=>e.preventDefault();
  canvas.onmousedown=(e)=>{if(over){initMinesweeperGame(canvas,ctx);return;}const rect=canvas.getBoundingClientRect(),c=Math.floor((e.clientX-rect.left)/CL),r=Math.floor((e.clientY-rect.top)/CL);if(r<0||r>=R2||c<0||c>=C2)return;if(e.button===2){flagged[r][c]=!flagged[r][c];draw();return;}if(flagged[r][c])return;if(first){first=false;place(r,c);}if(board[r][c]===-1){over=true;for(let rr=0;rr<R2;rr++)for(let cc=0;cc<C2;cc++)if(board[rr][cc]===-1)revealed[rr][cc]=true;draw();return;}rev(r,c);if(chkWin()){won=true;over=true;gameScore+=500;document.getElementById('game-score').textContent=gameScore;}draw();};
  document.onkeydown=null;
  const NC=['','#74b9ff','#00b894','#fd79a8','#6c5ce7','#e17055','#00cec9','#fdcb6e','#dfe6e9'];
  function draw(){ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,canvas.width,canvas.height);for(let r=0;r<R2;r++)for(let c=0;c<C2;c++){const x=c*CL,y=r*CL;if(revealed[r][c]){ctx.fillStyle='#16162e';ctx.fillRect(x+1,y+1,CL-2,CL-2);if(board[r][c]===-1){ctx.fillStyle='#d63031';ctx.beginPath();ctx.arc(x+CL/2,y+CL/2,10,0,Math.PI*2);ctx.fill();ctx.fillStyle='#2d3436';ctx.beginPath();ctx.arc(x+CL/2,y+CL/2,5,0,Math.PI*2);ctx.fill();}else if(board[r][c]>0){ctx.fillStyle=NC[board[r][c]];ctx.font='bold 18px Inter';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(board[r][c],x+CL/2,y+CL/2+1);}}else{ctx.fillStyle='#1e1e42';ctx.beginPath();ctx.roundRect(x+1,y+1,CL-2,CL-2,4);ctx.fill();if(flagged[r][c]){ctx.fillStyle='#fd79a8';ctx.font='18px Inter';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('🚩',x+CL/2,y+CL/2);}}}if(over&&!won){ctx.fillStyle='rgba(214,48,49,0.3)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fd79a8';ctx.font='bold 28px Inter';ctx.textAlign='center';ctx.fillText('💥 BOOM!',canvas.width/2,canvas.height/2-10);}if(won){ctx.fillStyle='rgba(0,184,148,0.3)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#00b894';ctx.font='bold 28px Inter';ctx.textAlign='center';ctx.fillText('🎉 You Win!',canvas.width/2,canvas.height/2-10);}}
  init();draw();
}

// ═══════════════════════════════════════════════════════════════
//  DOWNLOAD MANAGER
// ═══════════════════════════════════════════════════════════════

function initDownloads() {
  document.getElementById('fetch-media-btn').addEventListener('click', () => {
    const url = document.getElementById('media-url-input').value.trim();
    if (url) fetchMediaInfo(url);
  });
  document.getElementById('media-url-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const url = document.getElementById('media-url-input').value.trim(); if (url) fetchMediaInfo(url); }
  });
  document.getElementById('dl-video-btn').addEventListener('click', () => startDownload('video'));
  document.getElementById('dl-audio-btn').addEventListener('click', () => startDownload('audio'));
  refreshDownloads();
}

let currentMediaInfo = null;

async function fetchMediaInfo(url) {
  const btn = document.getElementById('fetch-media-btn');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  try {
    const res = await fetch('/api/media/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    const data = await res.json();
    if (data.error) { showToast(data.error, 'error'); return; }
    currentMediaInfo = data;
    document.getElementById('media-info-card').style.display = '';
    document.getElementById('media-thumb').src = data.thumbnail || '';
    document.getElementById('media-title').textContent = data.title || 'Unknown';
    document.getElementById('media-uploader').textContent = data.uploader || '';
    if (data.duration) { const m=Math.floor(data.duration/60),s=data.duration%60; document.getElementById('media-duration').textContent=m+':'+s.toString().padStart(2,'0'); }
    document.getElementById('download-options').style.display = '';
    const grid = document.getElementById('dl-format-grid');
    const vf = data.formats.filter(f=>f.has_video&&f.height).reduce((a,f)=>{const k=f.height+'p';if(!a.find(x=>x.label===k))a.push({label:k,format_id:f.format_id,filesize:f.filesize});return a;},[]);
    grid.innerHTML = vf.map(f=>'<button class="dl-format-chip" data-format="'+f.format_id+'">'+f.label+(f.filesize?'<span style="opacity:0.6;font-size:10px"> ('+formatSize(f.filesize)+')</span>':'')+'</button>').join('');
    grid.querySelectorAll('.dl-format-chip').forEach(c=>c.addEventListener('click',()=>{grid.querySelectorAll('.dl-format-chip').forEach(x=>x.classList.remove('selected'));c.classList.add('selected');}));
    showToast('Media analyzed!','success');
  } catch(e) { showToast('Failed to analyze URL','error'); }
  finally { btn.disabled=false; btn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Analyze'; }
}

async function startDownload(mode) {
  const url = document.getElementById('media-url-input').value.trim();
  if (!url) { showToast('Enter a URL first','error'); return; }
  const sel = document.querySelector('.dl-format-chip.selected');
  const fid = sel ? sel.dataset.format : null;
  try {
    const res = await fetch('/api/media/download', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url,format_id:fid,mode}) });
    const data = await res.json();
    if (data.error) { showToast(data.error,'error'); return; }
    trackDownload(data.downloadId, mode);
    showToast('Download started! '+(mode==='audio'?'🎵':'🎬'),'success');
  } catch(e) { showToast('Failed to start download','error'); }
}

function trackDownload(id, mode) {
  const cont = document.getElementById('active-downloads');
  const item = document.createElement('div');
  item.className = 'active-download-item'; item.id = 'dl-'+id;
  item.innerHTML = '<div class="active-dl-icon">'+(mode==='audio'?'🎵':'🎬')+'</div><div class="active-dl-info"><div class="dl-name">Downloading '+mode+'...</div><div class="progress-bar"><div class="progress-fill" style="width:0%"></div></div></div><div class="active-dl-percent">0%</div>';
  cont.prepend(item);
  state.activeDownloads.set(id,{mode});
  const poll = setInterval(async()=>{
    try {
      const res = await fetch('/api/media/progress/'+id);
      const data = await res.json();
      item.querySelector('.progress-fill').style.width = data.progress+'%';
      item.querySelector('.active-dl-percent').textContent = Math.round(data.progress)+'%';
      if (data.filename) item.querySelector('.dl-name').textContent = data.filename;
      if (data.status==='complete') { clearInterval(poll); item.querySelector('.progress-fill').style.width='100%'; item.querySelector('.active-dl-percent').textContent='✓'; item.querySelector('.active-dl-percent').style.color='#00b894'; state.activeDownloads.delete(id); showToast('Download complete!','success'); refreshDownloads(); updateDownloadBadge(); }
      if (data.status==='error') { clearInterval(poll); item.querySelector('.active-dl-percent').textContent='✗'; item.querySelector('.active-dl-percent').style.color='#d63031'; state.activeDownloads.delete(id); showToast('Download failed','error'); }
    } catch(e){}
  },1000);
}

async function refreshDownloads() {
  try {
    const res = await fetch('/api/downloads');
    const files = await res.json();
    const list = document.getElementById('download-list');
    if (!files.length) { list.innerHTML='<p class="empty-state">No downloads yet</p>'; return; }
    list.innerHTML = files.map(f=>'<div class="download-item"><div class="dl-item-icon '+f.type+'">'+(f.type==='video'?'🎬':f.type==='audio'?'🎵':'📄')+'</div><div class="dl-item-info"><div class="dl-item-name">'+escapeHtml(f.name)+'</div><div class="dl-item-meta">'+formatSize(f.size)+' · '+f.ext.replace('.','').toUpperCase()+'</div></div><div class="dl-item-actions"><a href="'+f.url+'" download class="dl-action-btn" title="Download"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></a><button class="dl-action-btn delete" data-file="'+escapeHtml(f.name)+'" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button></div></div>').join('');
    list.querySelectorAll('.dl-action-btn.delete').forEach(btn=>btn.addEventListener('click',async()=>{try{await fetch('/api/downloads/'+encodeURIComponent(btn.dataset.file),{method:'DELETE'});refreshDownloads();showToast('File deleted','info');}catch(e){showToast('Failed to delete','error');}}));
  } catch(e){}
}

function updateDownloadBadge() {
  const badge = document.getElementById('download-badge');
  const c = state.activeDownloads.size;
  badge.style.display = c > 0 ? '' : 'none';
  if (c) badge.textContent = c;
}

// ── Settings ────────────────────────────────────────────────────
function initSettings() {
  const ts = document.getElementById('theme-select');
  ts.addEventListener('change', () => applyTheme(ts.value));
  const es = document.getElementById('default-engine-select');
  es.value = state.currentEngine;
  es.addEventListener('change', () => { state.currentEngine=es.value; localStorage.setItem('novase_engine',state.currentEngine); updateEngineDisplay(); });
  document.getElementById('clear-data-btn').addEventListener('click', () => { if(confirm('Clear all data?')){localStorage.clear();state.bookmarks=[];state.history=[];showToast('Data cleared','info');} });
}

// ── Utilities ───────────────────────────────────────────────────
function escapeHtml(str) { const d=document.createElement('div'); d.textContent=str; return d.innerHTML; }

function formatSize(bytes) {
  if (!bytes) return '';
  const u=['B','KB','MB','GB']; let i=0, s=bytes;
  while(s>=1024&&i<u.length-1){s/=1024;i++;}
  return s.toFixed(1)+' '+u[i];
}

function showToast(message, type) {
  const t = document.createElement('div');
  t.className = 'toast '+(type||'info');
  t.innerHTML = (type==='success'?'✅':type==='error'?'❌':'ℹ️')+' '+escapeHtml(message);
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),3500);
}
