/**
 * FieldLink — server entry point.
 *
 * Serves the FieldLink API and the FieldLink web workspace from a single address, so the
 * same workspace can be opened on a phone, a tablet or a laptop. In development the Vite
 * dev server is mounted in middleware mode; in production the built files are served.
 */
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HttpError } from './util.js';
import { db, UPLOAD_DIR, nowIso, run, get } from './db.js';
import { authRouter, authenticate } from './routes/auth.js';
import { familiesRouter } from './routes/families.js';
import { formsRouter } from './routes/forms.js';
import { mediaRouter } from './routes/media.js';
import { tasksRouter } from './routes/tasks.js';
import { plannerRouter } from './routes/planner.js';
import { messagesRouter } from './routes/messages.js';
import { workspaceRouter } from './routes/workspace.js';
import { syncRouter } from './routes/sync.js';
import { runReminderSweep } from './routes/planner.js';
import { broadcast, tablesForPath } from './events.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '0.0.0.0';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

// The workspace is opened from many origins (phones on the local network, the hosted
// preview). Requests are authorised by bearer token rather than by origin.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.get('origin') || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-FieldLink-Token, X-FieldLink-Client, X-FieldLink-Device');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (req, res) => {
  const families = get('SELECT COUNT(*) AS n FROM families WHERE deleted_at IS NULL');
  res.json({ ok: true, app: 'FieldLink', time: nowIso(), families: families?.n ?? 0 });
});

// ---- API -------------------------------------------------------------------
app.use('/api/auth', authRouter);
app.use('/api/families', authenticate, familiesRouter);
app.use('/api/forms', authenticate, formsRouter);
app.use('/api/media', authenticate, mediaRouter);
app.use('/api/tasks', authenticate, tasksRouter);
app.use('/api/planner', authenticate, plannerRouter);
app.use('/api/messages', authenticate, messagesRouter);
app.use('/api/workspace', authenticate, workspaceRouter);
app.use('/api/sync', authenticate, syncRouter);

app.get('/api', (req, res) => {
  res.json({
    name: 'FieldLink API',
    version: '1.0.0',
    principle: 'One account. One database. One workspace. All devices sync.',
    modules: ['families', 'forms', 'media', 'tasks', 'planner', 'messages', 'documents', 'notifications', 'admin'],
  });
});

// Tell every other signed-in device that something changed, so a form submitted on a
// phone appears on the supervisor's laptop without anyone pressing refresh.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  res.on('finish', () => {
    if (res.statusCode < 400) broadcast({ tables: tablesForPath(req.originalUrl.split('?')[0]), by: req.user?.id || null });
  });
  next();
});

// ---- Uploaded files --------------------------------------------------------
// Files are never served blindly: the media and document routes check that the person
// asking is allowed to see the family they belong to before they are streamed.
app.use('/api/files', authenticate, (req, res, next) => {
  const rel = String(req.path || '').replace(/^\/+/, '');
  if (!rel || rel.includes('..')) return res.status(400).json({ error: 'Bad file path.' });
  const full = path.join(UPLOAD_DIR, rel);
  if (!full.startsWith(UPLOAD_DIR) || !fs.existsSync(full)) return res.status(404).json({ error: 'File not found.' });
  res.sendFile(full);
});

app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `No FieldLink endpoint for ${req.method} ${req.originalUrl}` });
});

// ---- Errors ----------------------------------------------------------------
// Registered at the end of startServer(), after the web client middleware, so it also
// catches problems raised while serving the interface.
function mountErrorHandler() {
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || (err instanceof HttpError ? err.status : 500);
    if (status >= 500) console.error('[fieldlink]', err);
    res.status(status).json({
      error: err.message || 'Something went wrong in FieldLink.',
      detail: err.detail || undefined,
    });
  });
}

// ---- Background sweeps -----------------------------------------------------
// Reminders and due tasks are turned into notifications here. Running on the server
// (not the browser) is what lets a phone that is switched off still receive them later.
setInterval(() => {
  try {
    runReminderSweep();
  } catch (err) {
    console.error('[fieldlink] reminder sweep failed', err.message);
  }
}, 60000).unref?.();

export async function startServer() {
  const DIST = path.join(ROOT, 'web', 'dist');
  const hasBuild = fs.existsSync(path.join(DIST, 'index.html'));
  const wantsDev = !hasBuild && process.env.FIELDLINK_STATIC !== '1';

  if (hasBuild && process.env.FIELDLINK_DEV !== '1') {
    app.use(express.static(DIST));
    app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')));
  } else if (wantsDev) {
    try {
      const { createServer } = await import('vite');
      const vite = await createServer({
        root: path.join(ROOT, 'web'),
        configFile: path.join(ROOT, 'web', 'vite.config.ts'),
        server: { middlewareMode: true, hmr: false, host: true, allowedHosts: true },
        appType: 'custom',
      });
      app.use(vite.middlewares);
      app.use(async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        try {
          const indexHtml = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8');
          const html = await vite.transformIndexHtml(req.originalUrl, indexHtml);
          res.status(200).set('Content-Type', 'text/html').end(html);
        } catch (err) {
          vite.ssrFixStacktrace?.(err);
          next(err);
        }
      });
      console.log('[fieldlink] web workspace served by the Vite dev server (live reload on)');
    } catch (err) {
      console.error('[fieldlink] could not start the dev web server:', err.message);
      app.use((req, res) => {
        res.status(500).send(
          '<h1>FieldLink API is running</h1><p>The web client is not built yet. Run <code>npm run build</code> in the project folder, then reload this page.</p>',
        );
      });
    }
  }

  mountErrorHandler();

  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, HOST, () => {
      console.log(`[fieldlink] FieldLink workspace ready on ${HOST}:${PORT}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  startServer().catch((err) => {
    console.error('[fieldlink] failed to start', err);
    process.exit(1);
  });
}

export { db, run, nowIso, ROOT };
