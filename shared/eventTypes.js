/**
 * FieldLink — Planner event types.
 * Each event type has its own icon, its own muted visual accent and its own default
 * workspace layout, so a Qurbani distribution looks and behaves differently from a training.
 */

export const EVENT_TYPES = {
  field_visit: {
    label: 'Field Visit',
    icon: 'map-pin',
    accent: '#0f766e',
    soft: '#ecfdf5',
    border: '#99f6e4',
    tabs: ['overview', 'people', 'tasks', 'photos', 'messages'],
    hint: 'A visit to a family or community.',
  },
  meeting: {
    label: 'Meeting',
    icon: 'users',
    accent: '#334155',
    soft: '#f1f5f9',
    border: '#cbd5e1',
    tabs: ['overview', 'people', 'tasks', 'documents', 'messages'],
    hint: 'Internal or partner meeting.',
  },
  training: {
    label: 'Training',
    icon: 'graduation-cap',
    accent: '#92400e',
    soft: '#fffbeb',
    border: '#fcd34d',
    tabs: ['overview', 'people', 'documents', 'tasks', 'photos'],
    hint: 'Staff or volunteer training.',
  },
  distribution: {
    label: 'Distribution',
    icon: 'package',
    accent: '#3f6212',
    soft: '#f7fee7',
    border: '#bef264',
    tabs: ['overview', 'people', 'tasks', 'photos', 'documents'],
    hint: 'Food, cash or material distribution.',
  },
  ngo_program: {
    label: 'NGO Program',
    icon: 'flag',
    accent: '#3730a3',
    soft: '#eef2ff',
    border: '#a5b4fc',
    tabs: ['overview', 'people', 'tasks', 'documents', 'messages', 'photos'],
    hint: 'A programme or major organisational event.',
  },
  deadline: {
    label: 'Deadline',
    icon: 'alarm-clock',
    accent: '#9f1239',
    soft: '#fff1f2',
    border: '#fda4af',
    tabs: ['overview', 'tasks', 'documents', 'messages'],
    hint: 'Reporting or submission deadline.',
  },
  religious_event: {
    label: 'Religious Event',
    icon: 'moon',
    accent: '#5b21b6',
    soft: '#f5f3ff',
    border: '#c4b5fd',
    tabs: ['overview', 'people', 'photos', 'tasks'],
    hint: 'Ramadan, Eid, Qurbani, church or mosque programme.',
  },
  celebration: {
    label: 'Celebration',
    icon: 'party-popper',
    accent: '#9d174d',
    soft: '#fdf2f8',
    border: '#f9a8d4',
    tabs: ['overview', 'people', 'photos', 'messages'],
    hint: 'Graduation, awards, community celebration.',
  },
  other: {
    label: 'Other',
    icon: 'calendar',
    accent: '#475569',
    soft: '#f8fafc',
    border: '#cbd5e1',
    tabs: ['overview', 'people', 'tasks', 'documents', 'messages', 'photos'],
    hint: 'Anything that does not fit the list above.',
  },
};

export const EVENT_TABS = [
  { key: 'overview', label: 'Details' },
  { key: 'people', label: 'Participants' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'documents', label: 'Documents' },
  { key: 'messages', label: 'Messages' },
  { key: 'photos', label: 'Photos' },
];

export function eventType(key) {
  return EVENT_TYPES[key] || EVENT_TYPES.other;
}

export const REMINDER_OPTIONS = [
  { value: 0, label: 'At event time' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
  { value: 4320, label: '3 days before' },
  { value: -1, label: 'Custom…' },
];
