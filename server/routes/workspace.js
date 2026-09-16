/**
 * FieldLink — Documents, notifications, home screen, search, reports and administration.
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, nowIso, UPLOAD_DIR } from '../db.js';
import { asyncRoute, bad, missing, forbidden, id, cleanText, toInt, parseJson, hashPassword } from '../util.js';
import { assertFamilyAccess, logAudit, notify, publicUser, canAccessFamily } from '../services.js';
import { can, canSeeAllFamilies, ROLES } from '../../shared/roles.js';
import { documentUpload, kindFor } from '../upload.js';
import { authenticate } from './auth.js';
import { mediaProgress, mediaRequirement } from './families.js';

export const workspaceRouter = Router();

function fileAuth(req, res, next) {
  if (req.query.token && !req.get('authorization') && !req.get('x-fieldlink-token')) {
    req.headers['x-fieldlink-token'] = String(req.query.token);
  }
  return authenticate(req, res, next);
}

/* -------------------------------------------------------------------- home */

workspaceRouter.get('/home', asyncRoute((req, res) => {
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);
  const weekEnd = new Date(dayStart.getTime() + 7 * 86400000);

  const myTasks = all(
    `SELECT t.*, f.code AS family_code, f.name AS family_name, f.id AS family_ref
     FROM tasks t LEFT JOIN families f ON f.id = t.family_id
     WHERE t.deleted_at IS NULL AND t.status IN ('open','in_progress') AND t.assignee_id = ?
     ORDER BY COALESCE(t.due_at, '9999-12-31') ASC LIMIT 40`,
    [req.user.id],
  );

  const events = all(
    `SELECT e.*,
       (SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id AND p.deleted_at IS NULL) AS participant_count
     FROM events e
     WHERE e.deleted_at IS NULL AND e.starts_at <= ? AND COALESCE(e.ends_at, e.starts_at) >= ?
     ORDER BY e.starts_at ASC LIMIT 20`,
    [weekEnd.toISOString(), dayStart.toISOString()],
  );

  const familyFilter = canSeeAllFamilies(req.user.role) ? ['f.deleted_at IS NULL'] : ['f.deleted_at IS NULL', '(f.lead_officer_id = ? OR f.created_by = ?)'];
  const familyParams = canSeeAllFamilies(req.user.role) ? [] : [req.user.id, req.user.id];
  const families = all(`SELECT f.* FROM families f WHERE ${familyFilter.join(' AND ')}`, familyParams);

  const dueVisits = families.filter((f) => !f.last_visit_at || (Date.now() - new Date(f.last_visit_at).getTime()) > 30 * 86400000);

  // Families whose required photographs are not finished — the most common reason an
  // officer gets asked for more information later.
  const mediaOutstanding = [];
  for (const family of families) {
    const members = all('SELECT * FROM family_members WHERE family_id = ? AND deleted_at IS NULL', [family.id]);
    const rows = all('SELECT * FROM media WHERE family_id = ? AND deleted_at IS NULL', [family.id]);
    const progress = mediaProgress(family, members, rows);
    if (progress.required && progress.completed < progress.required) {
      mediaOutstanding.push({ family_id: family.id, code: family.code, name: family.name, ...progress });
    }
  }

  const formsWhere = ["fm.deleted_at IS NULL", "fm.status IN ('draft','corrections','submitted','under_review')"];
  const formsParams = [];
  if (!canSeeAllFamilies(req.user.role)) { formsWhere.push('(fm.created_by = ? OR fm.assigned_to = ?)'); formsParams.push(req.user.id, req.user.id); }
  const openForms = all(
    `SELECT fm.id, fm.status, fm.progress, fm.updated_at, f.code AS family_code, f.name AS family_name, f.id AS family_id, u.name AS officer_name
     FROM forms fm JOIN families f ON f.id = fm.family_id LEFT JOIN users u ON u.id = fm.created_by
     WHERE ${formsWhere.join(' AND ')} ORDER BY fm.updated_at DESC LIMIT 20`,
    formsParams,
  );

  const notifications = all(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 12',
    [req.user.id],
  );
  const unreadNotifications = get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
  const unreadMessages = get(
    `SELECT COUNT(*) AS n FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
     WHERE m.deleted_at IS NULL AND (m.sender_id IS NULL OR m.sender_id != ?) AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)`,
    [req.user.id, req.user.id],
  );

  const callsToday = all(
    `SELECT c.*, f.code AS family_code, f.name AS family_name, f.id AS family_id, u.name AS officer_name
     FROM calls c JOIN families f ON f.id = c.family_id LEFT JOIN users u ON u.id = c.officer_id
     WHERE c.deleted_at IS NULL AND c.called_at >= ? ORDER BY c.called_at DESC`,
    [dayStart.toISOString()],
  );

  res.json({
    greeting_name: req.user.name.split(' ')[0],
    today: {
      tasks: myTasks.filter((t) => t.due_at && new Date(t.due_at) >= dayStart && new Date(t.due_at) <= dayEnd),
      overdue: myTasks.filter((t) => t.due_at && new Date(t.due_at) < dayStart),
      upcoming: myTasks.filter((t) => t.due_at && new Date(t.due_at) > dayEnd),
      events: events.filter((e) => new Date(e.starts_at) <= dayEnd),
      week_events: events.filter((e) => new Date(e.starts_at) > dayEnd),
      calls: callsToday,
    },
    attention: {
      media_outstanding: mediaOutstanding.slice(0, 8),
      forms: openForms,
      visits_due: dueVisits.slice(0, 8).map((f) => ({ id: f.id, code: f.code, name: f.name, last_visit_at: f.last_visit_at, community: f.community })),
      corrections: openForms.filter((f) => f.status === 'corrections'),
    },
    badges: {
      notifications: unreadNotifications?.n || 0,
      messages: unreadMessages?.n || 0,
      tasks: myTasks.length,
      open_tasks: myTasks.filter((t) => !t.due_at || new Date(t.due_at) <= dayEnd).length,
    },
    notifications,
    counts: {
      families: families.length,
      families_all: get('SELECT COUNT(*) AS n FROM families WHERE deleted_at IS NULL')?.n || 0,
      people: get('SELECT COUNT(*) AS n FROM family_members WHERE deleted_at IS NULL')?.n || 0,
      orphans: get('SELECT COUNT(*) AS n FROM family_members WHERE deleted_at IS NULL AND is_orphan = 1')?.n || 0,
      media: get('SELECT COUNT(*) AS n FROM media WHERE deleted_at IS NULL')?.n || 0,
      documents: get('SELECT COUNT(*) AS n FROM documents WHERE deleted_at IS NULL')?.n || 0,
    },
  });
}));

