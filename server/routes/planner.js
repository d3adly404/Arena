/**
 * FieldLink — Planner and calendar.
 * Field visits, meetings, trainings, distributions, NGO programmes, deadlines and
 * celebrations all live here, each with its own workspace tabs and reminders.
 */
import { Router } from 'express';
import { all, get, run, nowIso } from '../db.js';
import { asyncRoute, bad, missing, forbidden, id, cleanText, toInt } from '../util.js';
import { logAudit, notify, canAccessFamily } from '../services.js';
import { can, canSeeAllFamilies } from '../../shared/roles.js';
import { EVENT_TYPES, eventType, EVENT_TABS } from '../../shared/eventTypes.js';

export const plannerRouter = Router();

const DETAIL_SELECT = `
  SELECT e.*, u.name AS created_by_name, l.name AS lead_name, f.code AS family_code, f.name AS family_name,
    (SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id AND p.deleted_at IS NULL) AS participant_count,
    (SELECT COUNT(*) FROM tasks t WHERE t.event_id = e.id AND t.deleted_at IS NULL AND t.status = 'open') AS open_tasks,
    (SELECT COUNT(*) FROM documents d WHERE d.event_id = e.id AND d.deleted_at IS NULL) AS document_count,
    (SELECT COUNT(*) FROM media m WHERE m.event_id = e.id AND m.deleted_at IS NULL) AS photo_count,
    (SELECT COUNT(*) FROM conversations c WHERE c.event_id = e.id AND c.deleted_at IS NULL) AS conversation_count
  FROM events e
  LEFT JOIN users u ON u.id = e.created_by
  LEFT JOIN users l ON l.id = e.lead_id
  LEFT JOIN families f ON f.id = e.family_id
`;

function visibleEventWhere(user, params) {
  if (canSeeAllFamilies(user.role)) return null;
  if (user.role === 'officer' || user.role === 'volunteer') return null; // everyone can see the organisation calendar
  params.push(user.id);
  return 'e.created_by = ?';
}

plannerRouter.get('/', asyncRoute((req, res) => {
  const { view = 'week', from, to, type, scope } = req.query;
  const now = new Date();
  let start;
  let end;
  if (view === 'today') {
    start = new Date(now); start.setHours(0, 0, 0, 0);
    end = new Date(now); end.setHours(23, 59, 59, 999);
  } else if (view === 'day' && from) {
    start = new Date(from); start.setHours(0, 0, 0, 0);
    end = new Date(from); end.setHours(23, 59, 59, 999);
  } else if (view === 'week') {
    start = new Date(now); start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999);
  } else if (view === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (view === 'upcoming') {
    start = new Date(now);
    end = new Date(now.getTime() + 60 * 86400000);
  } else {
    start = from ? new Date(from) : new Date(now.getTime() - 7 * 86400000);
    end = to ? new Date(to) : new Date(now.getTime() + 30 * 86400000);
  }

  const where = ['e.deleted_at IS NULL', 'e.starts_at <= ?', 'COALESCE(e.ends_at, e.starts_at) >= ?'];
  const params = [end.toISOString(), start.toISOString()];
  if (type && type !== 'all') { where.push('e.type = ?'); params.push(type); }
  if (scope === 'mine') { where.push('(e.lead_id = ? OR e.created_by = ?)'); params.push(req.user.id, req.user.id); }
  if (scope === 'participating') {
    where.push('EXISTS (SELECT 1 FROM event_participants p WHERE p.event_id = e.id AND p.user_id = ? AND p.deleted_at IS NULL)');
    params.push(req.user.id);
  }

  const events = all(`${DETAIL_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.starts_at ASC LIMIT 500`, params);

  const taskWhere = ["t.deleted_at IS NULL", "t.status IN ('open','in_progress')", 't.due_at >= ?', 't.due_at <= ?'];
  const taskParams = [start.toISOString(), end.toISOString()];
  if (!canSeeAllFamilies(req.user.role)) { taskWhere.push('(t.assignee_id = ? OR t.created_by = ?)'); taskParams.push(req.user.id, req.user.id); }
  const tasks = all(
    `SELECT t.*, u.name AS assignee_name, f.code AS family_code, f.name AS family_name
     FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id LEFT JOIN families f ON f.id = t.family_id
     WHERE ${taskWhere.join(' AND ')} ORDER BY t.due_at ASC LIMIT 300`,
    taskParams,
  );

  const countsByType = {};
  for (const event of events) countsByType[event.type] = (countsByType[event.type] || 0) + 1;

  res.json({
    range: { start: start.toISOString(), end: end.toISOString(), view },
    events: events.map((e) => ({ ...e, theme: eventType(e.type) })),
    tasks,
    counts_by_type: countsByType,
    types: EVENT_TYPES,
    tabs: EVENT_TABS,
  });
}));

