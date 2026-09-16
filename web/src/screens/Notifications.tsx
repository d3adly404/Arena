/**
 * FieldLink — Notifications.
 * Corrections from a supervisor, tasks that arrived, reminders before an event, and
 * messages from colleagues — everything that needs attention, in one list that the whole
 * team's workspace produces.
 */
import React, { useState } from 'react';
import { useApp } from '../lib/store';
import { useApi, navigate } from '../lib/hooks';
import { Badge, Button, Card, EmptyState, Segmented, cx } from '../components/ui';
import { Icon } from '../components/Icon';
import { post, del } from '../lib/api';
import { relativeTime } from '../lib/format';

const KIND_ICONS: Record<string, { icon: string; tone: string }> = {
  form: { icon: 'clipboard-list', tone: '#0f766e' },
  task: { icon: 'check-square', tone: '#3730a3' },
  message: { icon: 'message-circle', tone: '#7c3aed' },
  comment: { icon: 'message-circle', tone: '#b45309' },
  event: { icon: 'calendar', tone: '#9f1239' },
  reminder: { icon: 'bell', tone: '#0369a1' },
  family: { icon: 'users', tone: '#3f6212' },
  info: { icon: 'info', tone: '#334155' },
};

export function NotificationsScreen() {
  const { sync, toast, confirm } = useApp();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const { data, loading, reload } = useApi<any>('/api/workspace/notifications?limit=120', {
    cacheKey: 'notifications',
    deps: [sync.revision],
  });

  const notifications = (data?.notifications || []).filter((item: any) => filter === 'all' || !item.read_at);

  const markRead = async (notification: any) => {
    if (notification.read_at) return;
    await post(`/api/workspace/notifications/${notification.id}/read`, {});
    reload();
  };

  const open = async (notification: any) => {
    await markRead(notification);
    if (notification.link) navigate(notification.link);
  };

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<'all' | 'unread'>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: `Unread (${data?.unread_total || 0})` },
          ]}
        />
        <div className="ml-auto flex gap-2">
          <Button
            icon="check"
            onClick={async () => {
              await post('/api/workspace/notifications/read-all', {});
              toast('All notifications marked as read.', 'good');
              reload();
            }}
          >
            Mark all as read
          </Button>
          <Button
            icon="trash"
            onClick={async () => {
              const ok = await confirm({ title: 'Clear read notifications?', message: 'Unread notifications stay in your list.', confirmLabel: 'Clear', danger: true });
              if (!ok) return;
              await del('/api/workspace/notifications');
              toast('Read notifications cleared.', 'info');
              reload();
            }}
          >
            Clear read
          </Button>
        </div>
      </div>

      {loading && !notifications.length ? <Card className="card-pad text-sm text-ink-500">Loading notifications…</Card> : null}

      {!loading && !notifications.length ? (
        <Card>
          <EmptyState
            icon="bell"
            title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}
            message="When a supervisor asks for a correction, a task is assigned, or an event reminder is due, it appears here."
          />
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <ul className="divide-y divide-ink-100">
          {notifications.map((notification: any) => {
            const meta = KIND_ICONS[notification.kind] || KIND_ICONS.info;
            return (
              <li key={notification.id} className={cx('flex items-start gap-3 px-4 py-3.5 transition', !notification.read_at && 'bg-brand-50/40')}>
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `${meta.tone}14`, color: meta.tone }}>
                  <Icon name={meta.icon} className="h-[18px] w-[18px]" />
                </span>
                <button type="button" onClick={() => open(notification)} className="min-w-0 flex-1 text-left">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={cx('text-[14px]', notification.read_at ? 'font-medium text-ink-700' : 'font-semibold text-ink-900')}>{notification.title}</span>
                    {!notification.read_at ? <span className="h-2 w-2 rounded-full bg-brand-700" /> : null}
                    <span className="ml-auto text-[11px] text-ink-400">{relativeTime(notification.created_at)}</span>
                  </span>
                  {notification.body ? <span className="mt-0.5 block text-[13px] text-ink-600">{notification.body}</span> : null}
                  {notification.actor_name ? <span className="mt-0.5 block text-[11px] text-ink-400">from {notification.actor_name}</span> : null}
                </button>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {notification.link ? (
                    <Button size="sm" variant="ghost" iconRight="arrow-right" onClick={() => open(notification)}>Open</Button>
                  ) : null}
                  {!notification.read_at ? (
                    <button type="button" onClick={() => markRead(notification)} className="text-[11px] text-ink-400 hover:text-ink-700">
                      Mark read
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <p className="text-center text-[11px] text-ink-400">
        Notifications come from the workspace, so a correction requested on a laptop reaches the officer’s phone.
      </p>
    </div>
  );
}
