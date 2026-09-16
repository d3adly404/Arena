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

// ── State ───────────────────────────────────────────────────────
const state = {
  tabs: [],
  activeTabId: null,
  currentEngine: 'google',
  bookmarks: JSON.parse(localStorage.getItem('novase_bookmarks') || '[]'),
  history: JSON.parse(localStorage.getItem('novase_history') || '[]'),
  theme: localStorage.getItem('novase_theme') || 'dark',
  activeDownloads: new Map(),
};

const SEARCH_ENGINES = {
  google:     { name: 'Google',       icon: '🔍', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`, search: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  bing:       { name: 'Bing',         icon: '🔎', url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,   search: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  duckduckgo: { name: 'DuckDuckGo',   icon: '🦆', url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,       search: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  yahoo:      { name: 'Yahoo',        icon: '🟣', url: (q) => `https://search.yahoo.com/search?p=${encodeURIComponent(q)}`, search: (q) => `https://search.yahoo.com/search?p=${encodeURIComponent(q)}` },
  brave:      { name: 'Brave Search', icon: '🦁', url: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}`, search: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}` },
  ecosia:     { name: 'Ecosia',       icon: '🌱', url: (q) => `https://www.ecosia.org/search?q=${encodeURIComponent(q)}`,   search: (q) => `https://www.ecosia.org/search?q=${encodeURIComponent(q)}` },
  yandex:     { name: 'Yandex',       icon: '🔴', url: (q) => `https://yandex.com/search/?text=${encodeURIComponent(q)}`,  search: (q) => `https://yandex.com/search/?text=${encodeURIComponent(q)}` },
  startpage:  { name: 'Startpage',    icon: '🔒', url: (q) => `https://www.startpage.com/do/search?q=${encodeURIComponent(q)}`, search: (q) => `https://www.startpage.com/do/search?q=${encodeURIComponent(q)}` },
};

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
});

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

function createNewTab(url = null) {
  const id = 'tab_' + Date.now();
  const tab = {
    id,
    title: 'New Tab',
    url: url || '',
    favicon: '',
  };
  state.tabs.push(tab);
  renderTabs();
  activateTab(id);

  if (url) {
    navigateTo(url);
  }
}

function renderTabs() {
  const container = document.getElementById('tabs-container');
  container.innerHTML = '';
  state.tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = `tab${tab.id === state.activeTabId ? ' active' : ''}`;
    el.dataset.tabId = tab.id;
    el.innerHTML = `
      ${tab.favicon ? `<img class="tab-favicon" src="${tab.favicon}" alt="">` : '<span style="font-size:12px">🌐</span>'}
      <span class="tab-title">${escapeHtml(tab.title)}</span>
      <span class="tab-close" data-close-tab="${tab.id}">×</span>
    `;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.tab-close')) {
        closeTab(tab.id);
      } else {
        activateTab(tab.id);
      }
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

  // Show/hide content based on tab state
  const ntp = document.getElementById('new-tab-page');
  const frame = document.getElementById('browser-frame-container');
  const iframe = document.getElementById('browser-frame');

  hideAllPanels();

  if (!tab || !tab.url) {
    ntp.style.display = '';
    frame.style.display = 'none';
  } else {
    ntp.style.display = 'none';
    frame.style.display = '';
    if (iframe.src !== tab.url) {
      iframe.src = tab.url;
    }
  }
}

function closeTab(id) {
  const idx = state.tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  state.tabs.splice(idx, 1);
  if (state.tabs.length === 0) {
    createNewTab();
  } else if (state.activeTabId === id) {
    const newIdx = Math.min(idx, state.tabs.length - 1);
    activateTab(state.tabs[newIdx].id);
  } else {
    renderTabs();
  }
}

// ── Navigation ──────────────────────────────────────────────────
function initNavigation() {
  const urlInput = document.getElementById('url-input');
  const goBtn = document.getElementById('btn-go');
  const backBtn = document.getElementById('btn-back');
  const fwdBtn = document.getElementById('btn-forward');
  const refreshBtn = document.getElementById('btn-refresh');
  const homeBtn = document.getElementById('btn-home');

  // URL input
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

  // Nav buttons
  backBtn.addEventListener('click', () => {
    const iframe = document.getElementById('browser-frame');
    try { iframe.contentWindow.history.back(); } catch(e) {}
  });
  fwdBtn.addEventListener('click', () => {
    const iframe = document.getElementById('browser-frame');
    try { iframe.contentWindow.history.forward(); } catch(e) {}
  });
  refreshBtn.addEventListener('click', () => {
    const iframe = document.getElementById('browser-frame');
    try { iframe.contentWindow.location.reload(); } catch(e) {
      iframe.src = iframe.src;
    }
  });
  homeBtn.addEventListener('click', () => goHome());

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
  let url = input;

  // Check if it's a URL
  if (isURL(input)) {
    if (!input.startsWith('http://') && !input.startsWith('https://')) {
      url = 'https://' + input;
    }
  } else {
    // It's a search query
    const engine = SEARCH_ENGINES[state.currentEngine];
    url = engine.search(input);
  }

  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (tab) {
    tab.url = url;
    tab.title = extractDomain(url);
    renderTabs();
  }

  document.getElementById('url-input').value = url;
  document.getElementById('new-tab-page').style.display = 'none';
  document.getElementById('browser-frame-container').style.display = '';
  hideAllPanels();

  const iframe = document.getElementById('browser-frame');
  iframe.src = url;

  // Add to history
  addToHistory(url, tab ? tab.title : '');

  document.title = (tab ? tab.title : 'Loading') + ' — Novase';
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
  document.getElementById('browser-frame').src = 'about:blank';
  hideAllPanels();
  document.title = 'Novase Browser';
}

