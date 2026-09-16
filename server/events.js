/**
 * FieldLink — live change channel.
 *
 * Devices keep a server-sent-events connection open. Whenever somebody changes
 * something (an officer submits a form on a phone, a supervisor comments on a laptop)
 * every other signed-in device is told to pull the changes straight away.
 */
const clients = new Set();

export function subscribe(res) {
  clients.add(res);
  return () => clients.delete(res);
}

export function broadcast(payload = {}) {
  const message = `event: change\ndata: ${JSON.stringify({ at: new Date().toISOString(), ...payload })}\n\n`;
  for (const res of clients) {
    try {
      res.write(message);
    } catch {
      clients.delete(res);
    }
  }
}

export function clientCount() {
  return clients.size;
}

/** Which parts of the workspace a request touched, worked out from its path. */
export function tablesForPath(path) {
  if (path.startsWith('/api/families')) return ['families', 'family_members'];
  if (path.startsWith('/api/forms')) return ['forms', 'form_comments'];
  if (path.startsWith('/api/media')) return ['media'];
  if (path.startsWith('/api/tasks')) return ['tasks'];
  if (path.startsWith('/api/planner')) return ['events', 'tasks'];
  if (path.startsWith('/api/messages')) return ['conversations', 'messages'];
  if (path.startsWith('/api/workspace/documents')) return ['documents'];
  if (path.startsWith('/api/workspace')) return ['notifications'];
  return [];
}
