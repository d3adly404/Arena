/* ============================================================
   BedTrack — Hospital Bed & Emergency Tracker (simulator)
   Vanilla JS. State persists in localStorage.
   ============================================================ */
'use strict';

// ---------- Configuration ----------
const WARDS = [
  { id: 'ER',  name: 'Emergency',  icon: '🚑', beds: 10 },
  { id: 'ICU', name: 'ICU',        icon: '❤️', beds: 8 },
  { id: 'GEN', name: 'General',    icon: '🏥', beds: 20 },
  { id: 'MAT', name: 'Maternity',  icon: '👶', beds: 6 },
  { id: 'PED', name: 'Pediatrics', icon: '🧸', beds: 6 },
  { id: 'SUR', name: 'Surgery',    icon: '🩺', beds: 6 },
  { id: 'ISO', name: 'Isolation',  icon: '🧫', beds: 4 },
];

const STATUS_META = {
  available:   { label: 'Available',   icon: '🟢' },
  occupied:    { label: 'Occupied',    icon: '🔵' },
  reserved:    { label: 'Reserved',    icon: '🟡' },
  cleaning:    { label: 'Cleaning',    icon: '🧹' },
  maintenance: { label: 'Maintenance', icon: '🔧' },
};

const TRIAGE_META = {
  red:    { label: 'RED',    name: 'Immediate', rank: 0 },
  yellow: { label: 'YELLOW', name: 'Delayed',   rank: 1 },
  green:  { label: 'GREEN',  name: 'Minor',     rank: 2 },
  black:  { label: 'BLACK',  name: 'Expectant', rank: 3 },
};

const CLEAN_MS = 15000;          // simulated cleaning time before a bed returns to service
const STORAGE_KEY = 'bedtrack-v1';

// ---------- State ----------
let state = {
  beds: [],
  emergencies: [],
  events: [],
  seq: 0,
  autoAssign: true,
};
let simRun = null;               // active scenario run (ephemeral, not persisted)
let simTimers = [];
let currentTab = 'dashboard';
let bedFilterStatus = 'all';
let bedFilterWard = 'all';
let formMode = 'emergency';      // 'emergency' | 'direct'
let formTargetBed = null;

// ---------- Utilities ----------
const $ = (sel) => document.querySelector(sel);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtClock(d) {
  return d.toTimeString().slice(0, 5);
}

function fmtAgo(t) {
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm ago';
}

function fmtCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s + 's';
}

function wardName(id) {
  const w = WARDS.find((x) => x.id === id);
  return w ? w.name : id;
}

// ---------- Persistence ----------
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      beds: state.beds,
      emergencies: state.emergencies,
      events: state.events,
      seq: state.seq,
      autoAssign: state.autoAssign,
    }));
  } catch (e) { /* storage may be unavailable */ }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.beds) || !data.beds.length) return false;
    state.beds = data.beds;
    state.emergencies = data.emergencies || [];
    state.events = data.events || [];
    state.seq = data.seq || 0;
    state.autoAssign = data.autoAssign !== false;
    return true;
  } catch (e) {
    return false;
  }
}

// ---------- Seed / reset ----------
function makeBed(ward, n) {
  return {
    id: ward.id + '-' + String(n).padStart(2, '0'),
    ward: ward.id,
    status: 'available',
    patient: null,
    readyAt: 0,
    reservedNote: '',
  };
}

function seed() {
  state.beds = [];
  state.emergencies = [];
  state.events = [];
  state.seq = 0;

  WARDS.forEach((w) => {
    for (let i = 1; i <= w.beds; i++) state.beds.push(makeBed(w, i));
  });

  // Fill ~60% with simulated existing patients
  state.beds.forEach((bed) => {
    if (Math.random() < 0.6) {
      const sex = Math.random() < 0.5 ? 'M' : 'F';
      const isPeds = bed.ward === 'PED';
      const isMat = bed.ward === 'MAT';
      const condMap = {
        ER: ['Fractured arm', 'Abdominal pain', 'Migraine crisis', 'Severe lacerations', 'Asthma attack'],
        ICU: ['Respiratory failure', 'Post-op monitoring', 'Heart failure', 'Sepsis', 'Stroke (CVA)'],
        GEN: ['Pneumonia', 'Dehydration', 'Diabetes control', 'Urinary infection', 'Post-op recovery'],
        MAT: ['Labour pains', 'Post-partum care', 'Pregnancy monitoring', 'Pre-eclampsia'],
        PED: ['Bronchiolitis', 'Febrile seizure', 'Mild asthma', 'Gastroenteritis'],
        SUR: ['Post-op recovery', 'Appendectomy', 'Fracture surgery', 'Cholecystectomy'],
        ISO: ['Suspected virus', 'Tuberculosis', 'Measles isolation', 'High fever'],
      };
      bed.status = 'occupied';
      bed.patient = {
        name: SIMUTIL.randomName(sex),
        sex: sex,
        age: isPeds ? rand(1, 13) : isMat ? rand(19, 42) : rand(18, 88),
        condition: pick(condMap[bed.ward] || ['Under observation']),
        triage: pick(['green', 'yellow', 'yellow', 'red']),
        admittedAt: Date.now() - rand(20, 60 * 12) * 60 * 1000,
        source: 'Admission',
      };
    }
  });

  addEvent('🏥', 'Hospital system started — simulated data loaded');
  save();
}

