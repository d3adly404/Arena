/**
 * FieldLink — Planner and calendar.
 * Today, this week and everything coming. Events carry their own type, their own colour
 * and their own workspace, so a Qurbani distribution or a training day is organised, not
 * just noted on a date.
 */
import React, { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { useApi, navigate } from '../lib/hooks';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Modal, Segmented, Select, Toggle, cx } from '../components/ui';
import { Icon } from '../components/Icon';
import { post, get as apiGet } from '../lib/api';
import { clockTime, dueLabel, longDate, shortDate, dayLabel } from '../lib/format';
import { EVENT_TYPES } from '@shared/eventTypes';

const REMINDERS = [
  { value: 0, label: 'At event time' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
  { value: 4320, label: '3 days before' },
  { value: -1, label: 'Custom…' },
];

const VIEWS = [
  { value: 'today', label: 'Today', icon: 'sun' },
  { value: 'week', label: 'This week', icon: 'calendar-days' },
  { value: 'upcoming', label: 'Upcoming', icon: 'clock' },
  { value: 'month', label: 'Calendar', icon: 'calendar' },
];

export function PlannerScreen({ query }: { query: Record<string, string> }) {
  const { user, sync, toast } = useApp();
  const [view, setView] = useState(query.view || 'week');
  const [type, setType] = useState('all');
  const [scope, setScope] = useState('all');
  const [newOpen, setNewOpen] = useState(query.new === '1');
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const params = new URLSearchParams({ view: view === 'month' ? 'month' : view });
  if (type !== 'all') params.set('type', type);
  if (scope !== 'all') params.set('scope', scope);

  const { data, loading, stale, reload } = useApi<any>(`/api/planner?${params.toString()}`, {
    cacheKey: `planner:${params.toString()}`,
    deps: [view, type, scope, sync.revision],
  });

  const events = data?.events || [];
  const tasks = data?.tasks || [];
  const types = data?.types || EVENT_TYPES;

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const event of events) {
      const key = new Date(event.starts_at).toDateString();
      map.set(key, [...(map.get(key) || []), event]);
    }
    return [...map.entries()].sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());
  }, [events]);

  const monthCells = useMemo(() => buildMonth(monthCursor), [monthCursor]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const event of events) {
      const key = new Date(event.starts_at).toDateString();
      map.set(key, [...(map.get(key) || []), event]);
    }
    return map;
  }, [events]);

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={setView} options={VIEWS.map((item) => ({ value: item.value, label: item.label, icon: item.icon as any }))} />
        <Select value={type} onChange={(event) => setType(event.target.value)} className="w-auto">
          <option value="all">All event types</option>
          {Object.entries(types).map(([key, value]: any) => (
            <option key={key} value={key}>{value.label}</option>
          ))}
        </Select>
        <Select value={scope} onChange={(event) => setScope(event.target.value)} className="w-auto">
          <option value="all">Whole organisation</option>
          <option value="mine">My events</option>
          <option value="participating">I am taking part</option>
        </Select>
        <Button variant="primary" icon="plus" className="ml-auto" onClick={() => setNewOpen(true)}>New event</Button>
      </div>

      {stale ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <Icon name="cloud-off" className="h-4 w-4" /> Showing the saved copy of the calendar.
        </div>
      ) : null}

      {view === 'month' ? (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <Button size="sm" variant="ghost" icon="chevron-left" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}>Previous</Button>
            <p className="text-[14px] font-semibold text-ink-900">
              {monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </p>
            <Button size="sm" variant="ghost" iconRight="chevron-right" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}>Next</Button>
          </div>
          <div className="grid grid-cols-7 border-b border-ink-100 bg-ink-50 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
              <span key={label} className="py-2">{label}</span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthCells.map((cell) => {
              const dayEvents = eventsByDay.get(cell.date.toDateString()) || [];
              const isToday = cell.date.toDateString() === new Date().toDateString();
              return (
                <button
                  key={cell.date.toISOString()}
                  type="button"
                  onClick={() => setSelectedDay(cell.date.toDateString())}
                  className={cx(
                    'min-h-[76px] border-b border-r border-ink-100 p-1.5 text-left align-top transition hover:bg-ink-50',
                    !cell.inMonth && 'bg-ink-50/60 text-ink-400',
                  )}
                >
                  <span className={cx('inline-grid h-6 w-6 place-items-center rounded-full text-[12px] font-medium', isToday && 'bg-brand-700 text-white')}>
                    {cell.date.getDate()}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map((event: any) => (
                      <span
                        key={event.id}
                        className="block truncate rounded px-1 py-0.5 text-[10px] font-medium"
                        style={{ background: event.theme?.soft || '#f1f5f9', color: event.theme?.accent || '#334155' }}
                      >
                        {clockTime(event.starts_at)} {event.title}
                      </span>
                    ))}
                    {dayEvents.length > 2 ? <span className="block px-1 text-[10px] text-ink-500">+{dayEvents.length - 2} more</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      ) : null}

      {view !== 'month' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {loading && !events.length ? <Card className="card-pad text-sm text-ink-500">Loading the planner…</Card> : null}
            {!loading && !grouped.length ? (
              <Card>
                <EmptyState
                  icon="calendar"
                  title="Nothing planned for this period"
                  message="Add a field visit, a meeting or a distribution so the whole team can see it."
                  action={<Button variant="primary" icon="plus" onClick={() => setNewOpen(true)}>New event</Button>}
                />
              </Card>
            ) : null}
            {grouped.map(([dayKey, dayEvents]) => (
              <div key={dayKey} className="space-y-2">
                <p className="px-1 text-[12px] font-semibold uppercase tracking-wide text-ink-500">
                  {dayLabel(new Date(dayKey).toISOString())} · {new Date(dayKey).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}
                </p>
                {dayEvents.map((event: any) => (
                  <EventCard key={event.id} event={event} onOpen={() => navigate(`/planner/${event.id}`)} />
                ))}
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Tasks in this period" subtitle="Deadlines share the same calendar" icon="check-square" action={<Button size="sm" variant="ghost" onClick={() => navigate('/tasks')}>All tasks</Button>} />
              {tasks.length ? (
                <ul className="divide-y divide-ink-100">
                  {tasks.slice(0, 8).map((task: any) => (
                    <li key={task.id} className="px-4 py-2.5">
                      <p className="text-[13px] font-medium text-ink-800">{task.title}</p>
                      <p className="text-[11px] text-ink-500">
                        {dueLabel(task.due_at)} · {task.assignee_name || 'unassigned'}
                        {task.family_code ? ` · ${task.family_code}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-4 text-[13px] text-ink-500">No tasks due in this period.</p>
              )}
            </Card>

            <Card>
              <CardHeader title="Event types" subtitle="Each type has its own workspace" icon="tag" />
              <div className="grid grid-cols-2 gap-2 px-4 py-3">
                {Object.entries(types).map(([key, value]: any) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setType(key)}
                    className={cx('flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px]', type === key ? 'border-ink-300 bg-ink-50' : 'border-ink-200')}
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ background: value.soft, color: value.accent }}>
                      <Icon name={value.icon} className="h-4 w-4" />
                    </span>
                    <span className="truncate font-medium text-ink-700">{value.label}</span>
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {/* day detail from the calendar */}
      <Modal
        open={Boolean(selectedDay)}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? longDate(new Date(selectedDay).toISOString()) : ''}
        subtitle="Everything planned for this day"
        size="md"
        footer={<Button variant="primary" icon="plus" onClick={() => { setSelectedDay(null); setNewOpen(true); }}>Add event on this day</Button>}
      >
        <div className="space-y-2">
          {(eventsByDay.get(selectedDay || '') || []).map((event: any) => (
            <EventCard key={event.id} event={event} onOpen={() => { setSelectedDay(null); navigate(`/planner/${event.id}`); }} compact />
          ))}
          {!(eventsByDay.get(selectedDay || '') || []).length ? <p className="text-[13px] text-ink-500">Nothing planned for this day.</p> : null}
        </div>
      </Modal>

      <NewEventModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        defaultDate={selectedDay ? new Date(selectedDay) : new Date()}
        onCreated={(event) => {
          setNewOpen(false);
          toast(`${event.title} added to the planner. Reminders will be sent to everyone taking part.`, 'good');
          reload();
          navigate(`/planner/${event.id}`);
        }}
      />
    </div>
  );
}

export function EventCard({ event, onOpen, compact = false }: { event: any; onOpen: () => void; compact?: boolean }) {
  const theme = event.theme || EVENT_TYPES[event.type] || EVENT_TYPES.other;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 rounded-xl border border-ink-200 bg-white p-3 text-left shadow-card transition hover:shadow-raised"
      style={{ borderLeftWidth: 4, borderLeftColor: theme.accent }}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: theme.soft, color: theme.accent }}>
        <Icon name={theme.icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold text-ink-900">{event.title}</span>
          <Badge tone="neutral" className="!bg-ink-50" >{theme.label}</Badge>
          {event.status && event.status !== 'planned' ? <Badge tone={event.status === 'completed' ? 'good' : 'neutral'}>{event.status}</Badge> : null}
        </span>
        <span className="mt-0.5 block text-[12px] text-ink-500">
          {dayLabel(event.starts_at)} · {clockTime(event.starts_at)}
          {event.ends_at ? `–${clockTime(event.ends_at)}` : ''}
          {event.location ? ` · ${event.location}` : ''}
        </span>
        {!compact ? (
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
            {event.participant_count ? <span className="inline-flex items-center gap-1"><Icon name="users" className="h-3.5 w-3.5" />{event.participant_count} taking part</span> : null}
            {event.open_tasks ? <span className="inline-flex items-center gap-1"><Icon name="check-square" className="h-3.5 w-3.5" />{event.open_tasks} open tasks</span> : null}
            {event.photo_count ? <span className="inline-flex items-center gap-1"><Icon name="camera" className="h-3.5 w-3.5" />{event.photo_count} photos</span> : null}
            {event.lead_name ? <span className="inline-flex items-center gap-1"><Icon name="user-check" className="h-3.5 w-3.5" />{event.lead_name}</span> : null}
          </span>
        ) : null}
      </span>
      <Icon name="chevron-right" className="mt-1 h-4 w-4 shrink-0 text-ink-400" />
    </button>
  );
}

function buildMonth(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const cells: Array<{ date: Date; inMonth: boolean }> = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    cells.push({ date, inMonth: date.getMonth() === cursor.getMonth() });
  }
  return cells;
}

export function NewEventModal({ open, onClose, onCreated, defaultDate }: {
  open: boolean; onClose: () => void; onCreated: (event: any) => void; defaultDate?: Date;
}) {
  const { user, toast } = useApp();
  const [form, setForm] = useState(() => ({
    title: '',
    type: 'field_visit',
    description: '',
    location: '',
    date: new Date(defaultDate || Date.now()).toISOString().slice(0, 10),
    start: '09:00',
    end: '11:00',
    all_day: false,
    lead_id: user?.id || '',
    participant_target: '',
    family_id: '',
    remind: 1440,
  }));
  const [participants, setParticipants] = useState<string[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const { data: teamData } = useApi<any>(open ? '/api/auth/team' : null, { cacheKey: 'team' });
  const [saving, setSaving] = useState(false);

  const set = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));
  const theme = EVENT_TYPES[form.type] || EVENT_TYPES.other;

  const loadFamilies = async () => {
    if (families.length) return;
    const result = await apiGet<any>('/api/families?sort=name', 'families:list');
    setFamilies(result.families || []);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast('Give the event a title.', 'warn');
      return;
    }
    setSaving(true);
    try {
      const startsAt = form.all_day ? new Date(`${form.date}T00:00:00`).toISOString() : new Date(`${form.date}T${form.start}:00`).toISOString();
      const endsAt = form.all_day ? new Date(`${form.date}T23:59:00`).toISOString() : new Date(`${form.date}T${form.end}:00`).toISOString();
      const result = await post<any>('/api/planner/events', {
        title: form.title,
        type: form.type,
        description: form.description,
        location: form.location,
        starts_at: startsAt,
        ends_at: endsAt,
        all_day: form.all_day,
        family_id: form.family_id || null,
        lead_id: form.lead_id || null,
        participant_target: form.participant_target || null,
        participant_ids: participants,
        reminders: form.remind === -1 ? [] : [{ offset_minutes: form.remind, user_id: user?.id }],
      }, { queueLabel: `Event: ${form.title}` });
      if (result?.queued) {
        toast('Saved on this device. The event will be created when you have a connection.', 'warn');
        onClose();
        return;
      }
      onCreated(result.event);
    } catch (err: any) {
      toast(err.message || 'The event could not be saved.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New event"
      subtitle="Events can carry tasks, documents, messages and photographs of their own."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="check" loading={saving} onClick={save}>Save event</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Event type" className="sm:col-span-2" hint={theme.hint}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(EVENT_TYPES).map(([key, value]: any) => (
              <button
                key={key}
                type="button"
                onClick={() => set('type', key)}
                className={cx('flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px] transition', form.type === key ? 'border-ink-400 bg-ink-50' : 'border-ink-200 hover:border-ink-300')}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ background: value.soft, color: value.accent }}>
                  <Icon name={value.icon} className="h-4 w-4" />
                </span>
                <span className="truncate font-medium text-ink-700">{value.label}</span>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Title" required className="sm:col-span-2">
          <input className="input" value={form.title} onChange={(event) => set('title', event.target.value)} placeholder="For example: Qurbani Distribution 2026" />
        </Field>

        <Field label="Date">
          <input type="date" className="input" value={form.date} onChange={(event) => set('date', event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <input type="time" className="input" value={form.start} onChange={(event) => set('start', event.target.value)} disabled={form.all_day} />
          </Field>
          <Field label="Ends">
            <input type="time" className="input" value={form.end} onChange={(event) => set('end', event.target.value)} disabled={form.all_day} />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Toggle checked={form.all_day} onChange={(next) => set('all_day', next)} label="All day" hint="Use for distributions and celebrations without fixed times." />
        </div>

        <Field label="Location">
          <input className="input" value={form.location} onChange={(event) => set('location', event.target.value)} placeholder="Where will it happen?" />
        </Field>
        <Field label="Reminder">
          <Select value={String(form.remind)} onChange={(event) => set('remind', Number(event.target.value))}>
            {REMINDERS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </Field>

        <Field label="Organiser">
          <Select value={form.lead_id} onChange={(event) => set('lead_id', event.target.value)}>
            {(teamData?.users || []).map((member: any) => (
              <option key={member.id} value={member.id}>{member.name} — {member.role}</option>
            ))}
          </Select>
        </Field>
        <Field label="Expected participants">
          <input className="input" type="number" min="0" value={form.participant_target} onChange={(event) => set('participant_target', event.target.value)} placeholder="For example: 120" />
        </Field>

        <Field label="Linked family" className="sm:col-span-2" hint="Link a family when the event is a visit or support for one household.">
          <Select
            value={form.family_id}
            onChange={(event) => set('family_id', event.target.value)}
            onFocus={loadFamilies}
          >
            <option value="">Not linked to a family</option>
            {families.map((family: any) => (
              <option key={family.id} value={family.id}>{family.code} — {family.name}</option>
            ))}
          </Select>
        </Field>

        <Field label="Who is taking part?" className="sm:col-span-2" hint="They receive a notification and a reminder before the event.">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {(teamData?.users || []).map((member: any) => (
              <label key={member.id} className="flex items-center gap-2.5 rounded-lg border border-ink-200 px-3 py-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={participants.includes(member.id)}
                  onChange={(event) => setParticipants((current) => (event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id)))}
                />
                <span className="text-[13px] text-ink-700">{member.name}</span>
                <span className="ml-auto text-[11px] text-ink-400">{member.role}</span>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Description" className="sm:col-span-2">
          <textarea className="input min-h-[90px]" value={form.description} onChange={(event) => set('description', event.target.value)} placeholder="What is the plan for the day?" />
        </Field>
      </div>
    </Modal>
  );
}