function isURL(str) {
  try {
    const urlPattern = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w\-./?%&=]*)?$/;
    const domainPattern = /^[\w-]+\.[\w-]+/;
    return urlPattern.test(str) || (domainPattern.test(str) && str.includes('.'));
  } catch(e) {
    return false;
  }
}

function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace('www.', '');
  } catch(e) {
    return url.substring(0, 30);
  }
}

// ── Search Engine ───────────────────────────────────────────────
function initSearchEngine() {
  const btn = document.getElementById('search-engine-btn');
  const dropdown = document.getElementById('engine-dropdown');

  // Load saved engine
  const saved = localStorage.getItem('novase_engine');
  if (saved && SEARCH_ENGINES[saved]) {
    state.currentEngine = saved;
  }
  updateEngineDisplay();

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === 'none' ? '' : 'none';
  });

  document.addEventListener('click', () => {
    dropdown.style.display = 'none';
  });

  dropdown.querySelectorAll('.engine-option').forEach(opt => {
    opt.addEventListener('click', () => {
      state.currentEngine = opt.dataset.engine;
      localStorage.setItem('novase_engine', state.currentEngine);
      updateEngineDisplay();
      dropdown.style.display = 'none';
    });
  });

  // Update active state
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

  // Quick actions
  document.getElementById('qa-games')?.addEventListener('click', () => showPanel('games'));
  document.getElementById('qa-downloader')?.addEventListener('click', () => showPanel('downloads'));
  document.getElementById('qa-bookmarks')?.addEventListener('click', () => showPanel('bookmarks'));
  document.getElementById('qa-history')?.addEventListener('click', () => showPanel('bookmarks'));
}

function togglePanel(name) {
  const panels = ['games', 'downloads', 'bookmarks', 'settings'];
  const panel = document.getElementById(`${name}-panel`);
  if (panel.style.display === 'none') {
    showPanel(name);
  } else {
    hidePanel(name);
  }
}

function showPanel(name) {
  hideAllPanels();
  const panel = document.getElementById(`${name}-panel`);
  panel.style.display = '';

  // Hide new tab page and frame when showing panel
  if (name !== 'downloads') { // downloads can overlay
    document.getElementById('new-tab-page').style.display = 'none';
    document.getElementById('browser-frame-container').style.display = 'none';
  }

  // Refresh content
  if (name === 'downloads') refreshDownloads();
  if (name === 'bookmarks') renderBookmarks();
}

function hidePanel(name) {
  document.getElementById(`${name}-panel`).style.display = 'none';

  // Restore content
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
    document.getElementById(`${name}-panel`).style.display = 'none';
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
  container.innerHTML = state.bookmarks.map((bm, i) => `
    <div class="bookmark-item" data-url="${escapeHtml(bm.url)}">
      <span style="font-size:16px">🔖</span>
      <span class="bm-title">${escapeHtml(bm.title)}</span>
      <span class="bm-url">${escapeHtml(extractDomain(bm.url))}</span>
      <button class="bm-remove" data-bm-idx="${i}">✕</button>
    </div>
  `).join('');

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

// Ctrl+D bookmark
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'd') {
      e.preventDefault();
      const tab = state.tabs.find(t => t.id === state.activeTabId);
      if (tab && tab.url) {
        const exists = state.bookmarks.find(b => b.url === tab.url);
        if (!exists) {
          state.bookmarks.push({ url: tab.url, title: tab.title });
          localStorage.setItem('novase_bookmarks', JSON.stringify(state.bookmarks));
          showToast('Bookmark added!', 'success');
        } else {
          showToast('Already bookmarked', 'info');
        }
      }
    }
    if (e.ctrlKey && e.key === 't') {
      e.preventDefault();
      createNewTab();
    }
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      if (state.activeTabId) closeTab(state.activeTabId);
    }
    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      document.getElementById('url-input').focus();
      document.getElementById('url-input').select();
    }
  });
}

// ═══════════════════════════════════════════════════════════════
//  GAMES ENGINE
// ═══════════════════════════════════════════════════════════════

let currentGame = null;
let gameLoop = null;
let gameScore = 0;

function initGames() {
  document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => {
      const game = card.dataset.game;
      launchGame(game);
    });
  });

  document.getElementById('game-back-btn').addEventListener('click', () => {
    stopGame();
  });
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

  // Set canvas size
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

function getGameName(game) {
  const names = { snake: 'Snake', tetris: 'Tetris', '2048': '2048', breakout: 'Breakout', flappy: 'Flappy Bird', minesweeper: 'Minesweeper' };
  return names[game] || game;
}

function stopGame() {
  if (gameLoop) { cancelAnimationFrame(gameLoop); clearTimeout(gameLoop); clearInterval(gameLoop); gameLoop = null; }
  document.onkeydown = null;
  document.getElementById('games-grid').style.display = '';
  document.getElementById('game-container').style.display = 'none';
  currentGame = null;
}

function getGameControls(game) {
  const hints = {
    snake: '🎮 Arrow Keys / WASD to move',
    tetris: '🎮 ← → to move, ↑ to rotate, ↓ to soft drop, Space to hard drop',
    '2048': '🎮 Arrow Keys to slide tiles',
    breakout: '🎮 ← → to move paddle, Space to launch',
    flappy: '🎮 Space / Click / ↑ to flap',
    minesweeper: '🎮 Click to reveal, Right-click to flag'
  };
  return hints[game] || '';
}

