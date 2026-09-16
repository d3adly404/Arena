/**
 * FieldLink — Camera & Media mini-app (server side).
 *
 * Every photograph carries its metadata (family, checklist item, category, subcategory,
 * who captured it and when). That is what lets an officer tap "TAKE PHOTO" on the
 * checklist and have the picture filed in the right place automatically.
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, nowIso, UPLOAD_DIR } from '../db.js';
import { asyncRoute, bad, missing, forbidden, id, cleanText, toNumber, toInt } from '../util.js';
import { assertFamilyAccess, logAudit } from '../services.js';
import { can } from '../../shared/roles.js';
import { buildChecklist, MEDIA_CHECKLIST } from '../../shared/mediaChecklist.js';
import { mediaProgress } from './families.js';
import { photoUpload, kindFor } from '../upload.js';
import { authenticate } from './auth.js';

export const mediaRouter = Router();

/** `?token=` support so <img src> and <video> can load protected files. */
function fileAuth(req, res, next) {
  if (req.query.token && !req.get('authorization') && !req.get('x-fieldlink-token')) {
    req.headers['x-fieldlink-token'] = String(req.query.token);
  }
  return authenticate(req, res, next);
}

export function mediaUrl(row) {
  return row?.file_path ? `/api/files/${row.file_path}` : null;
}

function decorate(row) {
  return {
    ...row,
    url: mediaUrl(row),
    thumbnail_url: row.kind === 'photo' ? mediaUrl(row) : null,
  };
}

mediaRouter.get('/', asyncRoute((req, res) => {
  const { family_id: familyId, category, group_key: groupKey, status, kind, event_id: eventId, limit } = req.query;
  const where = ['m.deleted_at IS NULL'];
  const params = [];
  if (familyId) { assertFamilyAccess(req.user, familyId); where.push('m.family_id = ?'); params.push(familyId); }
  if (category && category !== 'all') { where.push('m.category = ?'); params.push(category); }
  if (groupKey) { where.push('m.group_key = ?'); params.push(groupKey); }
  if (status && status !== 'all') { where.push('m.status = ?'); params.push(status); }
  if (kind && kind !== 'all') { where.push('m.kind = ?'); params.push(kind); }
  if (eventId) { where.push('m.event_id = ?'); params.push(eventId); }

  const rows = all(
    `SELECT m.*, f.code AS family_code, f.name AS family_name, u.name AS captured_by_name,
            c.name AS child_name
     FROM media m
     JOIN families f ON f.id = m.family_id
     LEFT JOIN users u ON u.id = m.captured_by
     LEFT JOIN family_members c ON c.id = m.child_id
     WHERE ${where.join(' AND ')}
     ORDER BY m.captured_at DESC
     LIMIT ?`,
    [...params, Math.min(toInt(limit, 300) || 300, 1000)],
  );

  const byCategory = {};
  for (const row of rows) {
    const key = row.category || 'General';
    byCategory[key] = (byCategory[key] || 0) + 1;
  }
  res.json({ media: rows.map(decorate), categories: Object.entries(byCategory).map(([categoryName, count]) => ({ category: categoryName, count })) });
}));

/** The required photography checklist for a family visit. */
mediaRouter.get('/checklist/:familyId', asyncRoute((req, res) => {
  const family = assertFamilyAccess(req.user, req.params.familyId);
  const members = all('SELECT * FROM family_members WHERE family_id = ? AND deleted_at IS NULL ORDER BY name', [family.id]);
  const rows = all('SELECT * FROM media WHERE family_id = ? AND deleted_at IS NULL ORDER BY captured_at DESC', [family.id]);
  const latest = new Map();
  for (const row of rows) {
    if (!row.checklist_key) continue;
    if (!latest.has(row.checklist_key)) latest.set(row.checklist_key, row);
  }
  const groups = buildChecklist(family, members).map((group) => ({
    ...group,
    items: group.items.map((item) => {
      const match = latest.get(item.key) || null;
      return {
        ...item,
        status: match ? match.status : 'pending',
        media_id: match?.id || null,
        url: match?.url || (match ? mediaUrl(match) : null),
        captured_at: match?.captured_at || null,
        note: match?.note || null,
      };
    }),
  }));
  res.json({
    family: { id: family.id, code: family.code, name: family.name, guardian_name: family.guardian_name, phone: family.phone, community: family.community, consent_photo: family.consent_photo },
    groups,
    progress: mediaProgress(family, members, rows),
    orphans: members.filter((m) => m.is_orphan).map((m) => ({ id: m.id, name: m.name, age: m.age })),
  });
}));

