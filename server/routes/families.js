/**
 * FieldLink — Families.
 * The family record is the centre of the workspace: forms, media, calls, tasks,
 * documents and conversations all hang off it.
 */
import { Router } from 'express';
import { all, get, run, nowIso } from '../db.js';
import {
  asyncRoute, bad, missing, forbidden, id, cleanText, toInt, toNumber, toBool, parseJson,
} from '../util.js';
import { assertFamilyAccess, logAudit, notify, supervisorIds } from '../services.js';
import { canSeeAllFamilies, can } from '../../shared/roles.js';
import { buildChecklist } from '../../shared/mediaChecklist.js';

export const familiesRouter = Router();

const CODE_PREFIX = (family) => {
  const source = family.community || family.district || family.region || family.name || 'FLK';
  const letters = source.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
  return letters.padEnd(3, 'X');
};

function nextFamilyCode(source) {
  const prefix = CODE_PREFIX(source);
  const row = get(
    `SELECT code FROM families WHERE code LIKE ? ORDER BY code DESC LIMIT 1`,
    [`${prefix}-%`],
  );
  const last = row ? Number(String(row.code).split('-')[1]) : 0;
  return `${prefix}-${String(last + 1).padStart(3, '0')}`;
}

export function mediaRequirement(family, members) {
  const groups = buildChecklist(family, members).map((g) => ({ items: g.items }));
  const required = groups.flatMap((g) => g.items).filter((i) => i.required);
  return { requiredKeys: required.map((i) => i.key), requiredCount: required.length };
}

export function mediaProgress(family, members, mediaRows) {
  const { requiredKeys, requiredCount } = mediaRequirement(family, members);
  const byKey = new Map();
  for (const m of mediaRows) {
    if (!m.checklist_key) continue;
    const current = byKey.get(m.checklist_key);
    if (!current || (current.status === 'not_available' && m.status !== 'not_available')) byKey.set(m.checklist_key, m);
  }
  let completed = 0;
  let handled = 0;
  for (const key of requiredKeys) {
    const entry = byKey.get(key);
    if (!entry) continue;
    handled += 1;
    if (entry.status === 'captured' || entry.status === 'uploaded') completed += 1;
  }
  return {
    required: requiredCount,
    completed,
    handled,
    outstanding: requiredCount - handled,
    percent: requiredCount ? Math.round((completed / requiredCount) * 100) : 100,
  };
}

const FAMILY_SELECT = `
  SELECT f.*,
    u.name AS officer_name,
    (SELECT COUNT(*) FROM family_members m WHERE m.family_id = f.id AND m.deleted_at IS NULL) AS members_count,
    (SELECT COUNT(*) FROM family_members m WHERE m.family_id = f.id AND m.deleted_at IS NULL AND m.is_orphan = 1) AS orphans_count,
    (SELECT COUNT(*) FROM media md WHERE md.family_id = f.id AND md.deleted_at IS NULL AND md.status IN ('captured','uploaded') AND md.checklist_key IS NOT NULL) AS media_completed,
    (SELECT COUNT(*) FROM media md WHERE md.family_id = f.id AND md.deleted_at IS NULL) AS media_total,
    (SELECT COUNT(*) FROM tasks t WHERE t.family_id = f.id AND t.deleted_at IS NULL AND t.status = 'open') AS open_tasks,
    (SELECT COUNT(*) FROM forms fm WHERE fm.family_id = f.id AND fm.deleted_at IS NULL) AS forms_count,
    (SELECT fm.status FROM forms fm WHERE fm.family_id = f.id AND fm.deleted_at IS NULL ORDER BY fm.updated_at DESC LIMIT 1) AS latest_form_status,
    (SELECT fm.id FROM forms fm WHERE fm.family_id = f.id AND fm.deleted_at IS NULL ORDER BY fm.updated_at DESC LIMIT 1) AS latest_form_id,
    (SELECT COUNT(*) FROM calls c WHERE c.family_id = f.id AND c.deleted_at IS NULL) AS calls_count
  FROM families f
  LEFT JOIN users u ON u.id = f.lead_officer_id
`;