// ── SNAKE GAME ──────────────────────────────────────────────────
function initSnakeGame(canvas, ctx) {
  document.getElementById('game-controls-hint').textContent = getGameControls('snake');

  const gridSize = 20;
  const cols = Math.floor(canvas.width / gridSize);
  const rows = Math.floor(canvas.height / gridSize);

  let snake = [{x: 10, y: 10}, {x: 9, y: 10}, {x: 8, y: 10}];
  let dir = {x: 1, y: 0};
  let nextDir = {x: 1, y: 0};
  let food = spawnFood();
  let speed = 120;
  let alive = true;

  function spawnFood() {
    let pos;
    do {
      pos = {x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows)};
    } while (snake.some(s => s.x === pos.x && s.y === pos.y));
    return pos;
  }

  document.onkeydown = (e) => {
    const key = e.key.toLowerCase();
    if ((key === 'arrowup' || key === 'w') && dir.y === 0) nextDir = {x: 0, y: -1};
    if ((key === 'arrowdown' || key === 's') && dir.y === 0) nextDir = {x: 0, y: 1};
    if ((key === 'arrowleft' || key === 'a') && dir.x === 0) nextDir = {x: -1, y: 0};
    if ((key === 'arrowright' || key === 'd') && dir.x === 0) nextDir = {x: 1, y: 0};
  };

  function update() {
    if (!alive || currentGame !== 'snake') return;

    dir = nextDir;
    const head = {x: snake[0].x + dir.x, y: snake[0].y + dir.y};

    // Wall collision
    if (head.x < 0 || head.x >= cols || head.y < 0 || head.y >= rows) {
      alive = false;
      drawGameOver();
      return;
    }
    // Self collision
    if (snake.some(s => s.x === head.x && s.y === head.y)) {
      alive = false;
      drawGameOver();
      return;
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      gameScore += 10;
      document.getElementById('game-score').textContent = gameScore;
      food = spawnFood();
      if (speed > 60) speed -= 2;
    } else {
      snake.pop();
    }

    draw();
    gameLoop = setTimeout(update, speed);
  }

  function draw() {
    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines
    ctx.strokeStyle = 'rgba(108, 92, 231, 0.05)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Snake
    snake.forEach((seg, i) => {
      const pct = i / snake.length;
      const r = Math.round(108 - pct * 40);
      const g = Math.round(92 - pct * 30);
      const b = Math.round(231 - pct * 60);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.shadowColor = i === 0 ? '#6c5ce7' : 'transparent';
      ctx.shadowBlur = i === 0 ? 10 : 0;
      const pad = i === 0 ? 1 : 2;
      ctx.beginPath();
      ctx.roundRect(seg.x * gridSize + pad, seg.y * gridSize + pad, gridSize - pad*2, gridSize - pad*2, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Food
    ctx.fillStyle = '#fd79a8';
    ctx.shadowColor = '#fd79a8';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(food.x * gridSize + gridSize/2, food.y * gridSize + gridSize/2, gridSize/2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawGameOver() {
    ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fd79a8';
    ctx.font = 'bold 36px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over!', canvas.width/2, canvas.height/2 - 20);
    ctx.fillStyle = '#a29bfe';
    ctx.font = '20px Inter';
    ctx.fillText(`Score: ${gameScore}`, canvas.width/2, canvas.height/2 + 20);
    ctx.fillStyle = '#6666aa';
    ctx.font = '14px Inter';
    ctx.fillText('Press Space to restart', canvas.width/2, canvas.height/2 + 55);

    document.onkeydown = (e) => {
      if (e.code === 'Space') { e.preventDefault(); launchGame('snake'); }
    };
  }

  draw();
  gameLoop = setTimeout(update, speed);
}

// ── TETRIS GAME ─────────────────────────────────────────────────
function initTetrisGame(canvas, ctx) {
  document.getElementById('game-controls-hint').textContent = getGameControls('tetris');

  const COLS = 10, ROWS = 20, BLOCK = 28;
  canvas.width = COLS * BLOCK + 150;
  canvas.height = ROWS * BLOCK;

  const COLORS = ['#6c5ce7', '#fd79a8', '#00b894', '#fdcb6e', '#e17055', '#74b9ff', '#a29bfe'];
  const SHAPES = [
    [[1,1,1,1]],
    [[1,1],[1,1]],
    [[0,1,0],[1,1,1]],
    [[1,0,0],[1,1,1]],
    [[0,0,1],[1,1,1]],
    [[1,1,0],[0,1,1]],
    [[0,1,1],[1,1,0]]
  ];

  let board = Array.from({length: ROWS}, () => Array(COLS).fill(0));
  let piece = createPiece();
  let nextPiece = createPiece();
  let dropTimer = 0;
  let dropInterval = 500;
  let lastTime = 0;
  let gameOver = false;

  function createPiece() {
    const idx = Math.floor(Math.random() * SHAPES.length);
    return {
      shape: SHAPES[idx].map(r => [...r]),
      color: COLORS[idx],
      x: Math.floor(COLS / 2) - 1,
      y: 0
    };
  }

  function collides(shape, offX, offY) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const nx = piece.x + c + offX;
          const ny = piece.y + r + offY;
          if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
          if (ny >= 0 && board[ny][nx]) return true;
        }
      }
    }
    return false;
  }

  function merge() {
    piece.shape.forEach((row, r) => {
      row.forEach((val, c) => {
        if (val && piece.y + r >= 0) {
          board[piece.y + r][piece.x + c] = piece.color;
        }
      });
    });
  }

  function clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every(c => c !== 0)) {
        board.splice(r, 1);
        board.unshift(Array(COLS).fill(0));
        cleared++;
        r++;
      }
    }
    if (cleared) {
      const points = [0, 100, 300, 500, 800];
      gameScore += points[cleared] || cleared * 200;
      document.getElementById('game-score').textContent = gameScore;
      if (dropInterval > 100) dropInterval -= cleared * 10;
    }
  }

  function rotate() {
    const rotated = piece.shape[0].map((_, i) => piece.shape.map(row => row[i]).reverse());
    if (!collides(rotated, 0, 0)) piece.shape = rotated;
  }

  document.onkeydown = (e) => {
    if (gameOver) {
      if (e.code === 'Space') { e.preventDefault(); launchGame('tetris'); }
      return;
    }
    if (e.key === 'ArrowLeft' && !collides(piece.shape, -1, 0)) piece.x--;
    if (e.key === 'ArrowRight' && !collides(piece.shape, 1, 0)) piece.x++;
    if (e.key === 'ArrowDown' && !collides(piece.shape, 0, 1)) { piece.y++; gameScore++; }
    if (e.key === 'ArrowUp') rotate();
    if (e.code === 'Space') {
      e.preventDefault();
      while (!collides(piece.shape, 0, 1)) { piece.y++; gameScore += 2; }
      merge(); clearLines(); piece = nextPiece; nextPiece = createPiece();
      if (collides(piece.shape, 0, 0)) { gameOver = true; }
    }
  };

  function update(time = 0) {
    if (currentGame !== 'tetris') return;
    const dt = time - lastTime;
    lastTime = time;
    dropTimer += dt;

    if (dropTimer > dropInterval && !gameOver) {
      dropTimer = 0;
      if (!collides(piece.shape, 0, 1)) {
        piece.y++;
      } else {
        merge();
        clearLines();
        piece = nextPiece;
        nextPiece = createPiece();
        if (collides(piece.shape, 0, 0)) gameOver = true;
      }
    }

    document.getElementById('game-score').textContent = gameScore;
    draw();
    gameLoop = requestAnimationFrame(update);
  }

  function draw() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = 'rgba(108, 92, 231, 0.06)';
    for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x*BLOCK, 0); ctx.lineTo(x*BLOCK, ROWS*BLOCK); ctx.stroke(); }
    for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y*BLOCK); ctx.lineTo(COLS*BLOCK, y*BLOCK); ctx.stroke(); }

    // Board
    board.forEach((row, r) => {
      row.forEach((color, c) => {
        if (color) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.roundRect(c*BLOCK+1, r*BLOCK+1, BLOCK-2, BLOCK-2, 3);
          ctx.fill();
        }
      });
    });

    // Current piece
    piece.shape.forEach((row, r) => {
      row.forEach((val, c) => {
        if (val) {
          ctx.fillStyle = piece.color;
          ctx.shadowColor = piece.color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.roundRect((piece.x+c)*BLOCK+1, (piece.y+r)*BLOCK+1, BLOCK-2, BLOCK-2, 3);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });
    });

    // Side panel
    const panelX = COLS * BLOCK + 15;
    ctx.fillStyle = '#9999cc';
    ctx.font = '14px Inter';
    ctx.textAlign = 'left';
    ctx.fillText('Next:', panelX, 25);

    nextPiece.shape.forEach((row, r) => {
      row.forEach((val, c) => {
        if (val) {
          ctx.fillStyle = nextPiece.color;
          ctx.beginPath();
          ctx.roundRect(panelX + c*18, 35 + r*18, 16, 16, 3);
          ctx.fill();
        }
      });
    });

    if (gameOver) {
      ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fd79a8';
      ctx.font = 'bold 32px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('Game Over!', canvas.width/2, canvas.height/2 - 15);
      ctx.fillStyle = '#a29bfe';
      ctx.font = '18px Inter';
      ctx.fillText(`Score: ${gameScore}`, canvas.width/2, canvas.height/2 + 20);
      ctx.fillStyle = '#6666aa';
      ctx.font = '13px Inter';
      ctx.fillText('Press Space to restart', canvas.width/2, canvas.height/2 + 50);
    }
  }

  draw();
  gameLoop = requestAnimationFrame(update);
}