plannerRouter.get('/types', asyncRoute((req, res) => {
  res.json({ types: EVENT_TYPES, tabs: EVENT_TABS });
}));

plannerRouter.post('/events', asyncRoute((req, res) => {
  if (!can(req.user.role, 'event.create')) throw forbidden('Ask a supervisor if you need to add organisation events.');
  const body = req.body || {};
  const title = cleanText(body.title, 200);
  if (!title) throw bad('Give the event a title.');
  if (!body.starts_at) throw bad('Choose the date and time of the event.');
  const type = EVENT_TYPES[body.type] ? body.type : 'other';
  const familyId = cleanText(body.family_id, 64) || null;
  if (familyId && !canAccessFamily(req.user, familyId)) throw forbidden('That family is not assigned to you.');

  const eventId = id();
  const now = nowIso();
  run(
    `INSERT INTO events (id, title, type, description, status, location, starts_at, ends_at, all_day, family_id, created_by, lead_id, participant_target, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [eventId, title, type, cleanText(body.description, 6000), cleanText(body.status, 30) || 'planned',
      cleanText(body.location, 240), cleanText(body.starts_at, 40), cleanText(body.ends_at, 40) || null,
      body.all_day ? 1 : 0, familyId, req.user.id, cleanText(body.lead_id, 64) || req.user.id,
      toInt(body.participant_target), now, now],
  );

  const participants = Array.isArray(body.participant_ids) ? body.participant_ids : [];
  for (const userId of participants) {
    run(
      `INSERT INTO event_participants (id, event_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'invited', ?, ?)`,
      [id(), eventId, userId, 'participant', now, now],
    );
    notify(userId, {
      title: `Added to ${title}`,
      body: `${req.user.name} added you to "${title}" (${eventType(type).label})`,
      kind: 'event', entityType: 'event', entityId: eventId, link: `/planner/${eventId}`, actorId: req.user.id,
    });
  }

  const reminders = Array.isArray(body.reminders) ? body.reminders : [];
  for (const reminder of reminders) {
    const offset = toInt(reminder.offset_minutes, 1440);
    const target = reminder.remind_at
      ? cleanText(reminder.remind_at, 40)
      : new Date(new Date(body.starts_at).getTime() - offset * 60000).toISOString();
    run(
      `INSERT INTO event_reminders (id, event_id, user_id, offset_minutes, remind_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id(), eventId, reminder.user_id || req.user.id, offset, target, req.user.id, now, now],
    );
  }

  logAudit(req.user, 'event.create', 'event', eventId, `${title} (${type})`, req.device);
  res.status(201).json({ event: get(`${DETAIL_SELECT} WHERE e.id = ?`, [eventId]) });
}));

plannerRouter.get('/events/:eventId', asyncRoute((req, res) => {
  const event = get(`${DETAIL_SELECT} WHERE e.id = ? AND e.deleted_at IS NULL`, [req.params.eventId]);
  if (!event) throw missing('That event was not found.');
  const participants = all(
    `SELECT p.*, u.name AS user_name, u.role AS user_role, u.phone AS user_phone, f.name AS family_name, f.code AS family_code
     FROM event_participants p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN families f ON f.id = p.family_id
     WHERE p.event_id = ? AND p.deleted_at IS NULL ORDER BY u.name`,
    [event.id],
  );
  const tasks = all(
    `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
     WHERE t.event_id = ? AND t.deleted_at IS NULL ORDER BY CASE t.status WHEN 'open' THEN 0 ELSE 1 END, t.due_at`,
    [event.id],
  );
  const documents = all('SELECT * FROM documents WHERE event_id = ? AND deleted_at IS NULL ORDER BY created_at DESC', [event.id]);
  const photos = all(
    `SELECT m.*, u.name AS captured_by_name FROM media m LEFT JOIN users u ON u.id = m.captured_by
     WHERE m.event_id = ? AND m.deleted_at IS NULL ORDER BY m.captured_at DESC`,
    [event.id],
  );
  const reminders = all(
    `SELECT r.*, u.name AS user_name FROM event_reminders r LEFT JOIN users u ON u.id = r.user_id
     WHERE r.event_id = ? ORDER BY r.remind_at ASC`,
    [event.id],
  );
  const conversations = all('SELECT * FROM conversations WHERE event_id = ? AND deleted_at IS NULL', [event.id]);
  res.json({
    event: { ...event, theme: eventType(event.type) },
    participants,
    tasks,
    documents,
    photos: photos.map((p) => ({ ...p, url: p.file_path ? `/api/files/${p.file_path}` : null })),
    reminders,
    conversations,
    tabs: EVENT_TABS.filter((t) => eventType(event.type).tabs.includes(t.key)),
  });
}));

