/**
 * FieldLink — end-to-end smoke test.
 *
 * Start the workspace first (`npm start`), then run `npm run smoke`. The script signs in
 * with the demo accounts, walks a family visit from assessment to approval, checks the
 * photography checklist, records a call with its follow-up task, opens a planner event,
 * sends a message and finishes with the sync endpoints and the access rules.
 *
 * It writes example rows into the workspace. Run `npm run seed:reset` afterwards to put
 * the demonstration data back to its tidy starting state.
 */
const BASE = 'http://127.0.0.1:5173';
let pass = 0, fail = 0;
function ok(name, detail = '') { pass++; console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`); }
function bad(name, detail = '') { fail++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
function keys(obj) { return obj && typeof obj === 'object' ? Object.keys(obj).join(',') : String(obj); }

function valueFor(field) {
  const type = field?.type || 'text';
  const first = field?.options?.[0];
  const option = typeof first === 'string' ? first : first?.value;
  if (['number', 'money', 'rating'].includes(type)) return 4;
  if (type === 'date') return '2026-09-16';
  if (type === 'checkbox' || type === 'switch') return 1;
  if (type === 'select' || type === 'radio') return option ?? 'Yes';
  if (type === 'multiselect') return [option ?? 'Yes'];
  if (type === 'signature') return 'Mohammed Abdulai';
  if (type === 'gps') return { lat: 9.4008, lng: -0.8393 };
  if (type === 'email') return 'officer@fieldlink.org';
  if (type === 'tel' || type === 'phone') return '+233 24 000 0000';
  return 'Smoke test answer';
}

async function req(path, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 120); }
  return { status: res.status, data };
}

async function step(name, fn) {
  try { await fn(); } catch (err) { bad(name, err.message); }
}

await step('health', async () => {
  const { status, data } = await req('/health');
  status < 300 ? ok('health', keys(data)) : bad('health', status + ' ' + JSON.stringify(data).slice(0, 120));
});

const tokens = {};
await step('login all demo users', async () => {
  for (const email of ['officer@fieldlink.org', 'supervisor@fieldlink.org', 'admin@fieldlink.org', 'volunteer@fieldlink.org']) {
    const { status, data } = await req('/api/auth/login', { method: 'POST', body: { email, password: 'fieldlink' } });
    if (status < 300 && data.token) { tokens[email.split('@')[0]] = data.token; ok('login ' + email, `role=${data.user?.role}`); }
    else bad('login ' + email, status + ' ' + JSON.stringify(data).slice(0, 160));
  }
  const me = await req('/api/auth/me', { token: tokens.officer });
  me.status < 300 ? ok('auth/me', keys(me.data)) : bad('auth/me', me.status + ' ' + JSON.stringify(me.data).slice(0, 160));
});

let familyId = null;
let familyIds = [];
await step('families', async () => {
  const { status, data } = await req('/api/families?sort=name', { token: tokens.officer });
  if (status < 300 && data.families?.length) { familyId = data.families[0].id; familyIds = data.families.map((f) => f.id); ok('families list', `${data.families.length} families, first=${data.families[0].code}`); }
  else bad('families list', status + ' ' + JSON.stringify(data).slice(0, 200));
  const detail = await req(`/api/families/${familyId}`, { token: tokens.officer });
  if (detail.status < 300) ok('family detail', keys(detail.data));
  else bad('family detail', detail.status + ' ' + JSON.stringify(detail.data).slice(0, 200));
});

await step('forms flow', async () => {
  const list = await req('/api/forms?scope=mine&status=draft', { token: tokens.officer });
  if (list.status !== 200) return bad('forms list', list.status + ' ' + JSON.stringify(list.data).slice(0, 160));
  ok('forms list', keys(list.data) + ` (${list.data.forms?.length ?? 0})`);

  const created = await req('/api/forms', { method: 'POST', token: tokens.officer, body: { family_id: familyIds[familyIds.length - 1] } });
  const formId = created.data?.form?.id || created.data?.existing?.id;
  if (created.status < 300 && formId) ok('form create', formId);
  else return bad('form create', created.status + ' ' + JSON.stringify(created.data).slice(0, 200));

  const get = await req(`/api/forms/${formId}`, { token: tokens.officer });
  get.status < 300 ? ok('form detail', keys(get.data) + ` sections=${get.data.sections?.length} missing=${get.data.missing_required?.length}`) : bad('form detail', get.status + ' ' + JSON.stringify(get.data).slice(0, 200));

  const early = await req(`/api/forms/${formId}/review`, { method: 'POST', token: tokens.supervisor, body: { action: 'approve' } });
  early.status === 400 ? ok('draft cannot be approved', JSON.stringify(early.data).slice(0, 80)) : bad('draft cannot be approved', early.status + ' ' + JSON.stringify(early.data).slice(0, 120));

  const fields = {};
  for (const section of get.data.sections || []) for (const field of section.fields || []) fields[field.key] = field;
  const fill = {};
  for (const item of get.data.missing_required || []) fill[item.key] = valueFor(fields[item.key]);

  const patched = await req(`/api/forms/${formId}`, { method: 'PATCH', token: tokens.officer, body: { data: { ...fill, 'preliminary.visit_purpose': 'routine' }, current_section: 'officer' } });
  patched.status < 300 ? ok('form autosave', keys(patched.data) + ` progress=${patched.data.progress?.percent}%`) : bad('form autosave', patched.status + ' ' + JSON.stringify(patched.data).slice(0, 200));

  const submitted = await req(`/api/forms/${formId}/submit`, { method: 'POST', token: tokens.officer, body: { data: fill } });
  submitted.status < 300 ? ok('form submit', `status=${submitted.data.form?.status}`) : bad('form submit', submitted.status + ' ' + JSON.stringify(submitted.data).slice(0, 300));

  const start = await req(`/api/forms/${formId}/review`, { method: 'POST', token: tokens.supervisor, body: { action: 'start_review' } });
  start.status < 300 ? ok('review started', `status=${start.data.form?.status}`) : bad('review started', start.status + ' ' + JSON.stringify(start.data).slice(0, 200));

  const corr = await req(`/api/forms/${formId}/review`, { method: 'POST', token: tokens.supervisor, body: { action: 'request_corrections', note: 'Please confirm the household size.', section_key: 'family' } });
  corr.status < 300 ? ok('corrections requested', `task=${corr.data.task_id ? 'yes' : 'no'}`) : bad('corrections requested', corr.status + ' ' + JSON.stringify(corr.data).slice(0, 220));

  const edit = await req(`/api/forms/${formId}`, { method: 'PATCH', token: tokens.officer, body: { data: { household_size: 6 } } });
  edit.status < 300 ? ok('officer edits after corrections') : bad('officer edits after corrections', edit.status + ' ' + JSON.stringify(edit.data).slice(0, 200));

  const resubmit = await req(`/api/forms/${formId}/submit`, { method: 'POST', token: tokens.officer, body: { data: { household_size: 6 } } });
  resubmit.status < 300 ? ok('form resubmitted', `status=${resubmit.data.form?.status}`) : bad('form resubmitted', resubmit.status + ' ' + JSON.stringify(resubmit.data).slice(0, 240));

  const approve = await req(`/api/forms/${formId}/review`, { method: 'POST', token: tokens.supervisor, body: { action: 'approve', note: 'Checked during smoke test.' } });
  approve.status < 300 ? ok('form approved', `status=${approve.data.form?.status}`) : bad('form approved', approve.status + ' ' + JSON.stringify(approve.data).slice(0, 220));

  const locked = await req(`/api/forms/${formId}`, { method: 'PATCH', token: tokens.officer, body: { data: { household_size: 9 } } });
  locked.status === 403 ? ok('approved assessment is locked') : bad('approved assessment is locked', locked.status + ' ' + JSON.stringify(locked.data).slice(0, 160));

  const comments = await req(`/api/forms/${formId}/comments`, { method: 'POST', token: tokens.supervisor, body: { body: 'Smoke test comment.', section_key: 'needs' } });
  comments.status < 300 ? ok('form comment', JSON.stringify(comments.data).slice(0, 80)) : bad('form comment', comments.status + ' ' + JSON.stringify(comments.data).slice(0, 160));
});

await step('media checklist', async () => {
  const { status, data } = await req(`/api/media/checklist/${familyId}`, { token: tokens.officer });
  if (status < 300) ok('media checklist', keys(data) + ` groups=${data.groups?.length} items=${data.groups?.reduce((n, g) => n + g.items.length, 0)}`);
  else return bad('media checklist', status + ' ' + JSON.stringify(data).slice(0, 200));
  const items = (data.groups || []).flatMap((g) => g.items);
  const pending = items.find((i) => i.status === 'pending');
  const form = new FormData();
  form.append('files', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'smoke.png');
  form.append('family_id', familyId);
  if (pending) form.append('checklist_key', pending.key);
  form.append('category', pending?.category || 'Housing');
  form.append('subcategory', pending?.subcategory || 'Exterior');
  form.append('source', 'camera');
  form.append('captured_at', new Date().toISOString());
  const upload = await req('/api/media', { method: 'POST', token: tokens.officer, form });
  upload.status < 300 ? ok('media upload', JSON.stringify(upload.data).slice(0, 120)) : bad('media upload', upload.status + ' ' + JSON.stringify(upload.data).slice(0, 220));
  const list = await req(`/api/media?family_id=${familyId}`, { token: tokens.officer });
  list.status < 300 ? ok('media list', `${list.data.media?.length} items`) : bad('media list', list.status + ' ' + JSON.stringify(list.data).slice(0, 160));
  const na = await req('/api/media/not-available', { method: 'POST', token: tokens.officer, body: { family_id: familyId, checklist_key: 'house_exterior', category: 'Housing', subcategory: 'Exterior', note: 'Smoke test reason' } });
  na.status < 300 ? ok('media not-available') : bad('media not-available', na.status + ' ' + JSON.stringify(na.data).slice(0, 200));
});

await step('click to call + follow-up task', async () => {
  const call = await req(`/api/families/${familyId}/calls`, { method: 'POST', token: tokens.officer, body: { phone: '+233 24 000 0000', contact_name: 'Guardian', status: 'no_answer', note: 'Guardian asked us to call again on Thursday.', follow_up: { title: 'Call Hawawu again tomorrow', due_at: new Date(Date.now() + 86400000).toISOString() } } });
  call.status < 300 ? ok('call record', JSON.stringify(call.data).slice(0, 160)) : bad('call record', call.status + ' ' + JSON.stringify(call.data).slice(0, 300));
  const calls = await req(`/api/families/${familyId}/calls`, { token: tokens.officer });
  calls.status < 300 ? ok('call history', `${calls.data.calls?.length} entries`) : bad('call history', calls.status + ' ' + JSON.stringify(calls.data).slice(0, 160));
});

await step('tasks', async () => {
  const list = await req('/api/tasks?scope=mine', { token: tokens.officer });
  if (list.status < 300) ok('tasks list', keys(list.data) + ` n=${list.data.tasks?.length}`);
  else return bad('tasks list', list.status + ' ' + JSON.stringify(list.data).slice(0, 200));
  const target = list.data.tasks?.[0];
  if (target) {
    const toggle = await req(`/api/tasks/${target.id}/toggle`, { method: 'POST', token: tokens.officer, body: {} });
    toggle.status < 300 ? ok('task toggle', JSON.stringify(toggle.data).slice(0, 100)) : bad('task toggle', toggle.status + ' ' + JSON.stringify(toggle.data).slice(0, 160));
  }
  const summary = await req('/api/workspace/home', { token: tokens.officer });
  summary.status < 300 ? ok('workspace home', keys(summary.data)) : bad('workspace home', summary.status + ' ' + JSON.stringify(summary.data).slice(0, 200));
});

await step('planner', async () => {
  const views = await req('/api/planner?view=today&scope=all', { token: tokens.officer });
  views.status < 300 ? ok('planner today', keys(views.data) + ` events=${views.data.events?.length}`) : bad('planner today', views.status + ' ' + JSON.stringify(views.data).slice(0, 200));
  const created = await req('/api/planner/events', { method: 'POST', token: tokens.officer, body: { title: 'Smoke test visit', type: 'field_visit', starts_at: new Date(Date.now() + 3600000).toISOString(), location: 'Norlans', family_id: familyId, reminders: [{ offset_minutes: 60 }] } });
  created.status < 300 ? ok('event create', JSON.stringify(created.data).slice(0, 140)) : bad('event create', created.status + ' ' + JSON.stringify(created.data).slice(0, 300));
  const eventId = created.data?.event?.id;
  if (eventId) {
    const detail = await req(`/api/planner/events/${eventId}`, { token: tokens.officer });
    detail.status < 300 ? ok('event detail', keys(detail.data)) : bad('event detail', detail.status + ' ' + JSON.stringify(detail.data).slice(0, 200));
    const discuss = await req(`/api/planner/events/${eventId}/discuss`, { method: 'POST', token: tokens.officer, body: {} });
    discuss.status < 300 ? ok('event discuss', JSON.stringify(discuss.data).slice(0, 100)) : bad('event discuss', discuss.status + ' ' + JSON.stringify(discuss.data).slice(0, 200));
  }
});

await step('messages', async () => {
  const list = await req('/api/messages/conversations', { token: tokens.officer });
  list.status < 300 ? ok('conversations', `${list.data.conversations?.length} threads`) : bad('conversations', list.status + ' ' + JSON.stringify(list.data).slice(0, 200));
  const fam = await req(`/api/messages/for/family/${familyId}`, { method: 'POST', token: tokens.officer, body: {} });
  if (fam.status < 300) ok('family conversation', JSON.stringify(fam.data).slice(0, 120));
  else return bad('family conversation', fam.status + ' ' + JSON.stringify(fam.data).slice(0, 220));
  const convId = fam.data?.conversation?.id;
  const sent = await req(`/api/messages/conversations/${convId}/messages`, { method: 'POST', token: tokens.officer, body: { body: 'Smoke test message', client_id: 'smoke-' + Date.now() } });
  sent.status < 300 ? ok('send message', JSON.stringify(sent.data).slice(0, 120)) : bad('send message', sent.status + ' ' + JSON.stringify(sent.data).slice(0, 220));
  const thread = await req(`/api/messages/conversations/${convId}`, { token: tokens.officer });
  thread.status < 300 ? ok('thread', keys(thread.data) + ` n=${thread.data.messages?.length}`) : bad('thread', thread.status + ' ' + JSON.stringify(thread.data).slice(0, 200));
  const search = await req('/api/messages/search?q=smoke', { token: tokens.officer });
  search.status < 300 ? ok('message search', JSON.stringify(search.data).slice(0, 100)) : bad('message search', search.status + ' ' + JSON.stringify(search.data).slice(0, 160));
});

await step('self-service profile', async () => {
  const saved = await req('/api/auth/profile', { method: 'PATCH', token: tokens.officer, body: { name: 'Mohammed Abdulai', phone: '+233 24 111 2222', job_title: 'Field Officer', site: 'Northern Region' } });
  saved.status < 300 ? ok('profile update', saved.data.user?.phone) : bad('profile update', saved.status + ' ' + JSON.stringify(saved.data).slice(0, 160));
});

await step('workspace extras', async () => {
  for (const [name, path, token] of [
    ['documents', '/api/workspace/documents', tokens.officer],
    ['notifications', '/api/workspace/notifications', tokens.officer],
    ['search', '/api/workspace/search?q=nor', tokens.officer],
    ['reports', '/api/workspace/reports/summary', tokens.supervisor],
    ['users', '/api/workspace/users', tokens.admin],
    ['audit', '/api/workspace/audit', tokens.admin],
    ['team', '/api/auth/team', tokens.officer],
    ['devices', '/api/auth/devices', tokens.officer],
    ['import template', '/api/families/import/template', tokens.admin],
  ]) {
    const { status, data } = await req(path, { token });
    status < 300 ? ok(name, keys(data).slice(0, 90)) : bad(name, status + ' ' + JSON.stringify(data).slice(0, 200));
  }
});

await step('document upload', async () => {
  const form = new FormData();
  form.append('files', new Blob([Buffer.from('smoke test document')], { type: 'text/plain' }), 'smoke.txt');
  form.append('title', 'Smoke test document');
  form.append('category', 'Reports');
  form.append('family_id', familyId);
  const { status, data } = await req('/api/workspace/documents', { method: 'POST', token: tokens.officer, form });
  status < 300 ? ok('document upload', JSON.stringify(data).slice(0, 120)) : bad('document upload', status + ' ' + JSON.stringify(data).slice(0, 220));
});

await step('sync', async () => {
  const ping = await req('/api/sync/ping', { token: tokens.officer });
  ping.status < 300 ? ok('sync ping', JSON.stringify(ping.data).slice(0, 100)) : bad('sync ping', ping.status + ' ' + JSON.stringify(ping.data).slice(0, 160));
  const boot = await req('/api/sync/bootstrap', { token: tokens.officer });
  boot.status < 300 ? ok('sync bootstrap', keys(boot.data) + ` families=${boot.data.families?.length}`) : bad('sync bootstrap', boot.status + ' ' + JSON.stringify(boot.data).slice(0, 220));
  const changes = await req('/api/sync/changes?since=1970-01-01T00:00:00.000Z', { token: tokens.officer });
  changes.status < 300 ? ok('sync changes', keys(changes.data) + ` counts=${JSON.stringify(changes.data.counts)}`) : bad('sync changes', changes.status + ' ' + JSON.stringify(changes.data).slice(0, 220));
  const status = await req('/api/sync/status', { token: tokens.officer });
  status.status < 300 ? ok('sync status', keys(status.data)) : bad('sync status', status.status + ' ' + JSON.stringify(status.data).slice(0, 200));
  const clientId = 'queue-smoke-' + Date.now();
  const queue = await req('/api/sync/queue', { method: 'POST', token: tokens.officer, body: { mutations: [{ client_id: clientId, method: 'POST', path: `/api/families/${familyId}/notes`, body: { body: 'Queued note from smoke test' } }] } });
  queue.status < 300 ? ok('sync queue', JSON.stringify(queue.data).slice(0, 160)) : bad('sync queue', queue.status + ' ' + JSON.stringify(queue.data).slice(0, 300));
  const replay = await req('/api/sync/queue', { method: 'POST', token: tokens.officer, body: { mutations: [{ client_id: clientId, method: 'POST', path: `/api/families/${familyId}/notes`, body: { body: 'Queued note from smoke test' } }] } });
  replay.status < 300 ? ok('sync queue replay (idempotent)', JSON.stringify(replay.data).slice(0, 160)) : bad('sync queue replay', replay.status + ' ' + JSON.stringify(replay.data).slice(0, 300));
});

await step('static app', async () => {
  const res = await fetch(BASE + '/');
  const html = await res.text();
  html.includes('<div id="root"') ? ok('web app served from web/dist') : bad('web app served', html.slice(0, 100));
  const asset = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  if (asset) {
    const js = await fetch(BASE + asset[1]);
    (js.status < 300 && js.headers.get('content-type')?.includes('javascript')) ? ok('web bundle served', asset[1]) : bad('web bundle', js.status);
  }
});

await step('access control', async () => {
  const noToken = await req('/api/families');
  noToken.status === 401 ? ok('unauthenticated families rejected', '401') : bad('unauthenticated families rejected', noToken.status);
  const volunteerUsers = await req('/api/workspace/users', { token: tokens.volunteer });
  volunteerUsers.status === 403 ? ok('volunteer blocked from admin users', '403') : bad('volunteer blocked from admin users', volunteerUsers.status + ' ' + JSON.stringify(volunteerUsers.data).slice(0, 120));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