// ── 2048 GAME ───────────────────────────────────────────────────
function init2048Game(canvas, ctx) {
  document.getElementById('game-controls-hint').textContent = getGameControls('2048');

  const SIZE = 4;
  const CELL = 110;
  const GAP = 10;
  const PAD = 15;
  canvas.width = SIZE * CELL + (SIZE+1) * GAP + PAD*2;
  canvas.height = canvas.width;

  const TILE_COLORS = {
    0: '#1a1a3e', 2: '#eee4da', 4: '#ede0c8', 8: '#f2b179',
    16: '#f59563', 32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72',
    256: '#edcc61', 512: '#edc850', 1024: '#edc53f', 2048: '#edc22e',
    4096: '#3c3a32', 8192: '#3c3a32'
  };
  const TEXT_COLORS = {
    0: 'transparent', 2: '#776e65', 4: '#776e65', 8: '#f9f6f2', 16: '#f9f6f2',
    32: '#f9f6f2', 64: '#f9f6f2', 128: '#f9f6f2', 256: '#f9f6f2',
    512: '#f9f6f2', 1024: '#f9f6f2', 2048: '#f9f6f2'
  };

  let grid = Array.from({length: SIZE}, () => Array(SIZE).fill(0));
  let won = false;
  let lost = false;

  function addRandom() {
    const empty = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (grid[r][c] === 0) empty.push({r, c});
    if (empty.length === 0) return;
    const {r, c} = empty[Math.floor(Math.random() * empty.length)];
    grid[r][c] = Math.random() < 0.9 ? 2 : 4;
  }

  function slide(row) {
    let arr = row.filter(v => v !== 0);
    let score = 0;
    for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i] === arr[i+1]) { arr[i] *= 2; score += arr[i]; arr.splice(i+1, 1); }
    }
    while (arr.length < SIZE) arr.push(0);
    return { result: arr, score };
  }

  function move(dir) {
    let moved = false;
    let totalScore = 0;

    const rotate = (g) => g[0].map((_, i) => g.map(row => row[i]).reverse());
    let g = grid.map(r => [...r]);

    // Rotate grid so we always slide left
    let rotations = { up: 1, left: 0, down: 3, right: 2 }[dir];
    for (let i = 0; i < rotations; i++) g = rotate(g);

    for (let r = 0; r < SIZE; r++) {
      const { result, score } = slide(g[r]);
      if (result.some((v, i) => v !== g[r][i])) moved = true;
      g[r] = result;
      totalScore += score;
    }

    // Rotate back
    for (let i = 0; i < (4 - rotations) % 4; i++) g = rotate(g);

    if (moved) {
      grid = g;
      gameScore += totalScore;
      document.getElementById('game-score').textContent = gameScore;
      addRandom();
      checkState();
      draw();
    }
  }

  function checkState() {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] === 2048 && !won) { won = true; }
        if (grid[r][c] === 0) return;
        if (c < SIZE-1 && grid[r][c] === grid[r][c+1]) return;
        if (r < SIZE-1 && grid[r][c] === grid[r+1][c]) return;
      }
    lost = true;
  }

  document.onkeydown = (e) => {
    if (lost) { if (e.code === 'Space') { e.preventDefault(); launchGame('2048'); } return; }
    if (won) { won = false; } // Continue playing
    const dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (dirs[e.key]) { e.preventDefault(); move(dirs[e.key]); }
  };

  function draw() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Background grid
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const x = PAD + c * (CELL + GAP);
        const y = PAD + r * (CELL + GAP);
        ctx.fillStyle = '#1a1a3e';
        ctx.beginPath();
        ctx.roundRect(x, y, CELL, CELL, 8);
        ctx.fill();
      }
    }

    // Tiles
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const val = grid[r][c];
        if (val === 0) continue;
        const x = PAD + c * (CELL + GAP);
        const y = PAD + r * (CELL + GAP);

        ctx.fillStyle = TILE_COLORS[val] || '#3c3a32';
        if (val >= 128) { ctx.shadowColor = TILE_COLORS[val]; ctx.shadowBlur = 12; }
        ctx.beginPath();
        ctx.roundRect(x, y, CELL, CELL, 8);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = TEXT_COLORS[val] || '#f9f6f2';
        ctx.font = val >= 1024 ? 'bold 28px Inter' : 'bold 34px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(val, x + CELL/2, y + CELL/2 + 1);
      }
    }

    if (lost) {
      ctx.fillStyle = 'rgba(10, 10, 26, 0.8)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fd79a8';
      ctx.font = 'bold 32px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('Game Over!', canvas.width/2, canvas.height/2 - 15);
      ctx.fillStyle = '#a29bfe';
      ctx.font = '18px Inter';
      ctx.fillText(`Score: ${gameScore}`, canvas.width/2, canvas.height/2 + 20);
      ctx.fillStyle = '#6666aa';
      ctx.font = '13px Inter';
      ctx.fillText('Press Space to restart', canvas.width/2, canvas.height/2 + 50);
    }
  }

  addRandom(); addRandom();
  draw();
}