// ---------- Events & toasts ----------
function addEvent(icon, text) {
  state.events.unshift({ t: Date.now(), icon: icon, text: text });
  if (state.events.length > 60) state.events.length = 60;
}

function toast(text, type) {
  const wrap = $('#toasts');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = text;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 350);
  }, 4200);
}

// ---------- Stats ----------
function counts() {
  const c = { available: 0, occupied: 0, reserved: 0, cleaning: 0, maintenance: 0, total: state.beds.length };
  state.beds.forEach((b) => { c[b.status]++; });
  c.enroute = state.emergencies.filter((e) => e.status === 'en-route').length;
  c.waiting = state.emergencies.filter((e) => e.status === 'waiting').length;
  c.critical = state.emergencies.filter((e) => e.status === 'waiting' && e.triage === 'red').length;
  c.occupancy = c.total ? Math.round((c.occupied / c.total) * 100) : 0;
  return c;
}

// ---------- Emergency arrivals ----------
function addEmergency(p, sourceLabel) {
  const em = {
    id: 'em-' + (++state.seq),
    name: p.name,
    sex: p.sex || (Math.random() < 0.5 ? 'M' : 'F'),
    age: p.age,
    condition: p.condition,
    triage: p.triage,
    needs: p.needs,
    status: 'en-route',
    eta: Date.now() + rand(5, 16) * 1000,
    createdAt: Date.now(),
    source: sourceLabel || 'Ambulance',
    bedId: null,
  };
  state.emergencies.push(em);
  addEvent('🚑', em.name + ' (' + em.age + ') en-route — ' + TRIAGE_META[em.triage].label + ' — ' + em.condition);
  toast('🚑 Incoming: ' + em.name + ' — ' + TRIAGE_META[em.triage].label + ' — ' + em.condition, em.triage === 'red' ? 'danger' : '');
  return em;
}

function findBestBed(p) {
  const avail = state.beds.filter((b) => b.status === 'available');
  if (!avail.length) return null;
  const inPref = avail.find((b) => b.ward === p.needs);
  if (inPref) return inPref;

  let order;
  if (p.triage === 'red') order = ['ER', 'ICU', 'SUR', 'GEN', 'PED', 'ISO', 'MAT'];
  else if (p.triage === 'yellow') order = ['ER', 'GEN', 'SUR', 'PED', 'ISO', 'MAT', 'ICU'];
  else order = ['GEN', 'ER', 'PED', 'MAT', 'SUR', 'ISO', 'ICU'];

  for (const w of order) {
    const b = avail.find((x) => x.ward === w);
    if (b) return b;
  }
  return avail[0];
}

function admitPatientToBed(bed, p, sourceLabel) {
  bed.status = 'occupied';
  bed.readyAt = 0;
  bed.patient = {
    name: p.name,
    sex: p.sex,
    age: p.age,
    condition: p.condition,
    triage: p.triage,
    admittedAt: Date.now(),
    source: sourceLabel || 'Emergency',
  };
}

function processArrival(em) {
  em.status = 'waiting';
  em.eta = 0;

  if (state.autoAssign) {
    const bed = findBestBed(em);
    if (bed) {
      em.status = 'assigned';
      em.bedId = bed.id;
      admitPatientToBed(bed, em, em.source);
      addEvent('🛏️', em.name + ' → ' + bed.id + ' (' + wardName(bed.ward) + ') — ' + em.condition);
      toast('✅ ' + em.name + ' assigned to ' + bed.id, 'success');
    } else {
      addEvent('⏳', em.name + ' waiting for a bed — NO BED AVAILABLE');
      toast('🚨 NO BED for ' + em.name + ' (' + TRIAGE_META[em.triage].label + ') — patient waiting!', 'danger');
    }
  } else {
    addEvent('🏥', em.name + ' arrived in the ER queue');
  }
}