/* --------------------------------------------------------------- documents */

workspaceRouter.get('/documents', asyncRoute((req, res) => {
  const { family_id: familyId, event_id: eventId, q, category } = req.query;
  const where = ['d.deleted_at IS NULL'];
  const params = [];
  if (familyId) { assertFamilyAccess(req.user, familyId); where.push('d.family_id = ?'); params.push(familyId); }
  if (eventId) { where.push('d.event_id = ?'); params.push(eventId); }
  if (category && category !== 'all') { where.push('d.category = ?'); params.push(category); }
  if (q) { where.push('(d.title LIKE ? OR d.notes LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (!canSeeAllFamilies(req.user.role)) {
    where.push('(d.uploaded_by = ? OR d.family_id IN (SELECT id FROM families WHERE lead_officer_id = ? OR created_by = ?))');
    params.push(req.user.id, req.user.id, req.user.id);
  }
  const rows = all(
    `SELECT d.*, f.code AS family_code, f.name AS family_name, u.name AS uploaded_by_name, e.title AS event_title
     FROM documents d LEFT JOIN families f ON f.id = d.family_id
     LEFT JOIN users u ON u.id = d.uploaded_by LEFT JOIN events e ON e.id = d.event_id
     WHERE ${where.join(' AND ')} ORDER BY d.created_at DESC LIMIT 300`,
    params,
  );
  const categories = all('SELECT DISTINCT category FROM documents WHERE deleted_at IS NULL AND category IS NOT NULL ORDER BY category').map((r) => r.category);
  res.json({
    documents: rows.map((d) => ({ ...d, url: d.file_path ? `/api/files/${d.file_path}` : null, kind: d.kind || kindFor(d.mime || '') })),
    categories,
  });
}));

workspaceRouter.post('/documents', documentUpload.array('files', 12), asyncRoute((req, res) => {
  if (!can(req.user.role, 'document.upload')) throw forbidden('You do not have permission to upload documents.');
  const files = req.files || [];
  if (!files.length) throw bad('Choose a file to upload.');
  const familyId = cleanText(req.body?.family_id, 64) || null;
  if (familyId) assertFamilyAccess(req.user, familyId);
  const now = nowIso();
  const created = [];
  for (const file of files) {
    const documentId = id();
    run(
      `INSERT INTO documents (id, family_id, event_id, title, category, kind, file_path, mime, size, notes, visibility, uploaded_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [documentId, familyId, cleanText(req.body?.event_id, 64) || null,
        cleanText(req.body?.title, 200) || file.originalname, cleanText(req.body?.category, 80) || 'General',
        kindFor(file.mimetype), file.filename, file.mimetype, file.size, cleanText(req.body?.notes, 2000),
        cleanText(req.body?.visibility, 30) || 'internal', req.user.id, now, now],
    );
    created.push(get('SELECT * FROM documents WHERE id = ?', [documentId]));
  }
  logAudit(req.user, 'document.upload', 'family', familyId, `${created.length} file(s)`, req.device);
  res.status(201).json({ documents: created.map((d) => ({ ...d, url: `/api/files/${d.file_path}` })) });
}));

workspaceRouter.get('/documents/:documentId/file', fileAuth, asyncRoute((req, res) => {
  const document = get('SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL', [req.params.documentId]);
  if (!document) throw missing('That document was not found.');
  if (document.family_id) assertFamilyAccess(req.user, document.family_id);
  if (!document.file_path) throw missing('There is no file stored for this document.');
  const full = path.join(UPLOAD_DIR, document.file_path);
  if (!full.startsWith(UPLOAD_DIR) || !fs.existsSync(full)) throw missing('The file is missing from the FieldLink data folder.');
  res.type(document.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.title || 'document')}"`);
  fs.createReadStream(full).pipe(res);
}));

workspaceRouter.patch('/documents/:documentId', asyncRoute((req, res) => {
  const document = get('SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL', [req.params.documentId]);
  if (!document) throw missing('That document was not found.');
  if (document.family_id) assertFamilyAccess(req.user, document.family_id);
  if (!can(req.user.role, 'document.upload')) throw forbidden();
  const sets = [];
  const params = [];
  for (const field of ['title', 'category', 'notes', 'visibility']) {
    if (field in (req.body || {})) { sets.push(`${field} = ?`); params.push(cleanText(req.body[field], 2000)); }
  }
  if (!sets.length) throw bad('Nothing to update.');
  sets.push('updated_at = ?');
  params.push(nowIso(), document.id);
  run(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`, params);
  res.json({ document: get('SELECT * FROM documents WHERE id = ?', [document.id]) });
}));

workspaceRouter.delete('/documents/:documentId', asyncRoute((req, res) => {
  const document = get('SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL', [req.params.documentId]);
  if (!document) throw missing();
  if (document.family_id) assertFamilyAccess(req.user, document.family_id);
  if (!can(req.user.role, 'document.delete')) throw forbidden('Only supervisors and administrators can delete documents.');
  run('UPDATE documents SET deleted_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), document.id]);
  logAudit(req.user, 'document.delete', 'document', document.id, document.title, req.device);
  res.json({ ok: true });
}));

/* ----------------------------------------------------------- notifications */

workspaceRouter.get('/notifications', asyncRoute((req, res) => {
  const limit = Math.min(toInt(req.query.limit, 60) || 60, 200);
  const rows = all(
    `SELECT n.*, u.name AS actor_name FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
     WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT ?`,
    [req.user.id, limit],
  );
  res.json({
    notifications: rows,
    unread: rows.filter((r) => !r.read_at).length,
    unread_total: get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id])?.n || 0,
  });
}));

workspaceRouter.post('/notifications/:notificationId/read', asyncRoute((req, res) => {
  run('UPDATE notifications SET read_at = ?, updated_at = ? WHERE id = ? AND user_id = ?', [nowIso(), nowIso(), req.params.notificationId, req.user.id]);
  res.json({ ok: true });
}));

workspaceRouter.post('/notifications/read-all', asyncRoute((req, res) => {
  run('UPDATE notifications SET read_at = ?, updated_at = ? WHERE user_id = ? AND read_at IS NULL', [nowIso(), nowIso(), req.user.id]);
  res.json({ ok: true });
}));

/** Clear everything the person has already read. */
workspaceRouter.delete('/notifications', asyncRoute((req, res) => {
  run('DELETE FROM notifications WHERE user_id = ? AND read_at IS NOT NULL', [req.user.id]);
  res.json({ ok: true });
}));

/* ------------------------------------------------------------------ search */

workspaceRouter.get('/search', asyncRoute((req, res) => {
  const q = cleanText(req.query.q, 120);
  if (!q) return res.json({ families: [], tasks: [], forms: [], documents: [], media: [], events: [] });
  const like = `%${q}%`;
  const familyParams = canSeeAllFamilies(req.user.role) ? [] : [req.user.id, req.user.id];
  const familyScope = canSeeAllFamilies(req.user.role) ? '' : 'AND (lead_officer_id = ? OR created_by = ?)';

  res.json({
    families: all(
      `SELECT id, code, name, community, region, urgency, phone FROM families
       WHERE deleted_at IS NULL ${familyScope} AND (name LIKE ? OR code LIKE ? OR head_name LIKE ? OR guardian_name LIKE ? OR phone LIKE ? OR community LIKE ?)
       LIMIT 20`,
      [...familyParams, like, like, like, like, like, like],
    ),
    tasks: all(
      `SELECT t.id, t.title, t.status, t.due_at, f.code AS family_code FROM tasks t LEFT JOIN families f ON f.id = t.family_id
       WHERE t.deleted_at IS NULL AND t.title LIKE ? LIMIT 20`,
      [like],
    ),
    forms: all(
      `SELECT fm.id, fm.status, fm.updated_at, f.code AS family_code, f.name AS family_name FROM forms fm
       JOIN families f ON f.id = fm.family_id
       WHERE fm.deleted_at IS NULL AND (f.name LIKE ? OR f.code LIKE ?) LIMIT 20`,
      [like, like],
    ),
    documents: all(
      `SELECT id, title, category, family_id FROM documents WHERE deleted_at IS NULL AND (title LIKE ? OR notes LIKE ?) LIMIT 20`,
      [like, like],
    ),
    media: all(
      `SELECT m.id, m.subcategory, m.category, m.family_id, f.code AS family_code FROM media m
       JOIN families f ON f.id = m.family_id
       WHERE m.deleted_at IS NULL AND (m.subcategory LIKE ? OR m.category LIKE ? OR m.note LIKE ?) LIMIT 20`,
      [like, like, like],
    ),
    events: all(
      `SELECT id, title, type, starts_at, location FROM events WHERE deleted_at IS NULL AND (title LIKE ? OR location LIKE ?) LIMIT 20`,
      [like, like],
    ),
  });
}));

/* ----------------------------------------------------------------- reports */

workspaceRouter.get('/reports/summary', asyncRoute((req, res) => {
  if (!can(req.user.role, 'report.view')) throw forbidden('Reports are available to supervisors and administrators.');
  const byRegion = all(
    `SELECT IFNULL(region, 'Not recorded') AS region, COUNT(*) AS families,
       SUM(CASE WHEN urgency IN ('High','Critical') THEN 1 ELSE 0 END) AS urgent,
       SUM(IFNULL(orphan_count, 0)) AS orphans
     FROM families WHERE deleted_at IS NULL GROUP BY region ORDER BY families DESC`,
  );
  const formStatus = all('SELECT status, COUNT(*) AS n FROM forms WHERE deleted_at IS NULL GROUP BY status');
  const callOutcomes = all('SELECT status, COUNT(*) AS n FROM calls WHERE deleted_at IS NULL GROUP BY status');
  const taskStats = all(
    `SELECT SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
       SUM(CASE WHEN status = 'open' AND due_at < ? THEN 1 ELSE 0 END) AS overdue
     FROM tasks WHERE deleted_at IS NULL`,
    [nowIso()],
  );
  const officerLoad = all(
    `SELECT u.id, u.name, u.role,
       (SELECT COUNT(*) FROM families f WHERE f.lead_officer_id = u.id AND f.deleted_at IS NULL) AS families,
       (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND t.status = 'open' AND t.deleted_at IS NULL) AS open_tasks,
       (SELECT COUNT(*) FROM media m WHERE m.captured_by = u.id AND m.deleted_at IS NULL) AS photos,
       (SELECT COUNT(*) FROM forms fm WHERE fm.created_by = u.id AND fm.deleted_at IS NULL) AS assessments
     FROM users u WHERE u.active = 1 ORDER BY families DESC`,
  );
  const mediaByCategory = all(
    `SELECT IFNULL(category, 'General') AS category, COUNT(*) AS n FROM media WHERE deleted_at IS NULL GROUP BY category ORDER BY n DESC`,
  );
  const documents = get('SELECT COUNT(*) AS n FROM documents WHERE deleted_at IS NULL')?.n || 0;
  const importBatches = all('SELECT * FROM import_batches ORDER BY created_at DESC LIMIT 10');

  res.json({
    by_region: byRegion,
    forms_by_status: formStatus,
    call_outcomes: callOutcomes,
    tasks: taskStats[0] || { open: 0, done: 0, overdue: 0 },
    officer_load: officerLoad,
    media_by_category: mediaByCategory,
    documents,
    imports: importBatches,
  });
}));

/* ------------------------------------------------------------ admin: users */

workspaceRouter.get('/users', asyncRoute((req, res) => {
  if (!can(req.user.role, 'user.manage')) throw forbidden('Only administrators can manage user accounts.');
  const users = all(
    `SELECT u.*,
       (SELECT COUNT(*) FROM families f WHERE f.lead_officer_id = u.id AND f.deleted_at IS NULL) AS families,
       (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND t.status = 'open' AND t.deleted_at IS NULL) AS open_tasks
     FROM users u ORDER BY u.active DESC, u.name`,
  ).map((u) => {
    const { password_hash, ...rest } = u;
    return rest;
  });
  res.json({ users, roles: ROLES });
}));

workspaceRouter.post('/users', asyncRoute((req, res) => {
  if (!can(req.user.role, 'user.manage')) throw forbidden('Only administrators can create accounts.');
  const body = req.body || {};
  const name = cleanText(body.name, 160);
  const email = cleanText(body.email, 200)?.toLowerCase();
  const password = String(body.password || '');
  const role = ROLES[body.role] ? body.role : 'officer';
  if (!name || !email) throw bad('A name and an email address are needed.');
  if (password.length < 6) throw bad('Set a starting password with at least 6 characters.');
  if (get('SELECT id FROM users WHERE lower(email) = ?', [email])) throw bad('That email address is already in use.');
  const now = nowIso();
  const userId = id();
  run(
    `INSERT INTO users (id, name, email, phone, role, job_title, site, password_hash, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [userId, name, email, cleanText(body.phone, 40), role, cleanText(body.job_title, 120), cleanText(body.site, 120),
      hashPassword(password), now, now],
  );
  logAudit(req.user, 'user.create', 'user', userId, `${name} (${role})`, req.device);
  res.status(201).json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', [userId])) });
}));

workspaceRouter.patch('/users/:userId', asyncRoute((req, res) => {
  if (!can(req.user.role, 'user.manage')) throw forbidden('Only administrators can change accounts.');
  const user = get('SELECT * FROM users WHERE id = ?', [req.params.userId]);
  if (!user) throw missing('That account was not found.');
  const body = req.body || {};
  const sets = [];
  const params = [];
  for (const field of ['name', 'phone', 'job_title', 'site']) {
    if (field in body) { sets.push(`${field} = ?`); params.push(cleanText(body[field], 200)); }
  }
  if ('email' in body) { sets.push('email = ?'); params.push(cleanText(body.email, 200)?.toLowerCase()); }
  if ('role' in body && ROLES[body.role]) { sets.push('role = ?'); params.push(body.role); }
  if ('active' in body) { sets.push('active = ?'); params.push(body.active ? 1 : 0); }
  if (body.password) {
    if (String(body.password).length < 6) throw bad('Passwords need at least 6 characters.');
    sets.push('password_hash = ?');
    params.push(hashPassword(String(body.password)));
  }
  if (!sets.length) throw bad('Nothing to update.');
  sets.push('updated_at = ?');
  params.push(nowIso(), user.id);
  run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
  if (body.active === 0 || body.password) run('DELETE FROM sessions WHERE user_id = ?', [user.id]);
  logAudit(req.user, 'user.update', 'user', user.id, Object.keys(body).join(', '), req.device);
  res.json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', [user.id])) });
}));

workspaceRouter.post('/users/import', asyncRoute((req, res) => {
  if (!can(req.user.role, 'user.manage')) throw forbidden();
  const rows = Array.isArray(req.body?.users) ? req.body.users : [];
  if (!rows.length) throw bad('No users to import.');
  const now = nowIso();
  const created = [];
  const skipped = [];
  for (const row of rows) {
    const email = cleanText(row.email, 200)?.toLowerCase();
    if (!email || !cleanText(row.name, 160)) { skipped.push({ ...row, reason: 'Missing name or email' }); continue; }
    if (get('SELECT id FROM users WHERE lower(email) = ?', [email])) { skipped.push({ ...row, reason: 'Email already exists' }); continue; }
    const userId = id();
    run(
      `INSERT INTO users (id, name, email, phone, role, job_title, site, password_hash, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [userId, cleanText(row.name, 160), email, cleanText(row.phone, 40), ROLES[row.role] ? row.role : 'volunteer',
        cleanText(row.job_title, 120), cleanText(row.site, 120), hashPassword(String(row.password || 'fieldlink1')), now, now],
    );
    created.push({ id: userId, name: row.name, email, password: row.password || 'fieldlink1' });
  }
  logAudit(req.user, 'user.import', 'user', null, `${created.length} created`, req.device);
  res.json({ created, skipped });
}));

workspaceRouter.get('/audit', asyncRoute((req, res) => {
  if (!can(req.user.role, 'audit.view')) throw forbidden('Only administrators can view the activity log.');
  const rows = all(
    `SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC LIMIT ?`,
    [Math.min(toInt(req.query.limit, 200) || 200, 1000)],
  );
  res.json({ entries: rows });
}));

workspaceRouter.get('/imports', asyncRoute((req, res) => {
  if (!can(req.user.role, 'import.run')) throw forbidden();
  res.json({ batches: all('SELECT * FROM import_batches ORDER BY created_at DESC LIMIT 50') });
}));

export { mediaRequirement, parseJson };