// ── BREAKOUT GAME ───────────────────────────────────────────────
function initBreakoutGame(canvas, ctx) {
  document.getElementById('game-controls-hint').textContent = getGameControls('breakout');

  const W = canvas.width, H = canvas.height;
  const BRICK_ROWS = 5, BRICK_COLS = 10;
  const BRICK_W = (W - 20) / BRICK_COLS, BRICK_H = 22;
  const PADDLE_W = 90, PADDLE_H = 12, BALL_R = 6;

  const BRICK_COLORS = ['#fd79a8', '#a29bfe', '#fdcb6e', '#55efc4', '#74b9ff'];

  let paddleX = W/2 - PADDLE_W/2;
  let ballX = W/2, ballY = H - 40;
  let ballDX = 3, ballDY = -3;
  let launched = false;
  let alive = true;
  let bricks = [];

  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      bricks.push({
        x: 10 + c * BRICK_W,
        y: 40 + r * (BRICK_H + 4),
        w: BRICK_W - 4,
        h: BRICK_H,
        color: BRICK_COLORS[r],
        alive: true
      });
    }
  }

  let keys = {};
  document.onkeydown = (e) => {
    keys[e.key] = true;
    if (e.code === 'Space') { e.preventDefault(); launched = true; }
    if (!alive && e.code === 'Space') { launchGame('breakout'); }
  };
  document.onkeyup = (e) => { keys[e.key] = false; };

  function update() {
    if (currentGame !== 'breakout' || !alive) return;

    if (keys['ArrowLeft']) paddleX = Math.max(0, paddleX - 7);
    if (keys['ArrowRight']) paddleX = Math.min(W - PADDLE_W, paddleX + 7);

    if (!launched) {
      ballX = paddleX + PADDLE_W/2;
      ballY = H - 30;
    } else {
      ballX += ballDX;
      ballY += ballDY;

      // Wall bounce
      if (ballX - BALL_R < 0 || ballX + BALL_R > W) ballDX = -ballDX;
      if (ballY - BALL_R < 0) ballDY = -ballDY;

      // Paddle bounce
      if (ballY + BALL_R > H - 20 && ballX > paddleX && ballX < paddleX + PADDLE_W) {
        ballDY = -Math.abs(ballDY);
        ballDX = ((ballX - (paddleX + PADDLE_W/2)) / (PADDLE_W/2)) * 5;
      }

      // Ball out
      if (ballY > H + 10) { alive = false; }

      // Brick collision
      bricks.forEach(b => {
        if (!b.alive) return;
        if (ballX > b.x && ballX < b.x + b.w && ballY - BALL_R < b.y + b.h && ballY + BALL_R > b.y) {
          b.alive = false;
          ballDY = -ballDY;
          gameScore += 10;
          document.getElementById('game-score').textContent = gameScore;
        }
      });

      // Win check
      if (bricks.every(b => !b.alive)) {
        gameScore += 500;
        document.getElementById('game-score').textContent = gameScore;
        alive = false;
      }
    }

    draw();
    gameLoop = requestAnimationFrame(update);
  }

  function draw() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);

    // Bricks
    bricks.forEach(b => {
      if (!b.alive) return;
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Paddle
    const grad = ctx.createLinearGradient(paddleX, 0, paddleX + PADDLE_W, 0);
    grad.addColorStop(0, '#6c5ce7');
    grad.addColorStop(1, '#a29bfe');
    ctx.fillStyle = grad;
    ctx.shadowColor = '#6c5ce7';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(paddleX, H - 20, PADDLE_W, PADDLE_H, 6);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Ball
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(ballX, ballY, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (!alive) {
      ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';
      ctx.fillRect(0, 0, W, H);
      const won = bricks.every(b => !b.alive);
      ctx.fillStyle = won ? '#00b894' : '#fd79a8';
      ctx.font = 'bold 32px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(won ? 'You Win!' : 'Game Over!', W/2, H/2 - 15);
      ctx.fillStyle = '#a29bfe';
      ctx.font = '18px Inter';
      ctx.fillText(`Score: ${gameScore}`, W/2, H/2 + 20);
      ctx.fillStyle = '#6666aa';
      ctx.font = '13px Inter';
      ctx.fillText('Press Space to restart', W/2, H/2 + 50);
    }

    if (!launched && alive) {
      ctx.fillStyle = 'rgba(162, 155, 254, 0.7)';
      ctx.font = '14px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('Press SPACE to launch', W/2, H/2);
    }
  }

  draw();
  gameLoop = requestAnimationFrame(update);
}

// ── FLAPPY BIRD GAME ────────────────────────────────────────────
function initFlappyGame(canvas, ctx) {
  document.getElementById('game-controls-hint').textContent = getGameControls('flappy');

  const W = canvas.width, H = canvas.height;
  let birdX = 80, birdY = H/2, birdVY = 0;
  const GRAVITY = 0.35, FLAP = -6.5;
  const PIPE_W = 55, GAP = 150, PIPE_SPEED = 2.5;
  let pipes = [];
  let frame = 0;
  let alive = true;
  let started = false;

  function flap() {
    if (!alive) { launchGame('flappy'); return; }
    birdVY = FLAP;
    started = true;
  }

  document.onkeydown = (e) => {
    if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); flap(); }
  };
  canvas.onclick = flap;

  function addPipe() {
    const topH = 60 + Math.random() * (H - GAP - 120);
    pipes.push({ x: W, topH });
  }

  function update() {
    if (currentGame !== 'flappy') return;
    frame++;

    if (!started) {
      birdY = H/2 + Math.sin(frame * 0.05) * 10;
      draw();
      gameLoop = requestAnimationFrame(update);
      return;
    }

    birdVY += GRAVITY;
    birdY += birdVY;

    if (frame % 90 === 0) addPipe();

    pipes.forEach(p => p.x -= PIPE_SPEED);
    pipes = pipes.filter(p => p.x > -PIPE_W);

    // Collision
    const birdR = 12;
    if (birdY + birdR > H || birdY - birdR < 0) alive = false;

    pipes.forEach(p => {
      if (birdX + birdR > p.x && birdX - birdR < p.x + PIPE_W) {
        if (birdY - birdR < p.topH || birdY + birdR > p.topH + GAP) alive = false;
      }
      if (p.x + PIPE_W < birdX && !p.scored) {
        p.scored = true;
        gameScore++;
        document.getElementById('game-score').textContent = gameScore;
      }
    });

    draw();
    gameLoop = requestAnimationFrame(update);
  }

  function draw() {
    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0c1445');
    sky.addColorStop(1, '#1a0a40');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Pipes
    pipes.forEach(p => {
      ctx.fillStyle = '#00b894';
      ctx.shadowColor = '#00b894';
      ctx.shadowBlur = 8;
      // Top pipe
      ctx.beginPath();
      ctx.roundRect(p.x, 0, PIPE_W, p.topH, [4, 4, 0, 0]);
      ctx.fill();
      // Bottom pipe
      ctx.beginPath();
      ctx.roundRect(p.x, p.topH + GAP, PIPE_W, H - p.topH - GAP, [0, 0, 4, 4]);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Bird
    ctx.save();
    ctx.translate(birdX, birdY);
    ctx.rotate(Math.min(birdVY * 3, 30) * Math.PI / 180);
    ctx.fillStyle = '#fdcb6e';
    ctx.shadowColor = '#fdcb6e';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Eye
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(6, -4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(7, -4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Beak
    ctx.fillStyle = '#e17055';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(22, -2);
    ctx.lineTo(14, 4);
    ctx.fill();
    ctx.restore();

    if (!alive) {
      ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fd79a8';
      ctx.font = 'bold 32px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('Game Over!', W/2, H/2 - 15);
      ctx.fillStyle = '#a29bfe';
      ctx.font = '18px Inter';
      ctx.fillText(`Score: ${gameScore}`, W/2, H/2 + 20);
      ctx.fillStyle = '#6666aa';
      ctx.font = '13px Inter';
      ctx.fillText('Press Space to restart', W/2, H/2 + 50);
    }

    if (!started) {
      ctx.fillStyle = 'rgba(162, 155, 254, 0.8)';
      ctx.font = 'bold 20px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('Press SPACE to start', W/2, H/2 + 60);
    }
  }

  draw();
  gameLoop = requestAnimationFrame(update);
}

// ── MINESWEEPER GAME ────────────────────────────────────────────
function initMinesweeperGame(canvas, ctx) {
  document.getElementById('game-controls-hint').textContent = getGameControls('minesweeper');

  const COLS = 12, ROWS = 10, CELL = 40;
  const MINES = 15;
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;

  let board = [];
  let revealed = [];
  let flagged = [];
  let gameOver = false;
  let firstClick = true;
  let won = false;

  function init() {
    board = Array.from({length: ROWS}, () => Array(COLS).fill(0));
    revealed = Array.from({length: ROWS}, () => Array(COLS).fill(false));
    flagged = Array.from({length: ROWS}, () => Array(COLS).fill(false));
    gameOver = false;
    firstClick = true;
    won = false;
    gameScore = 0;
    document.getElementById('game-score').textContent = '0';
  }

  function placeMines(safeR, safeC) {
    let placed = 0;
    while (placed < MINES) {
      const r = Math.floor(Math.random() * ROWS);
      const c = Math.floor(Math.random() * COLS);
      if (board[r][c] !== -1 && !(Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1)) {
        board[r][c] = -1;
        placed++;
      }
    }
    // Calculate numbers
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c] === -1) continue;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r+dr, nc = c+dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === -1) count++;
          }
        board[r][c] = count;
      }
    }
  }

  function reveal(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    if (revealed[r][c] || flagged[r][c]) return;
    revealed[r][c] = true;
    gameScore += 5;
    document.getElementById('game-score').textContent = gameScore;

    if (board[r][c] === 0) {
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          reveal(r+dr, c+dc);
    }
  }

  function checkWin() {
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (board[r][c] !== -1 && !revealed[r][c]) return false;
    return true;
  }

  canvas.oncontextmenu = (e) => e.preventDefault();

  canvas.onmousedown = (e) => {
    if (gameOver) { initMinesweeperGame(canvas, ctx); return; }

    const rect = canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left) / CELL);
    const r = Math.floor((e.clientY - rect.top) / CELL);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;

    if (e.button === 2) {
      flagged[r][c] = !flagged[r][c];
      draw();
      return;
    }

    if (flagged[r][c]) return;

    if (firstClick) {
      firstClick = false;
      placeMines(r, c);
    }

    if (board[r][c] === -1) {
      // Game over — reveal all mines
      gameOver = true;
      for (let rr = 0; rr < ROWS; rr++)
        for (let cc = 0; cc < COLS; cc++)
          if (board[rr][cc] === -1) revealed[rr][cc] = true;
      draw();
      return;
    }

    reveal(r, c);

    if (checkWin()) {
      won = true;
      gameOver = true;
      gameScore += 500;
      document.getElementById('game-score').textContent = gameScore;
    }

    draw();
  };
  document.onkeydown = null;

  const NUM_COLORS = ['', '#74b9ff', '#00b894', '#fd79a8', '#6c5ce7', '#e17055', '#00cec9', '#fdcb6e', '#dfe6e9'];

  function draw() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * CELL, y = r * CELL;

        if (revealed[r][c]) {
          ctx.fillStyle = '#16162e';
          ctx.fillRect(x+1, y+1, CELL-2, CELL-2);

          if (board[r][c] === -1) {
            ctx.fillStyle = '#d63031';
            ctx.beginPath();
            ctx.arc(x + CELL/2, y + CELL/2, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#2d3436';
            ctx.beginPath();
            ctx.arc(x + CELL/2, y + CELL/2, 5, 0, Math.PI * 2);
            ctx.fill();
          } else if (board[r][c] > 0) {
            ctx.fillStyle = NUM_COLORS[board[r][c]];
            ctx.font = 'bold 18px Inter';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(board[r][c], x + CELL/2, y + CELL/2 + 1);
          }
        } else {
          ctx.fillStyle = '#1e1e42';
          ctx.beginPath();
          ctx.roundRect(x+1, y+1, CELL-2, CELL-2, 4);
          ctx.fill();

          if (flagged[r][c]) {
            ctx.fillStyle = '#fd79a8';
            ctx.font = '18px Inter';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🚩', x + CELL/2, y + CELL/2);
          }
        }
      }
    }

    if (gameOver && !won) {
      ctx.fillStyle = 'rgba(214, 48, 49, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fd79a8';
      ctx.font = 'bold 28px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('💥 BOOM!', canvas.width/2, canvas.height/2 - 10);
      ctx.fillStyle = '#6666aa';
      ctx.font = '13px Inter';
      ctx.fillText('Click to restart', canvas.width/2, canvas.height/2 + 25);
    }

    if (won) {
      ctx.fillStyle = 'rgba(0, 184, 148, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#00b894';
      ctx.font = 'bold 28px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('🎉 You Win!', canvas.width/2, canvas.height/2 - 10);
      ctx.fillStyle = '#a29bfe';
      ctx.font = '16px Inter';
      ctx.fillText(`Score: ${gameScore}`, canvas.width/2, canvas.height/2 + 20);
    }
  }

  init();
  draw();
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
    if (e.key === 'Enter') {
      const url = document.getElementById('media-url-input').value.trim();
      if (url) fetchMediaInfo(url);
    }
  });

  document.getElementById('dl-video-btn').addEventListener('click', () => startDownload('video'));
  document.getElementById('dl-audio-btn').addEventListener('click', () => startDownload('audio'));

  // Load existing downloads
  refreshDownloads();
}