function assignEmergency(emId) {
  const em = state.emergencies.find((e) => e.id === emId);
  if (!em || em.status === 'assigned') return;
  const bed = findBestBed(em);
  if (!bed) {
    toast('No bed available for ' + em.name + ' right now', 'danger');
    return;
  }
  em.status = 'assigned';
  em.bedId = bed.id;
  admitPatientToBed(bed, em, em.source);
  addEvent('🛏️', em.name + ' → ' + bed.id + ' (manual assign)');
  toast('✅ ' + em.name + ' assigned to ' + bed.id, 'success');
  save();
  renderAll();
}

function cancelEmergency(emId) {
  const em = state.emergencies.find((e) => e.id === emId);
  if (!em) return;
  state.emergencies = state.emergencies.filter((e) => e.id !== emId);
  addEvent('✖', em.name + ' removed from the queue');
  save();
  renderAll();
}

// ---------- Bed actions ----------
function dischargeBed(bedId) {
  const bed = state.beds.find((b) => b.id === bedId);
  if (!bed || !bed.patient) return;
  const name = bed.patient.name;
  bed.status = 'cleaning';
  bed.patient = null;
  bed.readyAt = Date.now() + CLEAN_MS;
  state.emergencies = state.emergencies.filter((e) => e.bedId !== bedId || e.status !== 'assigned');
  addEvent('📤', name + ' discharged from ' + bedId + ' — cleaning started');
  toast('📤 ' + name + ' discharged — ' + bedId + ' cleaning');
  save();
  renderAll();
}

function setBedStatus(bedId, status, note) {
  const bed = state.beds.find((b) => b.id === bedId);
  if (!bed) return;
  bed.status = status;
  bed.readyAt = status === 'cleaning' ? Date.now() + CLEAN_MS : 0;
  if (status !== 'occupied') bed.patient = null;
  bed.reservedNote = note || '';
  addEvent('🔧', bedId + ' → ' + STATUS_META[status].label);
  save();
  renderAll();
}

function returnToService(bedId) {
  const bed = state.beds.find((b) => b.id === bedId);
  if (!bed) return;
  bed.status = 'available';
  bed.readyAt = 0;
  bed.reservedNote = '';
  addEvent('🟢', bedId + ' back in service');
  save();
  renderAll();
}

// ---------- Scenarios ----------
function startScenario(id) {
  const sc = (window.SCENARIOS || []).find((s) => s.id === id);
  if (!sc) return;
  stopScenario(true);

  const arrivals = sc.build().sort((a, b) => a.delay - b.delay);
  simRun = {
    id: sc.id,
    icon: sc.icon,
    name: sc.name,
    total: arrivals.length,
    arrived: 0,
    startedAt: Date.now(),
  };
  arrivals.forEach((a) => {
    const t = setTimeout(() => {
      addEmergency(a.patient, sc.name);
      if (simRun) simRun.arrived++;
      save();
      renderAll();
    }, a.delay * 1000);
    simTimers.push(t);
  });

  addEvent(sc.icon, 'Scenario started: ' + sc.name + ' — ' + arrivals.length + ' expected casualties');
  toast(sc.icon + ' Scenario running: ' + sc.name, 'warning');
  save();
  renderAll();
}

function stopScenario(silent) {
  simTimers.forEach((t) => clearTimeout(t));
  simTimers = [];
  if (simRun && !silent) {
    addEvent('⏹', 'Scenario stopped: ' + simRun.name + ' (' + simRun.arrived + '/' + simRun.total + ' arrived)');
    toast('⏹ Scenario stopped');
  }
  simRun = null;
  renderAll();
}

// ---------- Rendering ----------
function renderAll() {
  renderHeader();
  renderAlert();
  renderDashboard();
  renderBeds();
  renderEmergencies();
  renderSimulate();
}

function renderHeader() {
  const c = counts();
  const clock = $('#clock');
  if (clock) clock.textContent = fmtClock(new Date());
  const pill = $('#occPill');
  if (pill) {
    pill.textContent = c.occupancy + '%';
    pill.className = 'occ-pill ' + (c.occupancy >= 90 ? 'danger' : c.occupancy >= 75 ? 'warn' : 'ok');
    pill.title = c.occupied + ' of ' + c.total + ' beds occupied';
  }
}

