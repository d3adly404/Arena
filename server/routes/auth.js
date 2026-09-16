/**
 * FieldLink — sign in, sign out and the current user.
 * One account works on every device: sign in on a phone, then on a laptop, and both
 * talk to the same workspace.
 */
import { Router } from 'express';
import { all, get, run, nowIso } from '../db.js';
import { asyncRoute, bad, unauthorized, id, token, verifyPassword, hashPassword, cleanText } from '../util.js';
import { publicUser, logAudit } from '../services.js';

export const authRouter = Router();

const SESSION_DAYS = 30;

export function createSession(userId, device) {
  const t = token();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  run(
    'INSERT INTO sessions (token, user_id, device, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    [t, userId, device || 'Unknown device', nowIso(), nowIso(), expires],
  );
  return { token: t, expires_at: expires };
}

export function invalidateSessions(userId) {
  run('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

export function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  // EventSource and plain <img>/<a> requests cannot send headers, so those URLs carry the
  // token as ?token=… This is the same token the interface already stores on the device.
  const queryToken = typeof req.query?.token === 'string' ? req.query.token : null;
  const t = bearer || req.get('x-fieldlink-token') || queryToken;
  if (!t) return next(unauthorized());
  const session = get('SELECT * FROM sessions WHERE token = ?', [t]);
  if (!session) return next(unauthorized('Your session has ended. Please sign in again.'));
  if (new Date(session.expires_at).getTime() < Date.now()) {
    run('DELETE FROM sessions WHERE token = ?', [t]);
    return next(unauthorized('Your session has expired. Please sign in again.'));
  }
  const user = get('SELECT * FROM users WHERE id = ?', [session.user_id]);
  if (!user || !user.active) return next(unauthorized('This account is not active.'));
  req.user = user;
  req.session = session;
  req.device = session.device;
  run('UPDATE sessions SET last_used_at = ? WHERE token = ?', [nowIso(), t]);
  if (!user.last_seen_at || Date.now() - new Date(user.last_seen_at).getTime() > 60000) {
    run('UPDATE users SET last_seen_at = ? WHERE id = ?', [nowIso(), user.id]);
  }
  next();
}

authRouter.post('/login', asyncRoute((req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) throw bad('Enter your email and password.');
  const user = get('SELECT * FROM users WHERE lower(email) = ?', [email]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw unauthorized('That email and password do not match an account.');
  }
  if (!user.active) throw unauthorized('This account has been deactivated. Contact your administrator.');
  const session = createSession(user.id, cleanText(req.body?.device, 120) || req.get('user-agent')?.slice(0, 120));
  logAudit(user, 'auth.login', 'user', user.id, `Signed in from ${req.body?.device || 'an unknown device'}`, req.body?.device);
  res.json({ token: session.token, expires_at: session.expires_at, user: publicUser(user) });
}));

authRouter.post('/logout', authenticate, asyncRoute((req, res) => {
  run('DELETE FROM sessions WHERE token = ?', [req.session.token]);
  logAudit(req.user, 'auth.logout', 'user', req.user.id, null, req.device);
  res.json({ ok: true });
}));

authRouter.get('/me', authenticate, asyncRoute((req, res) => {
  res.json({ user: publicUser(req.user), device: req.device });
}));

/** Everyone keeps their own details up to date — a field officer can change their number
 *  without waiting for an administrator. */
authRouter.patch('/profile', authenticate, asyncRoute((req, res) => {
  const name = cleanText(req.body?.name, 160);
  const phone = cleanText(req.body?.phone, 40);
  const jobTitle = cleanText(req.body?.job_title, 120);
  const site = cleanText(req.body?.site, 120);
  if (name && name.length < 2) throw bad('Please write your full name.');
  run(
    'UPDATE users SET name = ?, phone = ?, job_title = ?, site = ?, updated_at = ? WHERE id = ?',
    [name || req.user.name, phone, jobTitle, site, nowIso(), req.user.id],
  );
  const updated = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  logAudit(req.user, 'user.profile', 'user', req.user.id, 'Updated their own details', req.device);
  res.json({ user: publicUser(updated) });
}));

authRouter.post('/password', authenticate, asyncRoute((req, res) => {
  const current = String(req.body?.current_password || '');
  const next = String(req.body?.new_password || '');
  if (!verifyPassword(current, req.user.password_hash)) throw bad('Your current password is not correct.');
  if (next.length < 6) throw bad('Choose a password with at least 6 characters.');
  run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashPassword(next), nowIso(), req.user.id]);
  logAudit(req.user, 'auth.password', 'user', req.user.id, null, req.device);
  res.json({ ok: true });
}));

/** Team directory — everyone in the organisation can see who is who and how to reach them. */
authRouter.get('/team', authenticate, asyncRoute((req, res) => {
  const rows = all(
    `SELECT id, name, email, phone, role, job_title, site, active, avatar_tone, last_seen_at
     FROM users WHERE active = 1 ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'supervisor' THEN 1 WHEN 'officer' THEN 2 ELSE 3 END, name`,
  );
  res.json({ users: rows });
}));

authRouter.get('/devices', authenticate, asyncRoute((req, res) => {
  const rows = all(
    'SELECT token, device, created_at, last_used_at, expires_at FROM sessions WHERE user_id = ? ORDER BY last_used_at DESC',
    [req.user.id],
  );
  res.json({
    devices: rows.map((r) => ({ ...r, token: undefined, current: r.token === req.session.token })),
  });
}));

export { id };