let currentMediaInfo = null;

async function fetchMediaInfo(url) {
  const btn = document.getElementById('fetch-media-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Analyzing...';

  try {
    const res = await fetch('/api/media/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      return;
    }

    currentMediaInfo = data;

    // Show media info
    const card = document.getElementById('media-info-card');
    card.style.display = '';

    document.getElementById('media-thumb').src = data.thumbnail || '';
    document.getElementById('media-title').textContent = data.title || 'Unknown';
    document.getElementById('media-uploader').textContent = data.uploader || '';

    if (data.duration) {
      const mins = Math.floor(data.duration / 60);
      const secs = data.duration % 60;
      document.getElementById('media-duration').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // Show format options
    const opts = document.getElementById('download-options');
    opts.style.display = '';

    // Build format chips
    const grid = document.getElementById('dl-format-grid');
    const videoFormats = data.formats
      .filter(f => f.has_video && f.height)
      .reduce((acc, f) => {
        const key = `${f.height}p`;
        if (!acc.find(a => a.label === key)) {
          acc.push({ label: key, format_id: f.format_id, filesize: f.filesize });
        }
        return acc;
      }, []);

    grid.innerHTML = videoFormats.map(f => `
      <button class="dl-format-chip" data-format="${f.format_id}" data-mode="video">
        ${f.label}
        ${f.filesize ? `<span style="opacity:0.6;font-size:10px">(${formatSize(f.filesize)})</span>` : ''}
      </button>
    `).join('');

    grid.querySelectorAll('.dl-format-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        grid.querySelectorAll('.dl-format-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
      });
    });

    showToast('Media analyzed successfully!', 'success');

  } catch (err) {
    showToast('Failed to analyze URL. Make sure it\'s a valid video/music URL.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Analyze`;
  }
}