function decorateFamily(row) {
  if (!row) return row;
  const members = all('SELECT * FROM family_members WHERE family_id = ? AND deleted_at IS NULL ORDER BY name', [row.id]);
  const { requiredCount } = mediaRequirement(row, members);
  const handled = get(
    `SELECT COUNT(*) AS n FROM media WHERE family_id = ? AND deleted_at IS NULL AND checklist_key IS NOT NULL
       AND status IN ('captured','uploaded','not_available')`,
    [row.id],
  );
  return {
    ...row,
    orphan_count: row.orphans_count ?? row.orphan_count,
    media_required: requiredCount,
    media_handled: handled?.n || 0,
    members,
  };
}

familiesRouter.get('/', asyncRoute((req, res) => {
  const { query, status, region, urgency, officer, sort } = req.query;
  const where = ['f.deleted_at IS NULL'];
  const params = [];
  if (!canSeeAllFamilies(req.user.role)) {
    where.push('(f.lead_officer_id = ? OR f.created_by = ?)');
    params.push(req.user.id, req.user.id);
  }
  if (query) {
    where.push('(f.name LIKE ? OR f.code LIKE ? OR f.head_name LIKE ? OR f.guardian_name LIKE ? OR f.phone LIKE ? OR f.community LIKE ?)');
    const like = `%${query}%`;
    params.push(like, like, like, like, like, like);
  }
  if (status && status !== 'all') { where.push('f.status = ?'); params.push(status); }
  if (region && region !== 'all') { where.push('f.region = ?'); params.push(region); }
  if (urgency && urgency !== 'all') { where.push('f.urgency = ?'); params.push(urgency); }
  if (officer && officer !== 'all') { where.push('f.lead_officer_id = ?'); params.push(officer); }

  const order =
    sort === 'name' ? 'f.name ASC'
      : sort === 'visit' ? 'f.last_visit_at DESC NULLS LAST'
        : sort === 'urgency' ? `CASE f.urgency WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END`
          : 'f.updated_at DESC';

  const rows = all(`${FAMILY_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 400`, params);
  const withProgress = rows.map((row) => {
    const members = all('SELECT * FROM family_members WHERE family_id = ? AND deleted_at IS NULL', [row.id]);
    const { requiredCount } = mediaRequirement(row, members);
    return {
      ...row,
      media_required: requiredCount,
      media_percent: requiredCount ? Math.round((row.media_completed / requiredCount) * 100) : 100,
    };
  });
  const regions = all('SELECT DISTINCT region FROM families WHERE deleted_at IS NULL AND region IS NOT NULL ORDER BY region').map((r) => r.region);
  res.json({ families: withProgress, regions });
}));

