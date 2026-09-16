/**
 * FieldLink — Messages.
 * Familiar conversation list, unread indicators, search, attachments and timestamps,
 * plus conversations that are attached to a family, a task or an event.
 */
import { Router } from 'express';
import { all, get, run, nowIso } from '../db.js';
import { asyncRoute, bad, missing, forbidden, id, cleanText, toInt } from '../util.js';
import { logAudit, notify, canAccessFamily, assertFamilyAccess } from '../services.js';
import { can } from '../../shared/roles.js';

export const messagesRouter = Router();

function memberOf(conversationId, userId) {
  return get('SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [conversationId, userId]);
}

function assertMember(conversationId, user) {
  const conversation = get('SELECT * FROM conversations WHERE id = ? AND deleted_at IS NULL', [conversationId]);
  if (!conversation) throw missing('That conversation was not found.');
  if (!memberOf(conversationId, user.id)) throw forbidden('You are not part of this conversation.');
  return conversation;
}

function conversationSummary(conversation, userId) {
  const members = all(
    `SELECT cm.user_id, u.name, u.role, u.avatar_tone FROM conversation_members cm
     LEFT JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = ?`,
    [conversation.id],
  );
  const last = get(
    `SELECT m.*, u.name AS sender_name FROM messages m LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = ? AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1`,
    [conversation.id],
  );
  const me = memberOf(conversation.id, userId);
  const unread = get(
    `SELECT COUNT(*) AS n FROM messages m WHERE m.conversation_id = ? AND m.deleted_at IS NULL
       AND (m.sender_id IS NULL OR m.sender_id != ?) AND (? IS NULL OR m.created_at > ?)`,
    [conversation.id, userId, me?.last_read_at || null, me?.last_read_at || ''],
  );
  const others = members.filter((m) => m.user_id !== userId);
  const family = conversation.family_id ? get('SELECT id, code, name FROM families WHERE id = ?', [conversation.family_id]) : null;
  return {
    ...conversation,
    members,
    member_names: members.map((m) => m.name).filter(Boolean),
    last_message: last || null,
    unread: unread?.n || 0,
    display_title: conversation.title
      || (conversation.kind === 'direct' ? (others[0]?.name || 'Direct message') : (family ? `Family: ${family.name}` : 'Group')),
    family,
  };
}

messagesRouter.get('/conversations', asyncRoute((req, res) => {
  const rows = all(
    `SELECT c.* FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     WHERE c.deleted_at IS NULL
     ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT 200`,
    [req.user.id],
  );
  const conversations = rows.map((c) => conversationSummary(c, req.user.id));
  res.json({
    conversations,
    unread_total: conversations.reduce((sum, c) => sum + c.unread, 0),
  });
}));

messagesRouter.post('/conversations', asyncRoute((req, res) => {
  if (!can(req.user.role, 'message.send')) throw forbidden();
  const body = req.body || {};
  const userIds = Array.isArray(body.user_ids) ? body.user_ids.filter((u) => u && u !== req.user.id) : [];
  const kind = cleanText(body.kind, 20) === 'group' || userIds.length > 1 ? 'group' : 'direct';
  const familyId = cleanText(body.family_id, 64) || null;
  if (familyId && !canAccessFamily(req.user, familyId)) throw forbidden('That family is not assigned to you.');
  if (kind === 'direct' && !userIds.length) throw bad('Choose someone to message.');

  // Reuse an existing conversation rather than creating duplicates.
  if (kind === 'direct' && userIds.length === 1) {
    const existing = all(
      `SELECT c.id FROM conversations c
       JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = ?
       JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = ?
       WHERE c.kind = 'direct' AND c.deleted_at IS NULL`,
      [req.user.id, userIds[0]],
    );
    if (existing.length) return res.json({ conversation: conversationSummary(get('SELECT * FROM conversations WHERE id = ?', [existing[0].id]), req.user.id) });
  }

  const now = nowIso();
  const conversationId = id();
  run(
    `INSERT INTO conversations (id, kind, title, family_id, task_id, event_id, created_by, last_message_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [conversationId, kind, cleanText(body.title, 160), familyId, cleanText(body.task_id, 64), cleanText(body.event_id, 64), req.user.id, now, now, now],
  );
  for (const userId of new Set([req.user.id, ...userIds])) {
    run('INSERT INTO conversation_members (id, conversation_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id(), conversationId, userId, now, now]);
  }
  const conversation = get('SELECT * FROM conversations WHERE id = ?', [conversationId]);
  for (const userId of userIds) {
    notify(userId, {
      title: 'New conversation',
      body: `${req.user.name} started a conversation with you.`,
      kind: 'message', entityType: 'conversation', entityId: conversationId, link: `/messages/${conversationId}`, actorId: req.user.id,
    });
  }
  logAudit(req.user, 'conversation.create', 'conversation', conversationId, kind, req.device);
  res.status(201).json({ conversation: conversationSummary(conversation, req.user.id) });
}));

messagesRouter.get('/conversations/:conversationId', asyncRoute((req, res) => {
  const conversation = assertMember(req.params.conversationId, req.user);
  const limit = Math.min(toInt(req.query.limit, 100) || 100, 400);
  const before = cleanText(req.query.before, 40);
  const query = cleanText(req.query.q, 120);
  const where = ['m.conversation_id = ?', 'm.deleted_at IS NULL'];
  const params = [conversation.id];
  if (before) { where.push('m.created_at < ?'); params.push(before); }
  if (query) { where.push('m.body LIKE ?'); params.push(`%${query}%`); }

  const rows = all(
    `SELECT m.*, u.name AS sender_name, u.role AS sender_role, u.avatar_tone AS sender_tone,
            md.id AS media_ref, md.subcategory AS media_subcategory, md.category AS media_category, md.file_path AS media_path, md.mime AS media_mime,
            d.title AS document_title, d.file_path AS document_path, d.mime AS document_mime
     FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN media md ON md.id = m.media_id
     LEFT JOIN documents d ON d.id = m.document_id
     WHERE ${where.join(' AND ')}
     ORDER BY m.created_at DESC LIMIT ?`,
    [...params, limit],
  );
  const messages = rows.reverse().map((m) => ({
    ...m,
    media_url: m.media_path ? `/api/files/${m.media_path}` : null,
    document_url: m.document_path ? `/api/files/${m.document_path}` : null,
  }));
  run('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?', [nowIso(), conversation.id, req.user.id]);
  res.json({ conversation: conversationSummary(conversation, req.user.id), messages });
}));

messagesRouter.post('/conversations/:conversationId/messages', asyncRoute((req, res) => {
  const conversation = assertMember(req.params.conversationId, req.user);
  const body = cleanText(req.body?.body, 8000);
  const mediaId = cleanText(req.body?.media_id, 64) || null;
  const documentId = cleanText(req.body?.document_id, 64) || null;
  if (!body && !mediaId && !documentId) throw bad('Write a message or attach a photo or document.');
  const clientId = cleanText(req.body?.client_id, 80);
  if (clientId) {
    const existing = get('SELECT * FROM messages WHERE client_id = ?', [clientId]);
    if (existing) return res.json({ message: existing, duplicate: true });
  }
  const now = nowIso();
  const messageId = id();
  const kind = mediaId ? 'photo' : documentId ? 'document' : 'text';
  run(
    `INSERT INTO messages (id, conversation_id, sender_id, body, kind, media_id, document_id, client_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [messageId, conversation.id, req.user.id, body, kind, mediaId, documentId, clientId, now, now],
  );
  run('UPDATE conversations SET last_message_at = ?, updated_at = ? WHERE id = ?', [now, now, conversation.id]);
  run('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?', [now, conversation.id, req.user.id]);

  const members = all('SELECT user_id FROM conversation_members WHERE conversation_id = ?', [conversation.id]).map((m) => m.user_id);
  for (const userId of members) {
    notify(userId, {
      title: conversation.kind === 'direct' ? `Message from ${req.user.name}` : `${req.user.name} in ${conversation.title || 'a group'}`,
      body: (body || (kind === 'photo' ? 'Sent a photo' : 'Sent a document')).slice(0, 160),
      kind: 'message', entityType: 'conversation', entityId: conversation.id, link: `/messages/${conversation.id}`, actorId: req.user.id,
    });
  }
  res.status(201).json({
    message: get(
      `SELECT m.*, u.name AS sender_name, u.role AS sender_role, u.avatar_tone AS sender_tone FROM messages m
       LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = ?`,
      [messageId],
    ),
  });
}));

messagesRouter.post('/conversations/:conversationId/read', asyncRoute((req, res) => {
  const conversation = assertMember(req.params.conversationId, req.user);
  run('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?', [nowIso(), conversation.id, req.user.id]);
  res.json({ ok: true, conversation_id: conversation.id });
}));

messagesRouter.get('/search', asyncRoute((req, res) => {
  const q = cleanText(req.query.q, 120);
  if (!q) return res.json({ results: [] });
  const results = all(
    `SELECT m.id, m.body, m.created_at, m.conversation_id, u.name AS sender_name, c.title AS conversation_title, c.kind AS conversation_kind
     FROM messages m
     JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
     LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN conversations c ON c.id = m.conversation_id
     WHERE m.deleted_at IS NULL AND m.body LIKE ?
     ORDER BY m.created_at DESC LIMIT 60`,
    [req.user.id, `%${q}%`],
  );
  res.json({ results });
}));

/** Open (or create) the discussion that belongs to a family, task or event. */
function ensureLinkedConversation({ kind, title, familyId, taskId, eventId, user, memberIds }) {
  const column = familyId ? 'family_id' : taskId ? 'task_id' : 'event_id';
  const value = familyId || taskId || eventId;
  let conversation = get(`SELECT * FROM conversations WHERE ${column} = ? AND deleted_at IS NULL`, [value]);
  const now = nowIso();
  if (!conversation) {
    const conversationId = id();
    run(
      `INSERT INTO conversations (id, kind, title, family_id, task_id, event_id, created_by, last_message_at, created_at, updated_at)
       VALUES (?, 'group', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [conversationId, title, familyId || null, taskId || null, eventId || null, user.id, now, now, now],
    );
    conversation = get('SELECT * FROM conversations WHERE id = ?', [conversationId]);
  }
  const members = new Set([user.id, ...memberIds.filter(Boolean)]);
  for (const userId of members) {
    const existing = get('SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [conversation.id, userId]);
    if (!existing) {
      run('INSERT INTO conversation_members (id, conversation_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id(), conversation.id, userId, now, now]);
    }
  }
  return conversation;
}

messagesRouter.post('/for/family/:familyId', asyncRoute((req, res) => {
  // assertFamilyAccess returns the record and throws for a family this officer may not see.
  const family = assertFamilyAccess(req.user, req.params.familyId);
  const recruiters = all("SELECT id FROM users WHERE active = 1 AND role IN ('admin','supervisor')").map((u) => u.id);
  const conversation = ensureLinkedConversation({
    title: `Family: ${family.name} (${family.code})`,
    familyId: family.id,
    user: req.user,
    memberIds: [family.lead_officer_id, ...recruiters],
  });
  res.json({ conversation: conversationSummary(conversation, req.user.id) });
}));

messagesRouter.post('/for/task/:taskId', asyncRoute((req, res) => {
  const task = get('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL', [req.params.taskId]);
  if (!task) throw missing('That task was not found.');
  const conversation = ensureLinkedConversation({
    title: `Task: ${task.title}`,
    taskId: task.id,
    user: req.user,
    memberIds: [task.assignee_id, task.created_by],
  });
  res.json({ conversation: conversationSummary(conversation, req.user.id) });
}));

messagesRouter.get('/unread', asyncRoute((req, res) => {
  const row = get(
    `SELECT COUNT(*) AS n FROM messages m
     JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
     WHERE m.deleted_at IS NULL AND (m.sender_id IS NULL OR m.sender_id != ?)
       AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)`,
    [req.user.id, req.user.id],
  );
  res.json({ unread: row?.n || 0 });
}));

export { conversationSummary };