async function startDownload(mode) {
  const url = document.getElementById('media-url-input').value.trim();
  if (!url) { showToast('Please enter a URL first', 'error'); return; }

  const selectedChip = document.querySelector('.dl-format-chip.selected');
  const formatId = selectedChip ? selectedChip.dataset.format : null;

  try {
    const res = await fetch('/api/media/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format_id: formatId, mode })
    });

    const data = await res.json();
    if (data.error) { showToast(data.error, 'error'); return; }

    // Track download progress
    trackDownload(data.downloadId, mode);

    showToast(`Download started! ${mode === 'audio' ? '🎵 Audio' : '🎬 Video'}`, 'success');

  } catch (err) {
    showToast('Failed to start download', 'error');
  }
}

function trackDownload(downloadId, mode) {
  const container = document.getElementById('active-downloads');

  const item = document.createElement('div');
  item.className = 'active-download-item';
  item.id = `dl-${downloadId}`;
  item.innerHTML = `
    <div class="active-dl-icon">${mode === 'audio' ? '🎵' : '🎬'}</div>
    <div class="active-dl-info">
      <div class="dl-name">Downloading ${mode}...</div>
      <div class="progress-bar"><div class="progress-fill" style="width:0%"></div></div>
    </div>
    <div class="active-dl-percent">0%</div>
  `;
  container.prepend(item);

  state.activeDownloads.set(downloadId, { mode });

  const poll = setInterval(async () => {
    try {
      const res = await fetch(`/api/media/progress/${downloadId}`);
      const data = await res.json();

      const fill = item.querySelector('.progress-fill');
      const pct = item.querySelector('.active-dl-percent');
      const name = item.querySelector('.dl-name');

      fill.style.width = `${data.progress}%`;
      pct.textContent = `${Math.round(data.progress)}%`;

      if (data.filename) name.textContent = data.filename;

      if (data.status === 'complete') {
        clearInterval(poll);
        fill.style.width = '100%';
        pct.textContent = '✓';
        pct.style.color = '#00b894';
        state.activeDownloads.delete(downloadId);
        showToast('Download complete!', 'success');
        refreshDownloads();

        // Update badge
        updateDownloadBadge();
      }

      if (data.status === 'error') {
        clearInterval(poll);
        pct.textContent = '✗';
        pct.style.color = '#d63031';
        state.activeDownloads.delete(downloadId);
        showToast('Download failed', 'error');
      }
    } catch (e) {}
  }, 1000);
}