function renderAlert() {
  const bar = $('#alertBar');
  if (!bar) return;
  const c = counts();
  const msgs = [];
  if (c.waiting > 0) msgs.push({ icon: '🚨', text: c.waiting + ' patient' + (c.waiting > 1 ? 's' : '') + ' waiting for a bed' + (c.critical ? ' (' + c.critical + ' critical)' : ''), cls: 'danger' });
  if (c.occupancy >= 85) msgs.push({ icon: '⚠️', text: 'Capacity critical: ' + c.occupancy + '% occupied — ' + c.available + ' beds left', cls: 'danger' });
  else if (c.occupancy >= 70) msgs.push({ icon: '📊', text: 'High load: ' + c.occupancy + '% occupied', cls: 'warn' });
  if (c.enroute > 0) msgs.push({ icon: '🚑', text: c.enroute + ' ambulance' + (c.enroute > 1 ? 's' : '') + ' en-route', cls: 'info' });

  if (!msgs.length) {
    bar.innerHTML = '<div class="alert ok">✅ All clear — ' + c.available + ' beds available</div>';
  } else {
    bar.innerHTML = msgs.slice(0, 2).map((m) => '<div class="alert ' + m.cls + '">' + m.icon + ' ' + esc(m.text) + '</div>').join('');
  }
}

function renderDashboard() {
  const el = $('#page-dashboard');
  if (!el) return;
  const c = counts();

  const wardRows = WARDS.map((w) => {
    const beds = state.beds.filter((b) => b.ward === w.id);
    const occ = beds.filter((b) => b.status === 'occupied').length;
    const pct = beds.length ? Math.round((occ / beds.length) * 100) : 0;
    return (
      '<div class="ward-row">' +
      '<div class="ward-ic">' + w.icon + '</div>' +
      '<div class="ward-mid">' +
      '<div class="ward-name">' + esc(w.name) + ' <span class="muted">' + occ + '/' + beds.length + '</span></div>' +
      '<div class="bar"><div class="bar-fill ' + (pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : '') + '" style="width:' + pct + '%"></div></div>' +
      '</div>' +
      '<div class="ward-pct">' + pct + '%</div>' +
      '</div>'
    );
  }).join('');

  const events = state.events.slice(0, 8).map((e) =>
    '<li><span class="ev-ic">' + e.icon + '</span><span class="ev-tx">' + esc(e.text) + '</span><span class="ev-time">' + fmtAgo(e.t) + '</span></li>'
  ).join('');

  el.innerHTML =
    '<div class="stat-grid">' +
      statCard('🟢', 'Available', c.available, 'ok') +
      statCard('🔵', 'Occupied', c.occupied, 'info') +
      statCard('🚨', 'Waiting', c.waiting + (c.enroute ? ' (+' + c.enroute + ' en-route)' : ''), c.waiting ? 'danger' : 'info') +
      statCard('🩺', 'Critical', c.critical, c.critical ? 'danger' : 'ok') +
    '</div>' +

    '<div class="card">' +
      '<div class="card-h"><h2>Bed occupancy</h2><span class="big-pct">' + c.occupancy + '%</span></div>' +
      '<div class="bar big"><div class="bar-fill ' + (c.occupancy >= 90 ? 'danger' : c.occupancy >= 70 ? 'warn' : '') + '" style="width:' + c.occupancy + '%"></div></div>' +
      '<div class="mini-stats">' +
        '<span>🛏️ ' + c.total + ' total</span><span>🟢 ' + c.available + ' free</span>' +
        '<span>🧹 ' + c.cleaning + ' cleaning</span><span>🔧 ' + c.maintenance + ' maint.</span>' +
      '</div>' +
    '</div>' +

    '<div class="card"><h2>Wards</h2>' + wardRows + '</div>' +

    '<div class="card"><div class="card-h"><h2>Recent activity</h2><button class="btn ghost small" data-action="clear-events">Clear</button></div>' +
      (events ? '<ul class="events">' + events + '</ul>' : '<p class="muted">No activity yet.</p>') +
    '</div>' +

    '<div class="card subtle"><p class="muted small">🔬 <strong>Simulation mode.</strong> All patients, ambulances and emergencies are generated scenarios for training/demo purposes. Data is stored on this device.</p></div>';
}

function statCard(icon, label, value, cls) {
  return (
    '<div class="stat ' + cls + '">' +
    '<div class="stat-ic">' + icon + '</div>' +
    '<div class="stat-val">' + value + '</div>' +
    '<div class="stat-lb">' + label + '</div>' +
    '</div>'
  );
}