familiesRouter.post('/', asyncRoute((req, res) => {
  if (!can(req.user.role, 'family.create')) throw forbidden('Only officers, supervisors and administrators can register families.');
  const body = req.body || {};
  const name = cleanText(body.name, 160);
  if (!name) throw bad('Please give the family a name.');
  const now = nowIso();
  const familyId = id();
  const code = cleanText(body.code, 32) || nextFamilyCode(body);
  run(
    `INSERT INTO families (id, code, name, head_name, guardian_name, phone, alternate_phone, region, district, community,
      address, gps_lat, gps_lng, status, orphan_count, member_count, monthly_income, urgency, registered_at,
      lead_officer_id, created_by, summary, consent_photo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      familyId, code, name, cleanText(body.head_name, 160), cleanText(body.guardian_name, 160),
      cleanText(body.phone, 40), cleanText(body.alternate_phone, 40), cleanText(body.region, 80),
      cleanText(body.district, 80), cleanText(body.community, 120), cleanText(body.address, 240),
      toNumber(body.gps_lat), toNumber(body.gps_lng), cleanText(body.status, 40) || 'active',
      toInt(body.orphan_count, 0), toInt(body.member_count, 0), toNumber(body.monthly_income),
      cleanText(body.urgency, 20) || 'Medium', cleanText(body.registered_at, 40) || now.slice(0, 10),
      cleanText(body.lead_officer_id, 64) || req.user.id, req.user.id, cleanText(body.summary, 4000),
      toBool(body.consent_photo ?? 1), now, now,
    ],
  );
  logAudit(req.user, 'family.create', 'family', familyId, `${code} — ${name}`, req.device);
  for (const supervisor of supervisorIds()) {
    notify(supervisor, {
      title: 'New family registered',
      body: `${req.user.name} registered ${name} (${code}).`,
      kind: 'family',
      entityType: 'family',
      entityId: familyId,
      link: `/families/${familyId}`,
      actorId: req.user.id,
    });
  }
  res.status(201).json({ family: get('SELECT * FROM families WHERE id = ?', [familyId]) });
}));

familiesRouter.get('/:familyId', asyncRoute((req, res) => {
  const family = assertFamilyAccess(req.user, req.params.familyId);
  const members = all('SELECT * FROM family_members WHERE family_id = ? AND deleted_at IS NULL ORDER BY is_orphan DESC, name', [family.id]);
  const mediaRows = all('SELECT * FROM media WHERE family_id = ? AND deleted_at IS NULL ORDER BY captured_at DESC', [family.id]);
  const forms = all(
    `SELECT fm.*, cu.name AS created_by_name, ru.name AS reviewer_name, au.name AS assigned_to_name
     FROM forms fm
     LEFT JOIN users cu ON cu.id = fm.created_by
     LEFT JOIN users ru ON ru.id = fm.reviewer_id
     LEFT JOIN users au ON au.id = fm.assigned_to
     WHERE fm.family_id = ? AND fm.deleted_at IS NULL ORDER BY fm.updated_at DESC`,
    [family.id],
  );
  const tasks = all(
    `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
     WHERE t.family_id = ? AND t.deleted_at IS NULL ORDER BY CASE t.status WHEN 'open' THEN 0 ELSE 1 END, t.due_at`,
    [family.id],
  );
  const calls = all(
    `SELECT c.*, u.name AS officer_name FROM calls c LEFT JOIN users u ON u.id = c.officer_id
     WHERE c.family_id = ? AND c.deleted_at IS NULL ORDER BY c.called_at DESC`,
    [family.id],
  );
  const notes = all(
    `SELECT n.*, u.name AS author_name FROM family_notes n LEFT JOIN users u ON u.id = n.author_id
     WHERE n.family_id = ? AND n.deleted_at IS NULL ORDER BY n.created_at DESC`,
    [family.id],
  );
  const documents = all(
    `SELECT d.*, u.name AS uploaded_by_name FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE d.family_id = ? AND d.deleted_at IS NULL ORDER BY d.created_at DESC`,
    [family.id],
  );
  const conversations = all(
    `SELECT c.* FROM conversations c WHERE c.family_id = ? AND c.deleted_at IS NULL ORDER BY c.last_message_at DESC`,
    [family.id],
  );
  const events = all(
    `SELECT * FROM events WHERE family_id = ? AND deleted_at IS NULL ORDER BY starts_at DESC LIMIT 20`,
    [family.id],
  );
  const officer = family.lead_officer_id ? get('SELECT id, name, phone, role, job_title FROM users WHERE id = ?', [family.lead_officer_id]) : null;

  res.json({
    family: {
      ...family,
      members,
      officer,
      media_progress: mediaProgress(family, members, mediaRows),
      forms: forms.map((f) => ({ ...f, data: parseJson(f.data, {}) })),
      tasks,
      calls,
      notes,
      documents,
      conversations,
      events,
      media: mediaRows,
    },
  });
}));

familiesRouter.patch('/:familyId', asyncRoute((req, res) => {
  if (!can(req.user.role, 'family.edit')) throw forbidden();
  const family = assertFamilyAccess(req.user, req.params.familyId);
  const body = req.body || {};
  const fields = ['name', 'head_name', 'guardian_name', 'phone', 'alternate_phone', 'region', 'district', 'community', 'address', 'status', 'urgency', 'summary'];
  const sets = [];
  const params = [];
  for (const field of fields) {
    if (field in body) {
      sets.push(`${field} = ?`);
      params.push(cleanText(body[field], field === 'summary' ? 4000 : 240));
    }
  }
  for (const [field, key] of [['orphan_count', 'orphan_count'], ['member_count', 'member_count']]) {
    if (key in body) { sets.push(`${field} = ?`); params.push(toInt(body[key], 0)); }
  }
  if ('monthly_income' in body) { sets.push('monthly_income = ?'); params.push(toNumber(body.monthly_income)); }
  if ('gps_lat' in body || 'gps_lng' in body) {
    sets.push('gps_lat = ?', 'gps_lng = ?');
    params.push(toNumber(body.gps_lat), toNumber(body.gps_lng));
  }
  if ('lead_officer_id' in body) { sets.push('lead_officer_id = ?'); params.push(cleanText(body.lead_officer_id, 64)); }
  if ('consent_photo' in body) { sets.push('consent_photo = ?'); params.push(toBool(body.consent_photo)); }
  if (!sets.length) throw bad('Nothing to update.');
  sets.push('updated_at = ?');
  params.push(nowIso(), family.id);
  run(`UPDATE families SET ${sets.join(', ')} WHERE id = ?`, params);
  logAudit(req.user, 'family.update', 'family', family.id, Object.keys(body).join(', '), req.device);
  res.json({ family: get('SELECT * FROM families WHERE id = ?', [family.id]) });
}));

familiesRouter.delete('/:familyId', asyncRoute((req, res) => {
  if (req.user.role !== 'admin') throw forbidden('Only an administrator can remove a family record.');
  const family = get('SELECT * FROM families WHERE id = ?', [req.params.familyId]);
  if (!family) throw missing();
  run('UPDATE families SET deleted_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), family.id]);
  logAudit(req.user, 'family.delete', 'family', family.id, family.name, req.device);
  res.json({ ok: true });
}));

/* ---------------------------------------------------------------- members */

familiesRouter.post('/:familyId/members', asyncRoute((req, res) => {
  if (!can(req.user.role, 'family.edit')) throw forbidden();
  const family = assertFamilyAccess(req.user, req.params.familyId);
  const body = req.body || {};
  const name = cleanText(body.name, 160);
  if (!name) throw bad('Please give the household member a name.');
  const memberId = id();
  const now = nowIso();
  run(
    `INSERT INTO family_members (id, family_id, name, relation, gender, dob, age, is_orphan, orphan_status, school, class_level, health_status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      memberId, family.id, name, cleanText(body.relation, 60), cleanText(body.gender, 20), cleanText(body.dob, 30),
      toInt(body.age), toBool(body.is_orphan), cleanText(body.orphan_status, 60), cleanText(body.school, 160),
      cleanText(body.class_level, 60), cleanText(body.health_status, 60), cleanText(body.notes, 2000), now, now,
    ],
  );
  const counts = get(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN is_orphan = 1 THEN 1 ELSE 0 END) AS orphans
     FROM family_members WHERE family_id = ? AND deleted_at IS NULL`,
    [family.id],
  );
  run('UPDATE families SET member_count = ?, orphan_count = ?, updated_at = ? WHERE id = ?', [
    counts.total || 0, counts.orphans || 0, now, family.id,
  ]);
  logAudit(req.user, 'family.member.create', 'family', family.id, name, req.device);
  res.status(201).json({ member: get('SELECT * FROM family_members WHERE id = ?', [memberId]) });
}));

familiesRouter.patch('/:familyId/members/:memberId', asyncRoute((req, res) => {
  if (!can(req.user.role, 'family.edit')) throw forbidden();
  const family = assertFamilyAccess(req.user, req.params.familyId);
  const member = get('SELECT * FROM family_members WHERE id = ? AND family_id = ?', [req.params.memberId, family.id]);
  if (!member) throw missing('That household member was not found.');
  const body = req.body || {};
  const sets = [];
  const params = [];
  for (const field of ['name', 'relation', 'gender', 'dob', 'orphan_status', 'school', 'class_level', 'health_status', 'notes']) {
    if (field in body) { sets.push(`${field} = ?`); params.push(cleanText(body[field], 2000)); }
  }
  if ('age' in body) { sets.push('age = ?'); params.push(toInt(body.age)); }
  if ('is_orphan' in body) { sets.push('is_orphan = ?'); params.push(toBool(body.is_orphan)); }
  if (!sets.length) throw bad('Nothing to update.');
  sets.push('updated_at = ?');
  params.push(nowIso(), member.id);
  run(`UPDATE family_members SET ${sets.join(', ')} WHERE id = ?`, params);
  res.json({ member: get('SELECT * FROM family_members WHERE id = ?', [member.id]) });
}));

familiesRouter.delete('/:familyId/members/:memberId', asyncRoute((req, res) => {
  if (!can(req.user.role, 'family.edit')) throw forbidden();
  const family = assertFamilyAccess(req.user, req.params.familyId);
  run('UPDATE family_members SET deleted_at = ?, updated_at = ? WHERE id = ? AND family_id = ?', [
    nowIso(), nowIso(), req.params.memberId, family.id,
  ]);
  const counts = get(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN is_orphan = 1 THEN 1 ELSE 0 END) AS orphans
     FROM family_members WHERE family_id = ? AND deleted_at IS NULL`,
    [family.id],
  );
  run('UPDATE families SET member_count = ?, orphan_count = ?, updated_at = ? WHERE id = ?', [
    counts.total || 0, counts.orphans || 0, nowIso(), family.id,
  ]);
  res.json({ ok: true });
}));