plannerRouter.patch('/events/:eventId', asyncRoute((req, res) => {
  const event = get('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL', [req.params.eventId]);
  if (!event) throw missing('That event was not found.');
  if (!can(req.user.role, 'event.manage') && event.created_by !== req.user.id && event.lead_id !== req.user.id) {
    throw forbidden('Only the organiser or a supervisor can change this event.');
  }
  const body = req.body || {};
  const sets = [];
  const params = [];
  for (const field of ['title', 'description', 'location', 'status']) {
    if (field in body) { sets.push(`${field} = ?`); params.push(cleanText(body[field], field === 'description' ? 6000 : 240)); }
  }
  if ('type' in body && EVENT_TYPES[body.type]) { sets.push('type = ?'); params.push(body.type); }
  if ('starts_at' in body) { sets.push('starts_at = ?'); params.push(cleanText(body.starts_at, 40)); }
  if ('ends_at' in body) { sets.push('ends_at = ?'); params.push(cleanText(body.ends_at, 40)); }
  if ('all_day' in body) { sets.push('all_day = ?'); params.push(body.all_day ? 1 : 0); }
  if ('lead_id' in body) { sets.push('lead_id = ?'); params.push(cleanText(body.lead_id, 64)); }
  if ('participant_target' in body) { sets.push('participant_target = ?'); params.push(toInt(body.participant_target)); }
  if (!sets.length) throw bad('Nothing to update.');
  sets.push('updated_at = ?');
  params.push(nowIso(), event.id);
  run(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`, params);

  const participants = all('SELECT user_id FROM event_participants WHERE event_id = ? AND deleted_at IS NULL AND user_id IS NOT NULL', [event.id]);
  for (const participant of participants) {
    notify(participant.user_id, {
      title: 'Event updated',
      body: `${req.user.name} updated "${cleanText(body.title, 200) || event.title}"`,
      kind: 'event', entityType: 'event', entityId: event.id, link: `/planner/${event.id}`, actorId: req.user.id,
    });
  }
  res.json({ event: get(`${DETAIL_SELECT} WHERE e.id = ?`, [event.id]) });
}));

plannerRouter.delete('/events/:eventId', asyncRoute((req, res) => {
  if (!can(req.user.role, 'event.manage')) throw forbidden();
  const event = get('SELECT * FROM events WHERE id = ?', [req.params.eventId]);
  if (!event) throw missing();
  run('UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), event.id]);
  logAudit(req.user, 'event.delete', 'event', event.id, event.title, req.device);
  res.json({ ok: true });
}));

plannerRouter.post('/events/:eventId/participants', asyncRoute((req, res) => {
  const event = get('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL', [req.params.eventId]);
  if (!event) throw missing('That event was not found.');
  if (!can(req.user.role, 'event.manage') && event.created_by !== req.user.id && event.lead_id !== req.user.id) throw forbidden();
  const userIds = Array.isArray(req.body?.user_ids) ? req.body.user_ids : [];
  const familyIds = Array.isArray(req.body?.family_ids) ? req.body.family_ids : [];
  if (!userIds.length && !familyIds.length) throw bad('Choose who to add to this event.');
  const now = nowIso();
  const added = [];
  for (const userId of userIds) {
    const exists = get('SELECT id FROM event_participants WHERE event_id = ? AND user_id = ? AND deleted_at IS NULL', [event.id, userId]);
    if (exists) continue;
    run('INSERT INTO event_participants (id, event_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id(), event.id, userId, cleanText(req.body?.role, 40) || 'participant', 'invited', now, now]);
    added.push({ user_id: userId });
    notify(userId, {
      title: `Added to ${event.title}`,
      body: `${req.user.name} added you to "${event.title}"`,
      kind: 'event', entityType: 'event', entityId: event.id, link: `/planner/${event.id}`, actorId: req.user.id,
    });
  }
  for (const familyId of familyIds) {
    if (!canAccessFamily(req.user, familyId)) continue;
    run('INSERT INTO event_participants (id, event_id, family_id, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id(), event.id, familyId, 'family', 'invited', now, now]);
    added.push({ family_id: familyId });
  }
  res.json({ added, participants: all('SELECT * FROM event_participants WHERE event_id = ? AND deleted_at IS NULL', [event.id]) });
}));

plannerRouter.delete('/events/:eventId/participants/:participantId', asyncRoute((req, res) => {
  const event = get('SELECT * FROM events WHERE id = ?', [req.params.eventId]);
  if (!event) throw missing();
  if (!can(req.user.role, 'event.manage') && event.created_by !== req.user.id && event.lead_id !== req.user.id) throw forbidden();
  run('UPDATE event_participants SET deleted_at = ?, updated_at = ? WHERE id = ? AND event_id = ?', [nowIso(), nowIso(), req.params.participantId, event.id]);
  res.json({ ok: true });
}));

plannerRouter.post('/events/:eventId/reminders', asyncRoute((req, res) => {
  const event = get('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL', [req.params.eventId]);
  if (!event) throw missing('That event was not found.');
  const offsets = Array.isArray(req.body?.offsets) ? req.body.offsets : [toInt(req.body?.offset_minutes, 1440)];
  const now = nowIso();
  const created = [];
  for (const offset of offsets) {
    const minutes = toInt(offset, 1440);
    const remindAt = req.body?.remind_at && minutes === -1
      ? cleanText(req.body.remind_at, 40)
      : new Date(new Date(event.starts_at).getTime() - minutes * 60000).toISOString();
    const reminderId = id();
    run(
      `INSERT INTO event_reminders (id, event_id, user_id, offset_minutes, remind_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [reminderId, event.id, req.body?.user_id || req.user.id, minutes, remindAt, req.user.id, now, now],
    );
    created.push(get('SELECT * FROM event_reminders WHERE id = ?', [reminderId]));
  }
  res.status(201).json({ reminders: created });
}));

