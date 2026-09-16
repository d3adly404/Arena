/**
 * FieldLink — Home.
 * A worker opens FieldLink in the morning and immediately sees today's work: what is due,
 * who to visit, which photographs are still missing, and what their supervisor sent back.
 */
import React, { useState } from 'react';
import { useApp } from '../lib/store';
import { useApi } from '../lib/hooks';
import { navigate } from '../lib/hooks';
import { Badge, Button, Card, CardHeader, EmptyState, Progress, Stat, cx } from '../components/ui';
import { Icon } from '../components/Icon';
import { dayLabel, dueLabel, clockTime, relativeTime, shortDate } from '../lib/format';
import { PhoneLink } from '../components/CallDialog';
import { post } from '../lib/api';

const QUICK_ACTIONS = [
  { label: 'New family', icon: 'user-plus', path: '/families?new=1' },
  { label: 'Start visit', icon: 'map-pin', path: '/families?visit=1' },
  { label: 'Open camera', icon: 'camera', path: '/camera' },
  { label: 'Add task', icon: 'check-square', path: '/tasks?new=1' },
  { label: 'Call contact', icon: 'phone', path: '/families?call=1' },
  { label: 'Send message', icon: 'message-circle', path: '/messages?new=1' },
];

export function HomeScreen() {
  const { user, sync, toast } = useApp();
  const { data, loading, stale } = useApi<any>('/api/workspace/home', { cacheKey: 'home', deps: [sync.revision] });
  const [completing, setCompleting] = useState<string | null>(null);

  const today = new Date();
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  const completeTask = async (taskId: string) => {
    setCompleting(taskId);
    try {
      const result = await post(`/api/tasks/${taskId}/toggle`, {});
      toast(result?.queued ? 'Task completed. It will sync when you have a connection.' : 'Task completed.', result?.queued ? 'warn' : 'good');
    } catch (err: any) {
      toast(err.message || 'The task could not be updated.', 'danger');
    } finally {
      setCompleting(null);
    }
  };

  if (loading && !data) {
    return <div className="p-4 text-sm text-ink-500 sm:p-6">Loading today’s work…</div>;
  }
  if (!data) {
    return <EmptyState icon="cloud-off" title="Nothing loaded yet" message="FieldLink could not reach the workspace. Your saved copy will appear as soon as this device has a connection." />;
  }

  const { today: agenda, attention, counts, notifications, badges } = data;
  const tasksToday = [...(agenda.overdue || []), ...(agenda.tasks || [])];

  return (
    <div className="space-y-4 p-3 sm:p-5">
      {stale ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <Icon name="cloud-off" className="h-4 w-4" />
          Showing the last saved copy. Anything you change now will sync when you have a connection.
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink-900">
            {greeting}, {data.greeting_name}
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-500">
            {dayLabel(today.toISOString())} · {tasksToday.length} {tasksToday.length === 1 ? 'task' : 'tasks'} today ·{' '}
            {(agenda.events || []).length} {agenda.events?.length === 1 ? 'event' : 'events'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon="clipboard-list" onClick={() => navigate('/forms?new=1')}>Start assessment</Button>
          <Button icon="camera" onClick={() => navigate('/camera')}>Open camera</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => navigate(action.path)}
            className="flex items-center gap-2.5 rounded-xl border border-ink-200 bg-white px-3 py-3 text-left shadow-card transition active:scale-[0.98] hover:border-brand-300"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-800">
              <Icon name={action.icon} className="h-[18px] w-[18px]" />
            </span>
            <span className="text-[13px] font-medium leading-tight text-ink-700">{action.label}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Today"
            subtitle="Tasks and events that belong to today"
            icon="alarm-clock"
            action={<Button size="sm" variant="ghost" iconRight="arrow-right" onClick={() => navigate('/tasks')}>All tasks</Button>}
          />
          {(agenda.overdue || []).length ? (
            <div className="border-b border-ink-100 bg-rose-50/60 px-4 py-2.5 text-[12px] font-medium text-rose-800">
              {agenda.overdue.length} {agenda.overdue.length === 1 ? 'task is' : 'tasks are'} overdue
            </div>
          ) : null}
          {tasksToday.length ? (
            <ul className="divide-y divide-ink-100">
              {tasksToday.slice(0, 6).map((task: any) => (
                <li key={task.id} className="flex items-start gap-3 px-4 py-3">
                  <button
                    type="button"
                    aria-label="Complete task"
                    onClick={() => completeTask(task.id)}
                    className={cx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition', completing === task.id ? 'border-brand-700' : 'border-ink-300 hover:border-brand-600')}
                  >
                    {completing === task.id ? <Icon name="check" className="h-3.5 w-3.5 text-brand-700" /> : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    <button type="button" className="text-left text-[14px] font-medium text-ink-800 hover:underline" onClick={() => (task.family_ref || task.family_id ? navigate(`/families/${task.family_ref || task.family_id}`) : navigate('/tasks'))}>
                      {task.title}
                    </button>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-500">
                      <span className={cx(task.due_at && new Date(task.due_at) < new Date() && 'font-medium text-rose-700')}>{dueLabel(task.due_at)}</span>
                      {task.family_code ? <span>· {task.family_code}</span> : null}
                      {task.category ? <span className="capitalize">· {task.category}</span> : null}
                    </p>
                  </div>
                  {task.priority === 'high' ? <Badge tone="warn">High</Badge> : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="check-circle" title="Nothing due today" message="Your tasks for today are clear. Add one from the quick actions above." />
          )}

          {(agenda.events || []).length ? (
            <div className="border-t border-ink-100">
              <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Events today</p>
              <ul className="divide-y divide-ink-100">
                {agenda.events.map((event: any) => (
                  <li key={event.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `${eventTheme(event.type).accent}14`, color: eventTheme(event.type).accent }}>
                      <Icon name={eventTheme(event.type).icon} className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <button type="button" onClick={() => navigate(`/planner/${event.id}`)} className="text-left text-[14px] font-medium text-ink-800 hover:underline">
                        {event.title}
                      </button>
                      <p className="text-[12px] text-ink-500">
                        {clockTime(event.starts_at)} · {event.location || 'No location'} · {eventTheme(event.type).label}
                      </p>
                    </div>
                    <Icon name="chevron-right" className="h-4 w-4 text-ink-400" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Needs your attention" subtitle="The things that block a case" icon="alert-circle" />
            <div className="space-y-3 px-4 py-3.5">
              {attention.corrections.length ? (
                <button type="button" onClick={() => navigate('/forms?scope=mine')} className="w-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-left">
                  <p className="text-[13px] font-semibold text-amber-900">
                    {attention.corrections.length} assessment{attention.corrections.length === 1 ? '' : 's'} returned for correction
                  </p>
                  <p className="mt-0.5 text-[12px] text-amber-800">Your supervisor asked for changes. Open Forms to fix the section and resubmit.</p>
                </button>
              ) : null}

              {attention.media_outstanding.length ? (
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Required photographs missing</p>
                  <ul className="space-y-2">
                    {attention.media_outstanding.slice(0, 4).map((family: any) => (
                      <li key={family.family_id} className="rounded-lg border border-ink-200 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <button type="button" onClick={() => navigate(`/camera?family=${family.family_id}`)} className="text-left text-[13px] font-medium text-ink-800 hover:underline">
                            {family.name}
                          </button>
                          <span className="text-[11px] font-semibold text-ink-500">
                            {family.completed} of {family.required}
                          </span>
                        </div>
                        <Progress value={(family.completed / (family.required || 1)) * 100} className="mt-2" tone={family.percent < 50 ? '#b45309' : '#0f766e'} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {attention.forms.length ? (
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Open assessments</p>
                  <ul className="space-y-1.5">
                    {attention.forms.slice(0, 4).map((form: any) => (
                      <li key={form.id}>
                        <button type="button" onClick={() => navigate(`/forms/${form.id}`)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-ink-50">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-ink-800">{form.family_name}</span>
                            <span className="block text-[11px] text-ink-500">
                              {form.family_code} · {form.progress || 0}% complete · {formStatusLabel(form.status)}
                            </span>
                          </span>
                          <Icon name="chevron-right" className="h-4 w-4 text-ink-400" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {attention.visits_due.length ? (
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Visits overdue</p>
                  <ul className="space-y-1.5">
                    {attention.visits_due.slice(0, 4).map((family: any) => (
                      <li key={family.id} className="flex items-center justify-between gap-2 rounded-lg bg-ink-50 px-2.5 py-2">
                        <button type="button" onClick={() => navigate(`/families/${family.id}`)} className="text-left text-[13px] font-medium text-ink-800 hover:underline">
                          {family.name}
                        </button>
                        <span className="text-[11px] text-ink-500">{family.last_visit_at ? `Last visit ${shortDate(family.last_visit_at)}` : 'Never visited'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {!attention.corrections.length && !attention.media_outstanding.length && !attention.forms.length && !attention.visits_due.length ? (
                <p className="py-3 text-center text-[13px] text-ink-500">Everything is up to date.</p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Today’s calls" subtitle="Recorded from this workspace" icon="phone-call" />
            {(agenda.calls || []).length ? (
              <ul className="divide-y divide-ink-100">
                {agenda.calls.slice(0, 4).map((call: any) => (
                  <li key={call.id} className="px-4 py-3">
                    <p className="text-[13px] font-medium text-ink-800">{call.family_name}</p>
                    <p className="text-[12px] text-ink-500">
                      <PhoneLink phone={call.phone} familyId={call.family_id} familyName={call.family_name} contactName={call.contact_name} showIcon={false} />
                      {' · '}
                      <span className="capitalize">{String(call.status).replace(/_/g, ' ')}</span>
                      {call.officer_name ? ` · ${call.officer_name}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-5 text-[13px] text-ink-500">No calls recorded today.</p>
            )}
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Families" value={counts.families} icon="users" hint={counts.families_all !== counts.families ? `of ${counts.families_all} in the organisation` : 'in the workspace'} />
        <Stat label="People supported" value={counts.people} icon="hand-heart" tone="#3730a3" hint={`${counts.orphans} orphan children`} />
        <Stat label="Photographs" value={counts.media} icon="camera" tone="#b45309" hint="including documents" />
        <Stat label="Documents" value={counts.documents} icon="folder" tone="#3f6212" hint="letters and reports" />
      </div>

      <Card>
        <CardHeader
          title="Recent notifications"
          subtitle={`${badges.notifications} unread`}
          icon="bell"
          action={<Button size="sm" variant="ghost" iconRight="arrow-right" onClick={() => navigate('/notifications')}>See all</Button>}
        />
        {notifications.length ? (
          <ul className="divide-y divide-ink-100">
            {notifications.slice(0, 6).map((notification: any) => (
              <li key={notification.id} className="flex items-start gap-3 px-4 py-3">
                <span className={cx('mt-0.5 h-2 w-2 shrink-0 rounded-full', notification.read_at ? 'bg-ink-300' : 'bg-brand-700')} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink-800">{notification.title}</p>
                  <p className="mt-0.5 text-[12px] text-ink-500">{notification.body}</p>
                </div>
                <button
                  type="button"
                  onClick={() => notification.link && navigate(notification.link)}
                  className="shrink-0 text-[12px] font-medium text-brand-700 hover:underline"
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-5 text-[13px] text-ink-500">No notifications yet.</p>
        )}
      </Card>

      <p className="pb-2 text-center text-[11px] text-ink-400">
        Last checked {sync.lastSyncAt ? relativeTime(sync.lastSyncAt) : 'today'} · amounts are shown in Ghana Cedis
      </p>
    </div>
  );
}

function formStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: 'draft',
    submitted: 'waiting for review',
    under_review: 'under review',
    corrections: 'corrections requested',
    approved: 'approved',
    rejected: 'not approved',
  };
  return labels[status] || status;
}

function eventTheme(type: string) {
  const themes: Record<string, { accent: string; icon: string; label: string }> = {
    field_visit: { accent: '#0f766e', icon: 'map-pin', label: 'Field visit' },
    meeting: { accent: '#334155', icon: 'users', label: 'Meeting' },
    training: { accent: '#92400e', icon: 'graduation-cap', label: 'Training' },
    distribution: { accent: '#3f6212', icon: 'package', label: 'Distribution' },
    ngo_program: { accent: '#3730a3', icon: 'flag', label: 'NGO programme' },
    deadline: { accent: '#9f1239', icon: 'alarm-clock', label: 'Deadline' },
    religious_event: { accent: '#5b21b6', icon: 'moon', label: 'Religious event' },
    celebration: { accent: '#9d174d', icon: 'party-popper', label: 'Celebration' },
    other: { accent: '#475569', icon: 'calendar', label: 'Other' },
  };
  return themes[type] || themes.other;
}
