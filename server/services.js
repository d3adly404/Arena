/**
 * FieldLink — shared server services: access checks, audit trail, notifications.
 */
import { all, get, run, nowIso } from './db.js';
import { id, forbidden, missing } from './util.js';
import { canSeeAllFamilies } from '../shared/roles.js';

export function publicUser(row) {
  if (!row) return null;
  const { password_hash, ...rest } = row;
  return rest;
}

export function logAudit(user, action, entityType, entityId, detail, device) {
  run(
    `INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, detail, device, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id(), user?.id || null, action, entityType || null, entityId || null, detail || null, device || null, nowIso()],
  );
}

/**
 * Create a notification. FieldLink is a shared workspace, so notifications always come
 * from the server — that is what makes "supervisor requests correction on the laptop,
 * officer sees it on the phone" work.
 */
export function notify(userId, { title, body, kind = 'info', entityType, entityId, link, actorId }) {
  if (!userId) return null;
  // Never notify someone about their own action.
  if (actorId && actorId === userId) return null;
  const notificationId = id();
  run(
    `INSERT INTO notifications (id, user_id, title, body, kind, entity_type, entity_id, link, actor_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [notificationId, userId, title, body || null, kind, entityType || null, entityId || null, link || null, actorId || null, nowIso(), nowIso()],
  );
  return notificationId;
}

export function notifyAll(userIds, payload) {
  return userIds.filter(Boolean).map((userId) => notify(userId, payload));
}

export function userIdsByRole(...roles) {
  return all(`SELECT id FROM users WHERE active = 1 AND role IN (${roles.map(() => '?').join(',')})`, roles).map((r) => r.id);
}

export function supervisorIds() {
  return userIdsByRole('admin', 'supervisor');
}

/** Families a user is allowed to see. Officers/volunteers: assigned families and ones they created. */
export function visibleFamilyIds(user) {
  if (canSeeAllFamilies(user.role)) return null; // null = all
  return all(
    'SELECT id FROM families WHERE deleted_at IS NULL AND (lead_officer_id = ? OR created_by = ?)',
    [user.id, user.id],
  ).map((r) => r.id);
}

export function assertFamilyAccess(user, familyId) {
  const family = get('SELECT * FROM families WHERE id = ? AND deleted_at IS NULL', [familyId]);
  if (!family) throw missing('That family record was not found.');
  if (canSeeAllFamilies(user.role)) return family;
  if (family.lead_officer_id === user.id || family.created_by === user.id) return family;
  // Officers may also work on families where they are recorded on the visit team.
  const assigned = get(
    `SELECT 1 AS ok FROM forms WHERE family_id = ? AND (assigned_to = ? OR created_by = ?) AND deleted_at IS NULL LIMIT 1`,
    [familyId, user.id, user.id],
  );
  if (assigned) return family;
  throw forbidden('This family is not assigned to you. Ask your supervisor for access.');
}

export function canAccessFamily(user, familyId) {
  try {
    assertFamilyAccess(user, familyId);
    return true;
  } catch {
    return false;
  }
}

/** Record a revision snapshot of a form so the history is always auditable. */
export function recordRevision(form, changeNote, authorId) {
  run(
    `INSERT INTO form_revisions (id, form_id, revision, status, data, change_note, author_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id(), form.id, form.revision, form.status, form.data, changeNote || null, authorId || null, nowIso()],
  );
}

/** Where a task came from, in plain language for the interface. */
export const TASK_SOURCE_LABEL = {
  manual: 'Created by hand',
  call_follow_up: 'Call follow-up',
  form_review: 'Form review',
  event: 'Event',
  import: 'Import',
  visit: 'Field visit',
};