plannerRouter.delete('/reminders/:reminderId', asyncRoute((req, res) => {
  run('DELETE FROM event_reminders WHERE id = ?', [req.params.reminderId]);
  res.json({ ok: true });
}));

plannerRouter.post('/events/:eventId/discuss', asyncRoute((req, res) => {
  const event = get('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL', [req.params.eventId]);
  if (!event) throw missing('That event was not found.');
  let conversation = get('SELECT * FROM conversations WHERE event_id = ? AND deleted_at IS NULL', [event.id]);
  const now = nowIso();
  if (!conversation) {
    const conversationId = id();
    run(
      `INSERT INTO conversations (id, kind, title, event_id, created_by, last_message_at, created_at, updated_at)
       VALUES (?, 'group', ?, ?, ?, ?, ?, ?)`,
      [conversationId, `Event: ${event.title}`, event.id, req.user.id, now, now, now],
    );
    conversation = get('SELECT * FROM conversations WHERE id = ?', [conversationId]);
  }
  const members = all('SELECT user_id FROM event_participants WHERE event_id = ? AND deleted_at IS NULL AND user_id IS NOT NULL', [event.id]).map((p) => p.user_id);
  const memberSet = new Set([req.user.id, event.created_by, event.lead_id, ...members].filter(Boolean));
  for (const userId of memberSet) {
    const existing = get('SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [conversation.id, userId]);
    if (!existing) {
      run('INSERT INTO conversation_members (id, conversation_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id(), conversation.id, userId, now, now]);
    }
  }
  res.json({ conversation });
}));

/**
 * Turn due reminders into notifications. Called every minute by the server so a phone
 * that was offline at the time still finds the reminder waiting when it reconnects.
 */
export function runReminderSweep() {
  const now = nowIso();
  const due = all('SELECT * FROM event_reminders WHERE sent_at IS NULL AND remind_at <= ?', [now]);
  for (const reminder of due) {
    const event = get('SELECT * FROM events WHERE id = ?', [reminder.event_id]);
    if (!event || event.deleted_at) {
      run('UPDATE event_reminders SET sent_at = ? WHERE id = ?', [now, reminder.id]);
      continue;
    }
    notify(reminder.user_id || event.lead_id || event.created_by, {
      title: `Reminder: ${event.title}`,
      body: `${eventType(event.type).label}${event.location ? ` at ${event.location}` : ''} — ${new Date(event.starts_at).toLocaleString()}`,
      kind: 'reminder',
      entityType: 'event',
      entityId: event.id,
      link: `/planner/${event.id}`,
    });
    run('UPDATE event_reminders SET sent_at = ? WHERE id = ?', [now, reminder.id]);
  }

  const dueTasks = all(
    "SELECT * FROM tasks WHERE deleted_at IS NULL AND status IN ('open','in_progress') AND reminded_at IS NULL AND remind_at IS NOT NULL AND remind_at <= ?",
    [now],
  );
  for (const task of dueTasks) {
    notify(task.assignee_id, {
      title: `Task reminder: ${task.title}`,
      body: task.detail || (task.due_at ? `Due ${new Date(task.due_at).toLocaleString()}` : 'Open tasks'),
      kind: 'task',
      entityType: 'task',
      entityId: task.id,
      link: '/tasks',
    });
    run('UPDATE tasks SET reminded_at = ? WHERE id = ?', [now, task.id]);
  }
  return { event_reminders: due.length, task_reminders: dueTasks.length };
}

plannerRouter.post('/reminders/run', asyncRoute((req, res) => {
  if (!can(req.user.role, 'event.manage')) throw forbidden();
  res.json(runReminderSweep());
}));

export { EVENT_TYPES };