function renderBeds() {
  const el = $('#page-beds');
  if (!el) return;

  const statusChips = ['all', 'available', 'occupied', 'reserved', 'cleaning', 'maintenance'].map((s) =>
    '<button class="chip ' + (bedFilterStatus === s ? 'on' : '') + '" data-action="filter-status" data-value="' + s + '">' +
    (s === 'all' ? 'All' : STATUS_META[s].icon + ' ' + STATUS_META[s].label) + '</button>'
  ).join('');

  const wardChips = ['all'].concat(WARDS.map((w) => w.id)).map((w) =>
    '<button class="chip ' + (bedFilterWard === w ? 'on' : '') + '" data-action="filter-ward" data-value="' + w + '">' +
    (w === 'all' ? 'All wards' : WARDS.find((x) => x.id === w).icon + ' ' + WARDS.find((x) => x.id === w).name) + '</button>'
  ).join('');

  const sections = WARDS.filter((w) => bedFilterWard === 'all' || bedFilterWard === w.id).map((w) => {
    const beds = state.beds.filter((b) =>
      b.ward === w.id && (bedFilterStatus === 'all' || b.status === bedFilterStatus)
    );
    if (!beds.length) return '';
    const cards = beds.map((b) => {
      const cls = ['bed-card', 'st-' + b.status];
      let sub = STATUS_META[b.status].label;
      if (b.status === 'occupied' && b.patient) {
        sub = esc(b.patient.name.split(' ')[0]) + ' · ' + b.patient.age;
        cls.push('tr-' + b.patient.triage);
      } else if (b.status === 'cleaning' && b.readyAt) {
        sub = 'Ready in ' + fmtCountdown(b.readyAt - Date.now());
      } else if (b.status === 'reserved' && b.reservedNote) {
        sub = esc(b.reservedNote);
      }
      return (
        '<button class="' + cls.join(' ') + '" data-action="open-bed" data-bed="' + b.id + '">' +
        '<div class="bed-top"><span class="bed-id">' + b.id + '</span><span class="bed-dot"></span></div>' +
        '<div class="bed-sub">' + sub + '</div>' +
        '</button>'
      );
    }).join('');
    return (
      '<div class="ward-block">' +
      '<h2 class="ward-title">' + w.icon + ' ' + esc(w.name) + ' <span class="muted">' + beds.length + '</span></h2>' +
      '<div class="bed-grid">' + cards + '</div>' +
      '</div>'
    );
  }).join('');

  el.innerHTML =
    '<div class="filters"><div class="chip-row">' + statusChips + '</div><div class="chip-row">' + wardChips + '</div></div>' +
    (sections || '<div class="card"><p class="muted">No beds match this filter.</p></div>');
}

function renderEmergencies() {
  const el = $('#page-emergencies');
  if (!el) return;

  const queue = state.emergencies
    .filter((e) => e.status !== 'assigned')
    .sort((a, b) => {
      const aw = a.status === 'waiting' ? 0 : 1;
      const bw = b.status === 'waiting' ? 0 : 1;
      if (aw !== bw) return aw - bw;
      const at = TRIAGE_META[a.triage].rank - TRIAGE_META[b.triage].rank;
      if (at !== 0) return at;
      return a.createdAt - b.createdAt;
    });

  const list = queue.map((e) => {
    const enroute = e.status === 'en-route';
    const eta = enroute ? fmtCountdown(e.eta - Date.now()) : '';
    return (
      '<div class="em-card tr-' + e.triage + '">' +
      '<div class="em-stripe"></div>' +
      '<div class="em-main">' +
        '<div class="em-head">' +
          '<strong>' + esc(e.name) + '</strong> <span class="triage-badge tb-' + e.triage + '">' + TRIAGE_META[e.triage].label + '</span>' +
          (enroute ? '<span class="chip sm" data-eta="' + e.id + '">🚑 en-route ' + eta + '</span>' : '<span class="chip sm warn">⏳ waiting</span>') +
        '</div>' +
        '<div class="em-sub">' + e.age + ' · ' + (e.sex === 'F' ? 'Female' : 'Male') + ' · ' + esc(e.condition) + '</div>' +
        '<div class="em-sub muted">Needs: ' + esc(wardName(e.needs)) + ' · ' + esc(e.source) + '</div>' +
      '</div>' +
      '<div class="em-actions">' +
        (enroute
          ? '<button class="btn small" disabled>En-route</button>'
          : '<button class="btn small primary" data-action="assign-em" data-em="' + e.id + '">Assign bed</button>') +
        '<button class="btn small ghost" data-action="cancel-em" data-em="' + e.id + '">Remove</button>' +
      '</div>' +
      '</div>'
    );
  }).join('');

  const recent = state.emergencies
    .filter((e) => e.status === 'assigned')
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 6)
    .map((e) =>
      '<li><span class="ev-ic">🛏️</span><span class="ev-tx">' + esc(e.name) + ' → ' + esc(e.bedId) + ' · ' + esc(e.condition) + '</span><span class="ev-time">' + fmtAgo(e.createdAt) + '</span></li>'
    ).join('');

  const c = counts();
  el.innerHTML =
    '<div class="row-actions">' +
      '<button class="btn primary" data-action="new-emergency">＋ New emergency</button>' +
      '<label class="switch"><input type="checkbox" id="autoAssign"' + (state.autoAssign ? ' checked' : '') + '><span class="slider"></span><span class="sw-label">Auto-assign</span></label>' +
    '</div>' +

    '<div class="stat-grid two">' +
      statCard('🚑', 'En-route', c.enroute, 'info') +
      statCard('⏳', 'Waiting', c.waiting, c.waiting ? 'danger' : 'ok') +
    '</div>' +

    (queue.length
      ? queue.map(() => '').join('') + list
      : '<div class="card"><p class="muted">🎉 Queue is empty. No incoming emergencies right now.</p></div>') +

    (recent ? '<div class="card"><h2>Recently admitted</h2><ul class="events">' + recent + '</ul></div>' : '');
}

