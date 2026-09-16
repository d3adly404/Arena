/**
 * FieldLink — single database.
 * One SQLite file holds everything: families, forms, media metadata, tasks, planner,
 * messages, documents, notifications and users. Phones and laptops are clients of the
 * same database, which is how "one account, one database, one workspace" stays true.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.FIELDLINK_DATA_DIR || path.join(process.cwd(), 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DB_PATH = process.env.FIELDLINK_DB || path.join(DATA_DIR, 'fieldlink.db');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'officer',
  job_title TEXT,
  site TEXT,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  avatar_tone TEXT DEFAULT '#334155',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  head_name TEXT,
  guardian_name TEXT,
  phone TEXT,
  alternate_phone TEXT,
  region TEXT,
  district TEXT,
  community TEXT,
  address TEXT,
  gps_lat REAL,
  gps_lng REAL,
  status TEXT NOT NULL DEFAULT 'active',
  orphan_count INTEGER DEFAULT 0,
  member_count INTEGER DEFAULT 0,
  monthly_income REAL,
  urgency TEXT DEFAULT 'Medium',
  registered_at TEXT,
  last_visit_at TEXT,
  lead_officer_id TEXT REFERENCES users(id),
  created_by TEXT REFERENCES users(id),
  summary TEXT,
  consent_photo INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS family_members (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relation TEXT,
  gender TEXT,
  dob TEXT,
  age INTEGER,
  is_orphan INTEGER DEFAULT 0,
  orphan_status TEXT,
  school TEXT,
  class_level TEXT,
  health_status TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS family_notes (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id),
  body TEXT NOT NULL,
  kind TEXT DEFAULT 'note',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL DEFAULT 'family_assessment',
  template_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  data TEXT NOT NULL DEFAULT '{}',
  progress INTEGER DEFAULT 0,
  current_section TEXT,
  assigned_to TEXT REFERENCES users(id),
  created_by TEXT REFERENCES users(id),
  reviewer_id TEXT REFERENCES users(id),
  submitted_at TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS form_revisions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  status TEXT NOT NULL,
  data TEXT NOT NULL,
  change_note TEXT,
  author_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS form_comments (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  section_key TEXT,
  author_id TEXT REFERENCES users(id),
  body TEXT NOT NULL,
  kind TEXT DEFAULT 'comment',
  resolved INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  checklist_key TEXT,
  group_key TEXT,
  category TEXT,
  subcategory TEXT,
  child_id TEXT,
  status TEXT NOT NULL DEFAULT 'captured',
  kind TEXT NOT NULL DEFAULT 'photo',
  file_path TEXT,
  mime TEXT,
  size INTEGER,
  note TEXT,
  source TEXT DEFAULT 'camera',
  captured_by TEXT REFERENCES users(id),
  captured_at TEXT NOT NULL,
  gps_lat REAL,
  gps_lng REAL,
  event_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT,
  family_id TEXT REFERENCES families(id) ON DELETE SET NULL,
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  assignee_id TEXT REFERENCES users(id),
  created_by TEXT REFERENCES users(id),
  due_at TEXT,
  remind_at TEXT,
  reminded_at TEXT,
  priority TEXT DEFAULT 'normal',
  category TEXT DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'open',
  completed_at TEXT,
  source TEXT DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  family_id TEXT REFERENCES families(id) ON DELETE CASCADE,
  contact_name TEXT,
  phone TEXT NOT NULL,
  officer_id TEXT REFERENCES users(id),
  status TEXT,
  note TEXT,
  duration_seconds INTEGER,
  follow_up_task_id TEXT,
  called_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other',
  description TEXT,
  status TEXT DEFAULT 'planned',
  location TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  all_day INTEGER DEFAULT 0,
  family_id TEXT REFERENCES families(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id),
  lead_id TEXT REFERENCES users(id),
  participant_target INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS event_participants (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  family_id TEXT REFERENCES families(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'participant',
  status TEXT DEFAULT 'invited',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS event_reminders (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  offset_minutes INTEGER NOT NULL DEFAULT 1440,
  remind_at TEXT NOT NULL,
  sent_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'direct',
  title TEXT,
  family_id TEXT REFERENCES families(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES users(id),
  last_message_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS conversation_members (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT,
  muted INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT REFERENCES users(id),
  body TEXT,
  kind TEXT DEFAULT 'text',
  media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  client_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  family_id TEXT REFERENCES families(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT,
  kind TEXT DEFAULT 'document',
  file_path TEXT,
  mime TEXT,
  size INTEGER,
  notes TEXT,
  visibility TEXT DEFAULT 'internal',
  uploaded_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  kind TEXT DEFAULT 'info',
  entity_type TEXT,
  entity_id TEXT,
  link TEXT,
  actor_id TEXT REFERENCES users(id),
  read_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  filename TEXT,
  row_count INTEGER DEFAULT 0,
  created_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  errors TEXT,
  user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  detail TEXT,
  device TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_mutations (
  client_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  endpoint TEXT,
  status INTEGER,
  response TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_families_updated ON families(updated_at);
CREATE INDEX IF NOT EXISTS idx_forms_family ON forms(family_id);
CREATE INDEX IF NOT EXISTS idx_forms_updated ON forms(updated_at);
CREATE INDEX IF NOT EXISTS idx_media_family ON media(family_id);
CREATE INDEX IF NOT EXISTS idx_media_updated ON media(updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at);
CREATE INDEX IF NOT EXISTS idx_events_starts ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_documents_family ON documents(family_id);
CREATE INDEX IF NOT EXISTS idx_calls_family ON calls(family_id);
`;

db.exec(SCHEMA);

/** Tables that participate in incremental sync, in dependency order. */
export const SYNC_TABLES = [
  'users',
  'families',
  'family_members',
  'family_notes',
  'forms',
  'form_comments',
  'media',
  'tasks',
  'calls',
  'events',
  'event_participants',
  'event_reminders',
  'conversations',
  'messages',
  'documents',
  'notifications',
];

export function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}

export function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}

export function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

export function nowIso() {
  return new Date().toISOString();
}
