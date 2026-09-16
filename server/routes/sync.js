/**
 * FieldLink — sync between devices.
 *
 * Every device keeps a local copy of the workspace and asks the server "what changed
 * since …". A phone that has been in the field with no signal sends the actions it
 * collected in one batch (the offline queue) as soon as it finds a connection.
 *
 * Nothing here is device specific: the same endpoints serve phones, tablets and laptops,
 * which is why the same information appears everywhere.
 */
import { Router } from 'express';
import { all, get, run, nowIso, SYNC_TABLES } from '../db.js';
import { asyncRoute, bad, forbidden, cleanText, toInt, parseJson } from '../util.js';
import { logAudit } from '../services.js';
import { canSeeAllFamilies } from '../../shared/roles.js';
import { subscribe } from '../events.js';

export const syncRouter = Router();

const PORT = () => Number(process.env.PORT || 5173);

/** Sensitive columns must never travel to a client. */
function sanitise(table, row) {
  if (!row) return row;
  if (table === 'users') {
    const { password_hash, ...rest } = row;
    return rest;
  }
  return row;
}

function scopeFor(user) {
  if (canSeeAllFamilies(user.role)) return { sql: '', params: [] };
  const ids = all('SELECT id FROM families WHERE deleted_at IS NULL AND (lead_officer_id = ? OR created_by = ?)', [user.id, user.id]).map((r) => r.id);
  return { sql: ids, params: [user.id] };
}

syncRouter.get('/ping', asyncRoute((req, res) => {
  res.json({ ok: true, server_time: nowIso(), tables: SYNC_TABLES.length });
}));

/** Everything a device needs the first time it signs in on that device. */
syncRouter.get('/bootstrap', asyncRoute((req, res) => {
  const familyScope = scopeFor(req.user);
  const ids = Array.isArray(familyScope.sql) ? familyScope.sql : null;

  const families = ids
    ? all(`SELECT * FROM families WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',') || "''"})`, ids)
    : all('SELECT * FROM families WHERE deleted_at IS NULL');
  const familyIds = families.map((f) => f.id);
  const inFamilies = (table, column = 'family_id') => (familyIds.length
    ? all(`SELECT * FROM ${table} WHERE ${column} IN (${familyIds.map(() => '?').join(',')})`, familyIds)
    : []);

  const conversations = all(
    'SELECT c.* FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ? WHERE c.deleted_at IS NULL',
    [req.user.id],
  );
  const conversationIds = conversations.map((c) => c.id);

  res.json({
    server_time: nowIso(),
    device_note: 'This copy can be stored on the device so FieldLink keeps working when the connection drops.',
    users: all('SELECT id, name, email, phone, role, job_title, site, active, avatar_tone FROM users'),
    families,
    family_members: inFamilies('family_members'),
    family_notes: inFamilies('family_notes'),
    forms: inFamilies('forms'),
    form_comments: ids ? all(`SELECT * FROM form_comments WHERE form_id IN (SELECT id FROM forms WHERE family_id IN (${familyIds.map(() => '?').join(',') || "''"}))`, familyIds) : all('SELECT * FROM form_comments'),
    media: inFamilies('media'),
    tasks: all(
      `SELECT * FROM tasks WHERE deleted_at IS NULL AND (assignee_id = ? OR created_by = ? OR family_id IN (${familyIds.map(() => '?').join(',') || "''"}))`,
      [req.user.id, req.user.id, ...familyIds],
    ),
    calls: inFamilies('calls'),
    events: all('SELECT * FROM events WHERE deleted_at IS NULL'),
    event_participants: all('SELECT * FROM event_participants WHERE deleted_at IS NULL'),
    documents: inFamilies('documents'),
    conversations,
    conversation_members: conversationIds.length
      ? all(`SELECT * FROM conversation_members WHERE conversation_id IN (${conversationIds.map(() => '?').join(',')})`, conversationIds)
      : [],
    messages: conversationIds.length
      ? all(`SELECT * FROM messages WHERE deleted_at IS NULL AND conversation_id IN (${conversationIds.map(() => '?').join(',')})`, conversationIds)
      : [],
    notifications: all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 200', [req.user.id]),
  });
}));

/**
 * Incremental pull: "what changed since I last spoke to the server?"
 * Rows that were removed are returned with a deleted_at timestamp so the device can
 * remove them as well.
 */
syncRouter.get('/changes', asyncRoute((req, res) => {
  const since = cleanText(req.query.since, 40) || '1970-01-01T00:00:00.000Z';
  const table = cleanText(req.query.table, 40);
  const tables = table ? [table] : SYNC_TABLES;
  const allowed = new Set(SYNC_TABLES);
  const changes = {};

  for (const name of tables) {
    if (!allowed.has(name)) continue;
    const rows = all(`SELECT * FROM ${name} WHERE updated_at > ? ORDER BY updated_at ASC LIMIT 2000`, [since]);
    if (name === 'users' && canSeeAllFamilies(req.user.role)) {
      // Everyone may see the team directory, but only basic details.
      changes[name] = rows.map((r) => sanitise('users', {
        id: r.id, name: r.name, email: r.email, phone: r.phone, role: r.role, job_title: r.job_title,
        site: r.site, active: r.active, avatar_tone: r.avatar_tone, updated_at: r.updated_at,
      }));
      continue;
    }
    if (name === 'notifications') {
      changes[name] = rows.filter((r) => r.user_id === req.user.id);
      continue;
    }
    changes[name] = rows.map((r) => sanitise(name, r));
  }

  res.json({
    server_time: nowIso(),
    since,
    changes,
    counts: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.length])),
  });
}));