function renderSimulate() {
  const el = $('#page-simulate');
  if (!el) return;

  const cards = (window.SCENARIOS || []).map((s) =>
    '<button class="sim-card" data-action="start-sim" data-sim="' + s.id + '">' +
    '<div class="sim-ic">' + s.icon + '</div>' +
    '<div class="sim-body">' +
      '<div class="sim-name">' + esc(s.name) + '</div>' +
      '<div class="sim-tag">' + esc(s.tag) + '</div>' +
      '<div class="sim-desc">' + esc(s.desc) + '</div>' +
    '</div>' +
    '<div class="sim-go">▶</div>' +
    '</button>'
  ).join('');

  let runHtml = '';
  if (simRun) {
    const pct = Math.round((simRun.arrived / simRun.total) * 100);
    const elapsed = Math.floor((Date.now() - simRun.startedAt) / 1000);
    runHtml =
      '<div class="card sim-run">' +
      '<div class="card-h"><h2>' + simRun.icon + ' ' + esc(simRun.name) + ' running</h2>' +
      '<button class="btn small danger" data-action="stop-sim">⏹ Stop</button></div>' +
      '<div class="bar big"><div class="bar-fill warn" style="width:' + pct + '%"></div></div>' +
      '<div class="mini-stats"><span>' + simRun.arrived + '/' + simRun.total + ' arrived</span><span>⏱ ' + elapsed + 's elapsed</span></div>' +
      '</div>';
  }

  el.innerHTML =
    runHtml +
    '<div class="card subtle"><p class="muted small">🧪 Tap any scenario to simulate an emergency. Patients arrive by ambulance over time and are auto-assigned to beds when available. Watch the dashboard, bed board and queue react live.</p></div>' +
    '<div class="sim-grid">' + cards + '</div>' +
    '<div class="card"><h2>Reset</h2><p class="muted small">Restore the hospital to its starting state with fresh simulated patients.</p>' +
    '<button class="btn danger" data-action="reset-all">↺ Reset hospital</button></div>';
}

// ---------- Bed sheet ----------
function openBedSheet(bedId) {
  const bed = state.beds.find((b) => b.id === bedId);
  if (!bed) return;
  const sheet = $('#bedSheet');
  const meta = STATUS_META[bed.status];
  const w = WARDS.find((x) => x.id === bed.ward);

  let body = '';
  let actions = '';

  if (bed.status === 'occupied' && bed.patient) {
    const p = bed.patient;
    body =
      '<div class="patient-box">' +
      '<div class="p-name">' + esc(p.name) + ' <span class="triage-badge tb-' + p.triage + '">' + TRIAGE_META[p.triage].label + '</span></div>' +
      '<div class="p-line">👤 ' + p.age + ' years · ' + (p.sex === 'F' ? 'Female' : 'Male') + '</div>' +
      '<div class="p-line">🩺 ' + esc(p.condition) + '</div>' +
      '<div class="p-line">🕐 Admitted ' + fmtAgo(p.admittedAt) + ' · via ' + esc(p.source || 'Admission') + '</div>' +
      '</div>';
    actions =
      '<button class="btn primary" data-action="discharge" data-bed="' + bed.id + '">📤 Discharge (starts cleaning)</button>' +
      '<button class="btn ghost" data-action="maintenance" data-bed="' + bed.id + '">🔧 Send to maintenance</button>';
  } else if (bed.status === 'available') {
    body = '<p class="muted">This bed is free and ready for a patient.</p>';
    actions =
      '<button class="btn primary" data-action="admit-here" data-bed="' + bed.id + '">＋ Admit patient here</button>' +
      '<button class="btn ghost" data-action="reserve" data-bed="' + bed.id + '">📌 Reserve for incoming</button>' +
      '<button class="btn ghost" data-action="maintenance" data-bed="' + bed.id + '">🔧 Mark maintenance</button>';
  } else if (bed.status === 'reserved') {
    body = '<p class="muted">Reserved' + (bed.reservedNote ? ' — ' + esc(bed.reservedNote) : ' for an incoming patient') + '.</p>';
    actions =
      '<button class="btn primary" data-action="admit-here" data-bed="' + bed.id + '">＋ Admit patient here</button>' +
      '<button class="btn ghost" data-action="unreserve" data-bed="' + bed.id + '">✕ Cancel reservation</button>';
  } else if (bed.status === 'cleaning') {
    body = '<p class="muted">Being cleaned & disinfected. Auto-ready in <strong>' + fmtCountdown(bed.readyAt - Date.now()) + '</strong>.</p>';
    actions = '<button class="btn primary" data-action="clean-now" data-bed="' + bed.id + '">✓ Mark clean & available</button>';
  } else {
    body = '<p class="muted">Out of service for maintenance.</p>';
    actions = '<button class="btn primary" data-action="unreserve" data-bed="' + bed.id + '">↺ Return to service</button>';
  }

  sheet.innerHTML =
    '<div class="handle"></div>' +
    '<div class="sheet-head">' +
    '<div><h2>' + bed.id + '</h2><div class="muted">' + w.icon + ' ' + esc(w.name) + ' ward</div></div>' +
    '<div class="status-badge st-' + bed.status + '">' + meta.icon + ' ' + meta.label + '</div>' +
    '</div>' +
    body +
    '<div class="sheet-actions">' + actions + '<button class="btn ghost" data-action="close-modal">Close</button></div>';

  openModal();
}