async function refreshDownloads() {
  try {
    const res = await fetch('/api/downloads');
    const files = await res.json();

    const list = document.getElementById('download-list');

    if (files.length === 0) {
      list.innerHTML = '<p class="empty-state">No downloads yet</p>';
      return;
    }

    list.innerHTML = files.map(f => `
      <div class="download-item">
        <div class="dl-item-icon ${f.type}">
          ${f.type === 'video' ? '🎬' : f.type === 'audio' ? '🎵' : '📄'}
        </div>
        <div class="dl-item-info">
          <div class="dl-item-name">${escapeHtml(f.name)}</div>
          <div class="dl-item-meta">${formatSize(f.size)} · ${f.ext.replace('.', '').toUpperCase()}</div>
        </div>
        <div class="dl-item-actions">
          <a href="${f.url}" download class="dl-action-btn" title="Download">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </a>
          <button class="dl-action-btn delete" data-file="${escapeHtml(f.name)}" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.dl-action-btn.delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const filename = btn.dataset.file;
        try {
          await fetch(`/api/downloads/${encodeURIComponent(filename)}`, { method: 'DELETE' });
          refreshDownloads();
          showToast('File deleted', 'info');
        } catch (e) {
          showToast('Failed to delete', 'error');
        }
      });
    });

  } catch (e) {}
}

function updateDownloadBadge() {
  const badge = document.getElementById('download-badge');
  const count = state.activeDownloads.size;
  if (count > 0) {
    badge.style.display = '';
    badge.textContent = count;
  } else {
    badge.style.display = 'none';
  }
}

// ── Settings ────────────────────────────────────────────────────
function initSettings() {
  const themeSelect = document.getElementById('theme-select');
  themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));

  const engineSelect = document.getElementById('default-engine-select');
  engineSelect.value = state.currentEngine;
  engineSelect.addEventListener('change', () => {
    state.currentEngine = engineSelect.value;
    localStorage.setItem('novase_engine', state.currentEngine);
    updateEngineDisplay();
  });

  document.getElementById('clear-data-btn').addEventListener('click', () => {
    if (confirm('Clear all bookmarks, history, and settings?')) {
      localStorage.clear();
      state.bookmarks = [];
      state.history = [];
      showToast('All data cleared', 'info');
    }
  });
}

// ── Utilities ───────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatSize(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(1)} ${units[i]}`;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    ${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}
    ${escapeHtml(message)}
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