mediaRouter.get('/categories', asyncRoute((req, res) => {
  res.json({
    categories: MEDIA_CHECKLIST.map((g) => ({ key: g.key, category: g.category, description: g.description, items: g.items.map((i) => i.label), conditional: g.conditional, perChild: g.perChild })),
  });
}));

mediaRouter.post('/', photoUpload.array('files', 12), asyncRoute((req, res) => {
  if (!can(req.user.role, 'media.upload')) throw forbidden();
  const files = req.files || [];
  const body = req.body || {};
  const familyId = cleanText(body.family_id, 64);
  if (!familyId) throw bad('A photograph must belong to a family.');
  const family = assertFamilyAccess(req.user, familyId);
  if (!files.length) throw bad('No file was received.');
  if (family.consent_photo === 0) throw bad('This family has not agreed to photographs. Update the consent answer on the family record first.');

  const now = nowIso();
  const created = [];
  const status = body.status === 'uploaded' || body.source === 'file' ? 'uploaded' : 'captured';
  for (const file of files) {
    const mediaId = id();
    run(
      `INSERT INTO media (id, family_id, checklist_key, group_key, category, subcategory, child_id, status, kind, file_path, mime, size,
        note, source, captured_by, captured_at, gps_lat, gps_lng, event_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mediaId, familyId, cleanText(body.checklist_key, 120), cleanText(body.group_key, 40),
        cleanText(body.category, 80) || 'General', cleanText(body.subcategory, 120), cleanText(body.child_id, 64) || null,
        body.checklist_status === 'not_available' ? 'not_available' : status,
        kindFor(file.mimetype), file.filename, file.mimetype, file.size,
        cleanText(body.note, 1000), cleanText(body.source, 30) || 'camera', req.user.id,
        cleanText(body.captured_at, 40) || now, toNumber(body.gps_lat), toNumber(body.gps_lng),
        cleanText(body.event_id, 64), now, now,
      ],
    );
    const row = get('SELECT * FROM media WHERE id = ?', [mediaId]);
    created.push(decorate(row));
  }
  logAudit(req.user, 'media.upload', 'family', familyId, `${created.length} file(s) — ${body.category || 'General'}`, req.device);
  res.status(201).json({ media: created });
}));

/** "Not available" — recorded on the checklist without a file. */
mediaRouter.post('/not-available', asyncRoute((req, res) => {
  if (!can(req.user.role, 'media.upload')) throw forbidden();
  const familyId = cleanText(req.body?.family_id, 64);
  if (!familyId) throw bad('Choose the family first.');
  const family = assertFamilyAccess(req.user, familyId);
  const checklistKey = cleanText(req.body?.checklist_key, 120);
  if (!checklistKey) throw bad('Choose which required item is not available.');
  const now = nowIso();
  const existing = get('SELECT * FROM media WHERE family_id = ? AND checklist_key = ? AND deleted_at IS NULL', [familyId, checklistKey]);
  if (existing) {
    run('UPDATE media SET status = ?, note = ?, captured_at = ?, captured_by = ?, updated_at = ? WHERE id = ?',
      ['not_available', cleanText(req.body?.note, 1000), now, req.user.id, now, existing.id]);
  } else {
    run(
      `INSERT INTO media (id, family_id, checklist_key, group_key, category, subcategory, child_id, status, kind, note, source, captured_by, captured_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'not_available', 'photo', ?, 'not_available', ?, ?, ?, ?)`,
      [id(), familyId, checklistKey, cleanText(req.body?.group_key, 40), cleanText(req.body?.category, 80) || 'General',
        cleanText(req.body?.subcategory, 120), cleanText(req.body?.child_id, 64) || null, cleanText(req.body?.note, 1000),
        req.user.id, now, now, now],
    );
  }
  logAudit(req.user, 'media.not_available', 'family', family.id, `${checklistKey}: ${req.body?.note || ''}`, req.device);
  const row = get('SELECT * FROM media WHERE family_id = ? AND checklist_key = ? AND deleted_at IS NULL', [familyId, checklistKey]);
  res.status(201).json({ media: decorate(row) });
}));

mediaRouter.patch('/:mediaId', asyncRoute((req, res) => {
  const media = get('SELECT * FROM media WHERE id = ? AND deleted_at IS NULL', [req.params.mediaId]);
  if (!media) throw missing('That photograph was not found.');
  assertFamilyAccess(req.user, media.family_id);
  if (!can(req.user.role, 'media.upload')) throw forbidden();
  const body = req.body || {};
  const sets = [];
  const params = [];
  for (const field of ['category', 'subcategory', 'note', 'status', 'checklist_key', 'group_key']) {
    if (field in body) { sets.push(`${field} = ?`); params.push(cleanText(body[field], 200)); }
  }
  if (!sets.length) throw bad('Nothing to update.');
  sets.push('updated_at = ?');
  params.push(nowIso(), media.id);
  run(`UPDATE media SET ${sets.join(', ')} WHERE id = ?`, params);
  res.json({ media: decorate(get('SELECT * FROM media WHERE id = ?', [media.id])) });
}));

mediaRouter.delete('/:mediaId', asyncRoute((req, res) => {
  const media = get('SELECT * FROM media WHERE id = ? AND deleted_at IS NULL', [req.params.mediaId]);
  if (!media) throw missing('That photograph was not found.');
  assertFamilyAccess(req.user, media.family_id);
  if (!can(req.user.role, 'media.delete')) throw forbidden();
  run('UPDATE media SET deleted_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), media.id]);
  logAudit(req.user, 'media.delete', 'family', media.family_id, media.subcategory || media.category, req.device);
  res.json({ ok: true });
}));

/** Stream one photograph. Access is checked against the family it belongs to. */
mediaRouter.get('/:mediaId/file', fileAuth, asyncRoute((req, res) => {
  const media = get('SELECT * FROM media WHERE id = ?', [req.params.mediaId]);
  if (!media || media.deleted_at) throw missing('That photograph was not found.');
  assertFamilyAccess(req.user, media.family_id);
  if (!media.file_path) throw missing('There is no file stored for this item.');
  const full = path.join(UPLOAD_DIR, media.file_path);
  if (!full.startsWith(UPLOAD_DIR) || !fs.existsSync(full)) throw missing('The file is missing from the FieldLink data folder.');
  res.type(media.mime || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(full).pipe(res);
}));

mediaRouter.get('/:mediaId', fileAuth, asyncRoute((req, res) => {
  const media = get(
    `SELECT m.*, f.code AS family_code, f.name AS family_name, u.name AS captured_by_name, c.name AS child_name
     FROM media m JOIN families f ON f.id = m.family_id
     LEFT JOIN users u ON u.id = m.captured_by
     LEFT JOIN family_members c ON c.id = m.child_id
     WHERE m.id = ?`,
    [req.params.mediaId],
  );
  if (!media) throw missing('That item was not found.');
  assertFamilyAccess(req.user, media.family_id);
  const audit = all('SELECT action, created_at, user_id FROM audit_log WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 10', ['media', media.id]);
  res.json({ media: decorate(media), audit });
}));