// ---------- Patient form ----------
function openForm(mode, bedId) {
  formMode = mode;
  formTargetBed = bedId || null;
  const bed = bedId ? state.beds.find((b) => b.id === bedId) : null;
  const sheet = $('#formSheet');
  const defaultWard = bed ? bed.ward : 'ER';

  sheet.innerHTML =
    '<div class="handle"></div>' +
    '<h2>' + (mode === 'direct' ? 'Admit to ' + esc(bedId) : 'New emergency') + '</h2>' +
    '<form id="patientForm" class="form">' +
      '<label>Name</label>' +
      '<div class="input-row">' +
        '<input type="text" id="fName" placeholder="Patient name" required>' +
        '<button type="button" class="btn small" data-action="random-name">🎲</button>' +
      '</div>' +
      '<div class="two-col">' +
        '<div><label>Age</label><input type="number" id="fAge" min="0" max="120" value="' + rand(18, 70) + '" required></div>' +
        '<div><label>Sex</label><select id="fSex"><option value="M">Male</option><option value="F">Female</option></select></div>' +
      '</div>' +
      '<label>Condition</label>' +
      '<input type="text" id="fCond" list="condList" placeholder="e.g. Head trauma" required>' +
      '<datalist id="condList">' +
        Object.keys(SIMUTIL.COND).map((k) => SIMUTIL.COND[k].map((c) => '<option value="' + esc(c) + '">').join('')).join('') +
      '</datalist>' +
      '<label>Triage level</label>' +
      '<div class="triage-pick">' +
        ['red', 'yellow', 'green', 'black'].map((t) =>
          '<label class="tp tp-' + t + '"><input type="radio" name="fTriage" value="' + t + '"' + (t === 'yellow' ? ' checked' : '') + '><span>' + TRIAGE_META[t].label + '</span></label>'
        ).join('') +
      '</div>' +
      '<label>Needs ward</label>' +
      '<select id="fWard">' + WARDS.map((w) => '<option value="' + w.id + '"' + (w.id === defaultWard ? ' selected' : '') + '>' + w.icon + ' ' + w.name + '</option>').join('') + '</select>' +
      '<div class="sheet-actions">' +
        '<button type="submit" class="btn primary">' + (mode === 'direct' ? '✓ Admit patient' : '🚑 Dispatch ambulance') + '</button>' +
        '<button type="button" class="btn ghost" data-action="close-modal">Cancel</button>' +
      '</div>' +
    '</form>';

  openModal();
  setTimeout(() => { const f = $('#fName'); if (f) f.focus(); }, 250);
}

function submitForm(ev) {
  ev.preventDefault();
  const name = $('#fName').value.trim() || SIMUTIL.randomName('M');
  const age = parseInt($('#fAge').value, 10) || 30;
  const sex = $('#fSex').value;
  const condition = $('#fCond').value.trim() || 'Under observation';
  const triage = (document.querySelector('input[name="fTriage"]:checked') || {}).value || 'yellow';
  const needs = $('#fWard').value;

  const p = { name, age, sex, condition, triage, needs };

  if (formMode === 'direct' && formTargetBed) {
    const bed = state.beds.find((b) => b.id === formTargetBed);
    if (bed) {
      admitPatientToBed(bed, p, 'Direct admission');
      addEvent('🏥', name + ' admitted directly to ' + bed.id);
      toast('✅ ' + name + ' admitted to ' + bed.id, 'success');
    }
  } else {
    addEmergency(p, 'Manual dispatch');
  }
  save();
  closeModal();
  renderAll();
}