/**
 * Offline queue replay.
 * Each entry is an action the device could not send at the time, e.g.
 *   { client_id: "…", method: "POST", path: "/api/forms/<id>/submit", body: {...} }
 * Results are remembered by client_id, so a retry never creates a duplicate.
 */
syncRouter.post('/queue', asyncRoute(async (req, res) => {
  const mutations = Array.isArray(req.body?.mutations) ? req.body.mutations : [];
  if (!mutations.length) throw bad('There is nothing to synchronise.');
  if (mutations.length > 200) throw bad('Please sync in smaller batches (200 actions at a time).');

  const results = [];
  for (const mutation of mutations) {
    const clientId = cleanText(mutation.client_id, 120);
    if (!clientId) { results.push({ client_id: null, ok: false, error: 'Missing client id' }); continue; }
    const previous = get('SELECT * FROM sync_mutations WHERE client_id = ?', [clientId]);
    if (previous) {
      results.push({ client_id: clientId, ok: previous.status < 400, status: previous.status, duplicate: true, response: parseJson(previous.response, null) });
      continue;
    }
    const path = String(mutation.path || '');
    const method = String(mutation.method || 'POST').toUpperCase();
    if (!path.startsWith('/api/') || path.startsWith('/api/sync')) {
      results.push({ client_id: clientId, ok: false, error: 'Only workspace actions can be queued.' });
      continue;
    }
    let status = 500;
    let payload = null;
    try {
      const response = await fetch(`http://127.0.0.1:${PORT()}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${req.session.token}`,
          'X-FieldLink-Device': req.device || 'offline queue',
        },
        body: ['GET', 'HEAD'].includes(method) ? undefined : JSON.stringify(mutation.body ?? {}),
      });
      status = response.status;
      payload = await response.json().catch(() => null);
    } catch (err) {
      payload = { error: err.message };
    }
    run(
      'INSERT INTO sync_mutations (client_id, user_id, endpoint, status, response, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [clientId, req.user.id, `${method} ${path}`, status, JSON.stringify(payload).slice(0, 4000), nowIso()],
    );
    results.push({ client_id: clientId, ok: status < 400, status, response: payload });
  }

  const failed = results.filter((r) => !r.ok).length;
  if (failed) logAudit(req.user, 'sync.queue.partial', 'user', req.user.id, `${results.length - failed}/${results.length} applied`, req.device);
  res.json({ results, applied: results.length - failed, failed, server_time: nowIso() });
}));

/** How far behind a device is, and what is waiting for it. */
syncRouter.get('/status', asyncRoute((req, res) => {
  const latest = {};
  for (const table of ['families', 'forms', 'media', 'tasks', 'messages', 'documents']) {
    const row = get(`SELECT MAX(updated_at) AS last FROM ${table}`);
    latest[table] = row?.last || null;
  }
  res.json({
    server_time: nowIso(),
    latest,
    pending_for_you: {
      notifications: get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id])?.n || 0,
      tasks: get("SELECT COUNT(*) AS n FROM tasks WHERE assignee_id = ? AND status = 'open' AND deleted_at IS NULL", [req.user.id])?.n || 0,
      forms_to_review: req.user.role === 'supervisor' || req.user.role === 'admin'
        ? get("SELECT COUNT(*) AS n FROM forms WHERE status = 'submitted' AND deleted_at IS NULL")?.n || 0
        : 0,
      corrections: get("SELECT COUNT(*) AS n FROM forms WHERE status = 'corrections' AND deleted_at IS NULL AND (created_by = ? OR assigned_to = ?)", [req.user.id, req.user.id])?.n || 0,
    },
    queues: {
      recent_mutations: all(
        'SELECT * FROM sync_mutations WHERE user_id = ? ORDER BY created_at DESC LIMIT 25',
        [req.user.id],
      ).map((m) => ({ ...m, response: undefined })),
    },
  });
}));

syncRouter.get('/history', asyncRoute((req, res) => {
  if (!['admin', 'supervisor'].includes(req.user.role)) throw forbidden();
  const mutations = all('SELECT * FROM sync_mutations ORDER BY created_at DESC LIMIT 100');
  res.json({ mutations, limit: toInt(req.query.limit, 100) });
}));

/* ------------------------------------------------------- live change stream */

syncRouter.get('/stream', asyncRoute((req, res) => {
  // EventSource cannot send headers, so the token travels as a query parameter.
  const raw = String(req.query.token || '');
  if (!raw) return res.status(401).end();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(`event: ready\ndata: ${JSON.stringify({ at: nowIso() })}\n\n`);
  const unsubscribe = subscribe(res);
  const keepAlive = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch {
      /* the connection is gone; close() below will clean up */
    }
  }, 25000);
  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
}));