/* ------------------------------------------------------------------ notes */

familiesRouter.post('/:familyId/notes', asyncRoute((req, res) => {
  const family = assertFamilyAccess(req.user, req.params.familyId);
  const body = cleanText(req.body?.body, 4000);
  if (!body) throw bad('Please write something before saving the note.');
  const noteId = id();
  run(
    'INSERT INTO family_notes (id, family_id, author_id, body, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [noteId, family.id, req.user.id, body, cleanText(req.body?.kind, 40) || 'note', nowIso(), nowIso()],
  );
  logAudit(req.user, 'family.note', 'family', family.id, null, req.device);
  res.status(201).json({
    note: get('SELECT n.*, u.name AS author_name FROM family_notes n LEFT JOIN users u ON u.id = n.author_id WHERE n.id = ?', [noteId]),
  });
}));

/* ------------------------------------------------------------------ calls */

const CALL_STATUSES = ['answered', 'no_answer', 'unavailable', 'wrong_number', 'call_later'];

export const CALL_STATUS_LABEL = {
  answered: 'Answered',
  no_answer: 'No answer',
  unavailable: 'Number unavailable',
  wrong_number: 'Wrong number',
  call_later: 'Call again later',
};

familiesRouter.post('/:familyId/calls', asyncRoute((req, res) => {
  const family = assertFamilyAccess(req.user, req.params.familyId);
  const body = req.body || {};
  const phone = cleanText(body.phone, 40) || family.phone;
  if (!phone) throw bad('There is no number saved for this family yet.');
  const status = cleanText(body.status, 40);
  if (!status || !CALL_STATUSES.includes(status)) throw bad('Please choose what happened on the call.');
  const callId = id();
  const now = nowIso();
  let followUpTaskId = null;

  run(
    `INSERT INTO calls (id, family_id, contact_name, phone, officer_id, status, note, duration_seconds, called_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      callId, family.id, cleanText(body.contact_name, 160) || family.guardian_name || family.head_name, phone,
      req.user.id, status, cleanText(body.note, 4000), toInt(body.duration_seconds), cleanText(body.called_at, 40) || now, now, now,
    ],
  );

  // Any outcome other than "answered" offers a follow-up task. The call screen always
  // sends one when the officer taps "Create follow-up task".
  if (body.create_follow_up) {
    followUpTaskId = id();
    const dueAt = cleanText(body.follow_up_due_at, 40) || new Date(Date.now() + 86400000).toISOString();
    run(
      `INSERT INTO tasks (id, title, detail, family_id, assignee_id, created_by, due_at, remind_at, priority, category, status, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 'call_follow_up', ?, ?)`,
      [
        followUpTaskId,
        cleanText(body.follow_up_title, 200) || `Call ${family.guardian_name || family.head_name || family.name} again`,
        cleanText(body.follow_up_detail, 2000) || `Previous call: ${CALL_STATUS_LABEL[status]}${body.note ? ` — ${body.note}` : ''}`,
        family.id, req.user.id, req.user.id, dueAt,
        new Date(new Date(dueAt).getTime() - 3600000).toISOString(),
        'high', 'call', now, now,
      ],
    );
    run('UPDATE calls SET follow_up_task_id = ? WHERE id = ?', [followUpTaskId, callId]);
    notify(req.user.id === family.lead_officer_id ? null : family.lead_officer_id, {
      title: 'Follow-up call scheduled',
      body: `${req.user.name} logged a call to ${family.name} (${CALL_STATUS_LABEL[status]}).`,
      kind: 'task',
      entityType: 'family',
      entityId: family.id,
      link: `/families/${family.id}`,
      actorId: req.user.id,
    });
  }

  logAudit(req.user, 'family.call', 'family', family.id, `${CALL_STATUS_LABEL[status]} ${phone}`, req.device);
  res.status(201).json({
    call: get(`SELECT c.*, u.name AS officer_name FROM calls c LEFT JOIN users u ON u.id = c.officer_id WHERE c.id = ?`, [callId]),
    follow_up_task_id: followUpTaskId,
  });
}));

familiesRouter.get('/:familyId/calls', asyncRoute((req, res) => {
  const family = assertFamilyAccess(req.user, req.params.familyId);
  const rows = all(
    `SELECT c.*, u.name AS officer_name FROM calls c LEFT JOIN users u ON u.id = c.officer_id
     WHERE c.family_id = ? AND c.deleted_at IS NULL ORDER BY c.called_at DESC`,
    [family.id],
  );
  res.json({ calls: rows });
}));

/* ----------------------------------------------------------------- import */

const CSV_COLUMNS = ['code', 'name', 'head_name', 'guardian_name', 'phone', 'alternate_phone', 'region', 'district', 'community', 'address', 'orphan_count', 'member_count', 'monthly_income', 'urgency', 'status', 'summary', 'lead_officer_email'];

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const src = String(text).replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else { inQuotes = false; }
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

familiesRouter.get('/import/template', asyncRoute((req, res) => {
  const sample = [
    CSV_COLUMNS.join(','),
    'NOR-010,"Aminah Household",Ibrahim Aminah,Hawawu Aminah,+233201234567,,Northern,Tamale,Sakasaka,"Near the blue mosque",3,6,420,High,active,"Father passed away in 2024",officer@fieldlink.org',
  ].join('\n');
  res.type('text/csv').send(sample);
}));

familiesRouter.post('/import', asyncRoute((req, res) => {
  if (!can(req.user.role, 'import.run')) throw forbidden('Only supervisors and administrators can import records.');
  const csv = typeof req.body === 'string' ? req.body : req.body?.csv;
  if (!csv) throw bad('Paste or upload a CSV file to import.');
  const rows = parseCsv(csv);
  if (rows.length < 2) throw bad('The file needs a header row and at least one family row.');
  const header = rows[0].map((h) => String(h).trim().toLowerCase().replace(/\s+/g, '_'));
  const created = [];
  const skipped = [];
  const errors = [];
  const now = nowIso();

  for (const raw of rows.slice(1)) {
    const record = {};
    header.forEach((key, index) => { record[key] = raw[index] !== undefined ? String(raw[index]).trim() : ''; });
    const name = record.name || record.household_name;
    if (!name) { skipped.push({ reason: 'No family name in the row', row: record }); continue; }
    const duplicate = record.code
      ? get('SELECT id FROM families WHERE code = ? AND deleted_at IS NULL', [record.code])
      : get('SELECT id FROM families WHERE name = ? AND IFNULL(community, "") = ? AND deleted_at IS NULL', [name, record.community || '']);
    if (duplicate) { skipped.push({ reason: `${name} already exists in FieldLink`, row: record }); continue; }
    try {
      const familyId = id();
      const officer = record.lead_officer_email
        ? get('SELECT id FROM users WHERE lower(email) = ?', [record.lead_officer_email.toLowerCase()])
        : null;
      const code = record.code || nextFamilyCode(record);
      run(
        `INSERT INTO families (id, code, name, head_name, guardian_name, phone, alternate_phone, region, district, community,
          address, status, orphan_count, member_count, monthly_income, urgency, registered_at, lead_officer_id, created_by, summary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          familyId, code, name, record.head_name || null, record.guardian_name || null, record.phone || null,
          record.alternate_phone || null, record.region || null, record.district || null, record.community || null,
          record.address || null, record.status || 'active', toInt(record.orphan_count, 0), toInt(record.member_count, 0),
          toNumber(record.monthly_income), record.urgency || 'Medium', now.slice(0, 10),
          officer?.id || req.user.id, req.user.id, record.summary || null, now, now,
        ],
      );
      created.push({ id: familyId, code, name });
    } catch (err) {
      errors.push({ row: record, message: err.message });
    }
  }

  run(
    `INSERT INTO import_batches (id, filename, row_count, created_count, skipped_count, errors, user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id(), cleanText(req.body?.filename, 200) || 'pasted.csv', rows.length - 1, created.length, skipped.length, JSON.stringify(errors).slice(0, 8000), req.user.id, now],
  );
  logAudit(req.user, 'family.import', 'family', null, `${created.length} created, ${skipped.length} skipped`, req.device);
  res.json({ created: created.length, skipped: skipped.length, errors, families: created, skipped_rows: skipped.slice(0, 25) });
}));
