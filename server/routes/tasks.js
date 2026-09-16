/**
 * FieldLink — Tasks and reminders.
 * Follow-up calls, form corrections and visit preparation all land here, so nothing an
 * officer promises to do is forgotten.
 */
import { Router } from 'express';
import { all, get, run, nowIso } from '../db.js';
import { asyncRoute, bad, missing, forbidden, id, cleanText, toInt } from '../util.js';
import { logAudit, notify, canAccessFamily } from '../services.js';
import { can, canSeeAllFamilies } from '../../shared/roles.js';

export const tasksRouter = Router();

export const TASK_SOURCE = {
  manual: 'Added by hand',
  call_follow_up: 'Call follow-up',
  form_review: 'Form review',
  event: 'Event',
  visit: 'Field visit',
  import: 'Import',
};

const TASK_SELECT = `
  SELECT t.*, u.name AS assignee_name, c.name AS created_by_name, f.code AS family_code, f.name AS family_name,
         e.title AS event_title, e.type AS event_type,
         (SELECT COUNT(*) FROM calls cl WHERE cl.follow_up_task_id = t.id) AS from_call
  FROM tasks t
  LEFT JOIN users u ON u.id = t.assignee_id
  LEFT JOIN users c ON c.id = t.created_by
  LEFT JOIN families f ON f.id = t.family_id
  LEFT JOIN events e ON e.id = t.event_id
`;