// ---------- Modal ----------
function openModal() {
  $('#backdrop').classList.add('open');
  document.querySelectorAll('.sheet').forEach((s) => s.classList.add('open'));
}

function closeModal() {
  $('#backdrop').classList.remove('open');
  document.querySelectorAll('.sheet').forEach((s) => s.classList.remove('open'));
}

// ---------- Tick (clocks & countdowns) ----------
function tick() {
  const clock = $('#clock');
  if (clock) clock.textContent = fmtClock(new Date());

  // en-route arrivals
  let changed = false;
  state.emergencies.forEach((em) => {
    if (em.status === 'en-route' && Date.now() >= em.eta) {
      processArrival(em);
      changed = true;
    }
  });

  // cleaning auto-ready
  state.beds.forEach((b) => {
    if (b.status === 'cleaning' && b.readyAt && Date.now() >= b.readyAt) {
      b.status = 'available';
      b.readyAt = 0;
      addEvent('🟢', b.id + ' is clean & available');
      changed = true;
    }
  });

  if (changed) {
    save();
    renderAll();
    return;
  }

  // lightweight countdown updates (no full re-render)
  document.querySelectorAll('[data-eta]').forEach((el) => {
    const em = state.emergencies.find((e) => e.id === el.getAttribute('data-eta'));
    if (em && em.status === 'en-route') el.textContent = '🚑 en-route ' + fmtCountdown(em.eta - Date.now());
  });
  const bedSheetText = $('#bedSheet .p-line');
  void bedSheetText;
}

// ---------- Wiring ----------
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('on', b.getAttribute('data-tab') === tab);
  });
  document.querySelectorAll('.page').forEach((p) => {
    p.classList.toggle('active', p.id === 'page-' + tab);
  });
  renderAll();
  window.scrollTo({ top: 0 });
}

function init() {
  if (!load()) seed();
  renderAll();

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-action], .nav-btn');
    if (!t) return;

    if (t.classList.contains('nav-btn')) {
      switchTab(t.getAttribute('data-tab'));
      return;
    }

    const action = t.getAttribute('data-action');
    const bedId = t.getAttribute('data-bed');
    const emId = t.getAttribute('data-em');

    switch (action) {
      case 'open-bed': openBedSheet(bedId); break;
      case 'close-modal': closeModal(); break;
      case 'discharge': dischargeBed(bedId); closeModal(); break;
      case 'reserve': setBedStatus(bedId, 'reserved', 'Incoming patient'); closeModal(); break;
      case 'unreserve': returnToService(bedId); closeModal(); break;
      case 'maintenance': setBedStatus(bedId, 'maintenance'); closeModal(); break;
      case 'clean-now': returnToService(bedId); closeModal(); break;
      case 'admit-here': openForm('direct', bedId); break;
      case 'new-emergency': openForm('emergency', null); break;
      case 'random-name': {
        const f = $('#fName');
        if (f) f.value = SIMUTIL.randomName($('#fSex') ? $('#fSex').value : 'M');
        break;
      }
      case 'assign-em': assignEmergency(emId); break;
      case 'cancel-em': cancelEmergency(emId); break;
      case 'start-sim': startScenario(t.getAttribute('data-sim')); switchTab('dashboard'); break;
      case 'stop-sim': stopScenario(); break;
      case 'filter-status': bedFilterStatus = t.getAttribute('data-value'); renderBeds(); break;
      case 'filter-ward': bedFilterWard = t.getAttribute('data-value'); renderBeds(); break;
      case 'clear-events': state.events = []; save(); renderAll(); break;
      case 'reset-all':
        stopScenario(true);
        seed();
        renderAll();
        toast('↺ Hospital reset with fresh simulated data');
        break;
    }
  });

  document.addEventListener('submit', (ev) => {
    if (ev.target.id === 'patientForm') submitForm(ev);
  });

  document.addEventListener('change', (ev) => {
    if (ev.target.id === 'autoAssign') {
      state.autoAssign = ev.target.checked;
      addEvent('⚙️', 'Auto-assign ' + (state.autoAssign ? 'enabled' : 'disabled'));
      save();
      renderAll();
    }
    if (ev.target.id === 'fSex') {
      // keep name generator consistent with sex
    }
  });

  $('#backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeModal();
  });

  setInterval(tick, 1000);
  setInterval(() => { if (simRun) renderSimulate(); }, 1000);
}

document.addEventListener('DOMContentLoaded', init);
