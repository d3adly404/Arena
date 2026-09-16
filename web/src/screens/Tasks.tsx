/**
 * FieldLink — Tasks and reminders.
 * Anything an officer promised to do lives here: visiting, calling back, chasing documents,
 * or fixing a form for the supervisor. Tasks also appear in the Planner.
 */
import React, { useState } from 'react';
import { useApp } from '../lib/store';
import { useApi, navigate } from '../lib/hooks';
import { Badge, Button, Card, CardHeader, EmptyState, Segmented, Select, SearchInput, cx } from '../components/ui';
import { Icon } from '../components/Icon';
import { post, del } from '../lib/api';
import { dueLabel, relativeTime } from '../lib/format';
import { TaskModal } from './FamilyDetail';

const SCOPES = [
  { value: 'today', label: 'Today', icon: 'sun' },
  { value: 'overdue', label: 'Overdue', icon: 'alert-triangle' },
  { value: 'mine', label: 'Assigned to me', icon: 'user-check' },
  { value: 'all', label: 'Everything', icon: 'list' },
];

export function TasksScreen({ query }: { query: Record<string, string> }) {
  const { user, sync, toast, confirm } = useApp();
  const [scope, setScope] = useState(query.scope || 'today');
  const [status, setStatus] = useState('open');
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(query.new === '1');

  const params = new URLSearchParams();
  if (scope === 'today') params.set('scope', 'today');
  if (scope === 'overdue') params.set('scope', 'overdue');
  if (scope === 'mine') params.set('scope', 'mine');
  params.set('status', status);

  const { data, loading, stale, reload } = useApi<any>(`/api/tasks?${params.toString()}`, {
    cacheKey: `tasks:${params.toString()}`,
    deps: [scope, status, sync.revision],
  });

  const tasks = (data?.tasks || []).filter((task: any) =>
    !search || `${task.title} ${task.family_name || ''} ${task.assignee_name || ''}`.toLowerCase().includes(search.toLowerCase()),
  );
  const counts = data?.counts || {};

  const toggle = async (task: any) => {
    try {
      await post(`/api/tasks/${task.id}/toggle`, {}, { queueLabel: `${task.status === 'done' ? 'Reopen' : 'Complete'} task: ${task.title}` });
      toast(task.status === 'done' ? 'Task reopened.' : 'Task completed.', 'good');
      reload();
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  const remove = async (task: any) => {
    const ok = await confirm({ title: 'Remove this task?', message: task.title, confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try {
      await del(`/api/tasks/${task.id}`);
      toast('Task removed.', 'info');
      reload();
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="card-pad">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Open today</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">{counts.today || 0}</p>
        </Card>
        <Card className="card-pad">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Overdue</p>
          <p className="mt-1 text-2xl font-semibold text-rose-700">{counts.overdue || 0}</p>
        </Card>
        <Card className="card-pad">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Assigned to me</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">{counts.mine || 0}</p>
        </Card>
        <Card className="card-pad">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Completed</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">{counts.done || 0}</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={scope} onChange={setScope} options={SCOPES.map((item) => ({ value: item.value, label: item.label, icon: item.icon as any }))} />
        <SearchInput value={search} onChange={setSearch} placeholder="Search tasks" className="min-w-[180px] flex-1" />
        <Select value={status} onChange={(event) => setStatus(event.target.value)} className="w-auto">
          <option value="open">Open</option>
          <option value="done">Completed</option>
          <option value="all">All</option>
        </Select>
        <Button variant="primary" icon="plus" onClick={() => setNewOpen(true)}>New task</Button>
      </div>

      {stale ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <Icon name="cloud-off" className="h-4 w-4" /> Showing the copy saved on this device.
        </div>
      ) : null}

      <Card>
        {loading && !tasks.length ? <p className="px-4 py-5 text-[13px] text-ink-500">Loading tasks…</p> : null}
        {!loading && !tasks.length ? (
          <EmptyState
            icon="check-circle"
            title={scope === 'overdue' ? 'Nothing overdue' : scope === 'today' ? 'Nothing due today' : 'No tasks here'}
            message="Tasks arrive from follow-up calls, form corrections and events. You can also add one yourself."
            action={<Button variant="primary" icon="plus" onClick={() => setNewOpen(true)}>Add a task</Button>}
          />
        ) : null}
        <ul className="divide-y divide-ink-100">
          {tasks.map((task: any) => {
            const overdue = task.status === 'open' && task.due_at && new Date(task.due_at) < new Date();
            return (
              <li key={task.id} className="flex items-start gap-3 px-4 py-3">
                <button
                  type="button"
                  aria-label={task.status === 'done' ? 'Reopen task' : 'Complete task'}
                  onClick={() => toggle(task)}
                  className={cx(
                    'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border transition',
                    task.status === 'done' ? 'border-brand-700 bg-brand-700 text-white' : 'border-ink-300 hover:border-brand-600',
                  )}
                >
                  {task.status === 'done' ? <Icon name="check" className="h-4 w-4" /> : null}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cx('text-[14px] font-medium text-ink-800', task.status === 'done' && 'line-through decoration-ink-300')}>{task.title}</p>
                  {task.detail ? <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-500">{task.detail}</p> : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
                    <span className={cx('inline-flex items-center gap-1', overdue && 'font-medium text-rose-700')}>
                      <Icon name="alarm-clock" className="h-3.5 w-3.5" />
                      {dueLabel(task.due_at)}
                    </span>
                    {task.family_name ? (
                      <button type="button" onClick={() => navigate(`/families/${task.family_id}`)} className="inline-flex items-center gap-1 hover:underline">
                        <Icon name="users" className="h-3.5 w-3.5" /> {task.family_code} · {task.family_name}
                      </button>
                    ) : null}
                    {task.event_title ? (
                      <button type="button" onClick={() => navigate(`/planner/${task.event_id}`)} className="inline-flex items-center gap-1 hover:underline">
                        <Icon name="calendar" className="h-3.5 w-3.5" /> {task.event_title}
                      </button>
                    ) : null}
                    <span className="inline-flex items-center gap-1">
                      <Icon name="user" className="h-3.5 w-3.5" /> {task.assignee_name || 'Unassigned'}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {task.priority === 'high' ? <Badge tone="warn">High</Badge> : null}
                  {task.source === 'call_follow_up' ? <Badge tone="info" icon="phone">From a call</Badge> : null}
                  {task.source === 'form_review' ? <Badge tone="danger" icon="clipboard-list">Correction</Badge> : null}
                  <button type="button" onClick={() => remove(task)} className="text-[11px] text-ink-400 hover:text-rose-600">Remove</button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <TaskModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onSaved={() => {
          setNewOpen(false);
          toast('Task created. It is in Tasks, the Planner and Notifications.', 'good');
          reload();
        }}
      />
    </div>
  );
}

export function TaskSummaryCard({ title, tasks, onToggle }: { title: string; tasks: any[]; onToggle?: (task: any) => void }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={`${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`} icon="check-square" />
      {tasks.length ? (
        <ul className="divide-y divide-ink-100">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 px-4 py-2.5">
              <button
                type="button"
                onClick={() => onToggle?.(task)}
                className="grid h-5 w-5 place-items-center rounded border border-ink-300"
                aria-label="Complete task"
              >
                {task.status === 'done' ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
              </button>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-700">{task.title}</span>
              <span className="shrink-0 text-[11px] text-ink-400">{task.due_at ? relativeTime(task.due_at) : ''}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-4 text-[13px] text-ink-500">Nothing here.</p>
      )}
    </Card>
  );
}