tasksRouter.get('/', asyncRoute((req, res) => {
  const { scope, status, family_id: familyId, event_id: eventId, assignee_id: assigneeId, category, search } = req.query;
  const where = ['t.deleted_at IS NULL'];
  const params = [];

  if (!canSeeAllFamilies(req.user.role)) {
    where.push('(t.assignee_id = ? OR t.created_by = ?)');
    params.push(req.user.id, req.user.id);
  }
  if (scope === 'mine') { where.push('t.assignee_id = ?'); params.push(req.user.id); }
  if (scope === 'created') { where.push('t.created_by = ?'); params.push(req.user.id); }
  if (scope === 'overdue') { where.push("t.status = 'open' AND t.due_at IS NOT NULL AND t.due_at < ?"); params.push(nowIso()); }
  if (scope === 'today') {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    where.push("t.status = 'open' AND t.due_at >= ? AND t.due_at <= ?");
    params.push(start.toISOString(), end.toISOString());
  }
  if (status && status !== 'all') {
    if (status === 'open') where.push("t.status = 'open'");
    else if (status === 'done') where.push("t.status = 'done'");
    else { where.push('t.status = ?'); params.push(status); }
  }
  if (familyId) { where.push('t.family_id = ?'); params.push(familyId); }
  if (eventId) { where.push('t.event_id = ?'); params.push(eventId); }
  if (assigneeId && assigneeId !== 'all') { where.push('t.assignee_id = ?'); params.push(assigneeId); }
  if (category && category !== 'all') { where.push('t.category = ?'); params.push(category); }
  if (search) {
    where.push('(t.title LIKE ? OR t.detail LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const rows = all(
    `${TASK_SELECT} WHERE ${where.join(' AND ')}
     ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
              CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
              COALESCE(t.due_at, '9999-12-31') ASC
     LIMIT 400`,
    params,
  );

  const today = new Date(); today.setHours(23, 59, 59, 999);
  res.json({
    tasks: rows,
    counts: {
      open: rows.filter((t) => t.status === 'open').length,
      overdue: rows.filter((t) => t.status === 'open' && t.due_at && new Date(t.due_at) < new Date()).length,
      today: rows.filter((t) => t.status === 'open' && t.due_at && new Date(t.due_at) <= today).length,
      done: rows.filter((t) => t.status === 'done').length,
      mine: rows.filter((t) => t.assignee_id === req.user.id && t.status === 'open').length,
    },
    sources: TASK_SOURCE,
  });
}));

tasksRouter.post('/', asyncRoute((req, res) => {
  if (!can(req.user.role, 'task.create')) throw forbidden('You do not have permission to create tasks.');
  const body = req.body || {};
  const title = cleanText(body.title, 200);
  if (!title) throw bad('Give the task a short title, for example "Call Hawawu again tomorrow".');
  const familyId = cleanText(body.family_id, 64) || null;
  if (familyId && !canAccessFamily(req.user, familyId)) throw forbidden('That family is not assigned to you.');
  const assigneeId = cleanText(body.assignee_id, 64) || req.user.id;
  if (assigneeId !== req.user.id && !can(req.user.role, 'task.assign.others')) {
    throw forbidden('Only supervisors can assign tasks to other people.');
  }
  const now = nowIso();
  const taskId = id();
  const dueAt = cleanText(body.due_at, 40) || null;
  const remindAt = cleanText(body.remind_at, 40)
    || (dueAt ? new Date(new Date(dueAt).getTime() - 3600000).toISOString() : null);

  run(
    `INSERT INTO tasks (id, title, detail, family_id, event_id, assignee_id, created_by, due_at, remind_at, priority, category, status, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
    [taskId, title, cleanText(body.detail, 4000), familyId, cleanText(body.event_id, 64), assigneeId, req.user.id,
      dueAt, remindAt, cleanText(body.priority, 20) || 'normal', cleanText(body.category, 40) || 'general',
      cleanText(body.source, 30) || 'manual', now, now],
  );

  if (assigneeId !== req.user.id) {
    notify(assigneeId, {
      title: 'New task assigned to you',
      body: `${req.user.name}: ${title}${dueAt ? ` — due ${dueAt.slice(0, 10)}` : ''}`,
      kind: 'task', entityType: 'task', entityId: taskId, link: '/tasks', actorId: req.user.id,
    });
  }
  logAudit(req.user, 'task.create', 'task', taskId, title, req.device);
  res.status(201).json({ task: get(`${TASK_SELECT} WHERE t.id = ?`, [taskId]) });
}));

tasksRouter.patch('/:taskId', asyncRoute((req, res) => {
  const task = get('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL', [req.params.taskId]);
  if (!task) throw missing('That task was not found.');
  const isOwner = task.assignee_id === req.user.id || task.created_by === req.user.id;
  if (!isOwner && !can(req.user.role, 'task.assign.others')) throw forbidden('This task belongs to someone else.');

  const body = req.body || {};
  const sets = [];
  const params = [];
  for (const field of ['title', 'detail', 'priority', 'category']) {
    if (field in body) { sets.push(`${field} = ?`); params.push(cleanText(body[field], 4000)); }
  }
  if ('due_at' in body) { sets.push('due_at = ?'); params.push(cleanText(body.due_at, 40)); }
  if ('remind_at' in body) { sets.push('remind_at = ?'); params.push(cleanText(body.remind_at, 40)); }
  if ('assignee_id' in body) {
    if (!can(req.user.role, 'task.assign.others')) throw forbidden('Only supervisors can reassign tasks.');
    sets.push('assignee_id = ?');
    params.push(cleanText(body.assignee_id, 64));
  }
  if ('status' in body) {
    const status = cleanText(body.status, 20);
    if (!['open', 'in_progress', 'done', 'cancelled'].includes(status)) throw bad('Unknown task status.');
    sets.push('status = ?', 'completed_at = ?');
    params.push(status, status === 'done' ? nowIso() : null);
  }
  if (!sets.length) throw bad('Nothing to update.');
  sets.push('updated_at = ?');
  params.push(nowIso(), task.id);
  run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, params);

  if (body.status === 'done' && task.created_by && task.created_by !== req.user.id) {
    notify(task.created_by, {
      title: 'Task completed',
      body: `${req.user.name} completed: ${task.title}`,
      kind: 'task', entityType: 'task', entityId: task.id, link: '/tasks', actorId: req.user.id,
    });
  }
  if (body.remind_at && task.assignee_id && task.assignee_id !== req.user.id) {
    run('UPDATE tasks SET reminded_at = NULL WHERE id = ?', [task.id]);
  }
  res.json({ task: get(`${TASK_SELECT} WHERE t.id = ?`, [task.id]) });
}));

/** Quick complete / reopen used by the checkboxes in the interface. */
tasksRouter.post('/:taskId/toggle', asyncRoute((req, res) => {
  const task = get('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL', [req.params.taskId]);
  if (!task) throw missing('That task was not found.');
  if (task.assignee_id !== req.user.id && task.created_by !== req.user.id && !can(req.user.role, 'task.assign.others')) {
    throw forbidden('This task belongs to someone else.');
  }
  const next = task.status === 'done' ? 'open' : 'done';
  run('UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?', [next, next === 'done' ? nowIso() : null, nowIso(), task.id]);
  logAudit(req.user, 'task.toggle', 'task', task.id, `${task.title} → ${next}`, req.device);
  res.json({ task: get(`${TASK_SELECT} WHERE t.id = ?`, [task.id]) });
}));

tasksRouter.delete('/:taskId', asyncRoute((req, res) => {
  const task = get('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL', [req.params.taskId]);
  if (!task) throw missing('That task was not found.');
  if (task.created_by !== req.user.id && !can(req.user.role, 'task.assign.others')) throw forbidden();
  run('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), task.id]);
  res.json({ ok: true });
}));

/** Tasks that are due soon, for the Home screen "Today" panel. */
tasksRouter.get('/summary/today', asyncRoute((req, res) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const rows = all(
    `${TASK_SELECT} WHERE t.deleted_at IS NULL AND t.status IN ('open','in_progress') AND t.assignee_id = ?
     ORDER BY COALESCE(t.due_at, '9999-12-31') ASC LIMIT 50`,
    [req.user.id],
  );
  res.json({
    overdue: rows.filter((t) => t.due_at && new Date(t.due_at) < start),
    today: rows.filter((t) => t.due_at && new Date(t.due_at) >= start && new Date(t.due_at) <= end),
    upcoming: rows.filter((t) => !t.due_at || new Date(t.due_at) > end),
  });
}));

export { toInt };
