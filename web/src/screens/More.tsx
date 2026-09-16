/**
 * FieldLink — the mini-app launcher.
 * On a phone the bottom bar keeps only the four things used during a visit; everything
 * else lives here, so the mini-apps are always within reach but never crowd the screen.
 */
import React from 'react';
import { useApp } from '../lib/store';
import { navigate } from '../lib/hooks';
import { NAV_GROUPS, visibleNav } from '../lib/nav';
import { Card, CardHeader } from '../components/ui';
import { Icon } from '../components/Icon';
import { describeDevice } from '../lib/api';

export function MoreScreen() {
  const { user, sync } = useApp();
  const items = visibleNav(user?.role);

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <Card>
        <CardHeader
          title="Everything in the FieldLink workspace"
          subtitle="Tap a mini-app to open it. Nothing here is a separate database — it is all one workspace."
          icon="grid"
        />
        <div className="grid grid-cols-2 gap-3 p-4 xs:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => {
            const badge =
              item.badgeKey === 'notifications' ? Number(sessionStorage.getItem('badge:notifications') || 0)
                : item.badgeKey === 'tasks' ? Number(sessionStorage.getItem('badge:tasks') || 0)
                  : item.badgeKey === 'forms' ? Number(sessionStorage.getItem('badge:forms') || 0)
                    : 0;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => navigate(item.path)}
                className="relative flex flex-col items-start gap-2 rounded-xl border border-ink-200 bg-white p-3.5 text-left shadow-card transition active:scale-[0.98] hover:border-brand-300"
              >
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-50 text-brand-800">
                  <Icon name={item.icon} className="h-[22px] w-[22px]" />
                </span>
                <span className="text-[14px] font-medium text-ink-800">{item.label}</span>
                <span className="text-[11px] leading-snug text-ink-500">{item.description}</span>
                {badge ? <span className="absolute right-3 top-3 rounded-full bg-brand-700 px-1.5 text-[10px] font-semibold text-white">{badge}</span> : null}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Jump to an area" icon="layers" />
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {NAV_GROUPS.filter((group) => group.key !== 'main').map((group) => (
            <div key={group.key} className="rounded-lg border border-ink-200 p-3">
              <p className="section-title mb-2">{group.label}</p>
              <ul className="space-y-1">
                {items.filter((item) => item.group === group.key).map((item) => (
                  <li key={item.key}>
                    <button type="button" onClick={() => navigate(item.path)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink-700 hover:bg-ink-50">
                      <Icon name={item.icon} className="h-4 w-4 text-ink-400" />
                      {item.label}
                      <Icon name="chevron-right" className="ml-auto h-3.5 w-3.5 text-ink-300" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <p className="pb-2 text-center text-[11px] text-ink-400">
        {user?.name} · {describeDevice()} · last checked {sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleTimeString() : 'today'}
      </p>
    </div>
  );
}
