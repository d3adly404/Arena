/**
 * FieldLink — the workspace shell.
 *
 * On a laptop or tablet the mini-apps sit in a sidebar, the way professional work
 * software behaves. On a phone the bottom bar keeps only the four things used during a
 * visit, and everything else lives behind "More" so the screen never feels crowded.
 */
import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/store';
import { NAV_GROUPS, visibleNav, mobileMore, mobilePrimary } from '../lib/nav';
import { Avatar, Badge, Button, IconButton, cx } from './ui';
import { Icon } from './Icon';
import { navigate } from '../lib/hooks';
import { useMediaQuery } from '../lib/hooks';
import { describeDevice } from '../lib/api';
import { relativeTime } from '../lib/format';

function usePath() {
  const [path, setPath] = useState(() => window.location.hash.replace(/^#/, '') || '/');
  useEffect(() => {
    const handler = () => setPath(window.location.hash.replace(/^#/, '') || '/');
    window.addEventListener('hashchange', handler);
    handler();
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return path;
}

function isActive(itemPath: string, current: string) {
  const base = current.split('?')[0];
  if (itemPath === '/') return base === '/' || base === '';
  return base === itemPath || base.startsWith(`${itemPath}/`);
}

export function SyncPill({ compact = false }: { compact?: boolean }) {
  const { sync, user } = useApp();
  const [open, setOpen] = useState(false);
  const { pendingActions, pendingPhotos, syncing, connected, online, lastSyncAt } = sync;
  const pending = pendingActions.length + pendingPhotos.length;
  const state = !online ? 'offline' : !connected ? 'connecting' : pending ? 'pending' : 'synced';
  const styles: Record<string, string> = {
    synced: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    pending: 'bg-amber-50 text-amber-900 border-amber-200',
    offline: 'bg-ink-100 text-ink-600 border-ink-200',
    connecting: 'bg-sky-50 text-sky-800 border-sky-200',
  };
  const labels: Record<string, string> = {
    synced: 'All changes saved',
    pending: `${pending} waiting to sync`,
    offline: pending ? `Offline · ${pending} waiting` : 'Offline',
    connecting: 'Connecting…',
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition', styles[state])}
        title="Sync status"
      >
        <span className={cx('h-2 w-2 rounded-full', state === 'synced' ? 'bg-emerald-500' : state === 'pending' ? 'bg-amber-500' : state === 'offline' ? 'bg-ink-400' : 'bg-sky-500 animate-pulse')} />
        {syncing && !pending ? 'Syncing…' : labels[state]}
        {!compact && lastSyncAt ? <span className="hidden text-ink-500 sm:inline">· {relativeTime(lastSyncAt)}</span> : null}
      </button>
      {open ? <SyncPanel onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SyncPanel({ onClose }: { onClose: () => void }) {
  const { sync, toast } = useApp();
  const { pendingActions, pendingPhotos, syncNow, syncing, lastSyncAt, storage } = sync;
  const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-ink-900/30" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-raised sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Sync</h2>
            <p className="text-[12px] text-ink-500">{describeDevice()} · last checked {lastSyncAt ? relativeTime(lastSyncAt) : 'not yet'}</p>
          </div>
          <IconButton name="x" label="Close" onClick={onClose} />
        </header>
        <div className="space-y-3 px-4 py-4 text-[13px]">
          <div className="rounded-lg border border-ink-200 p-3">
            <p className="font-medium text-ink-800">One workspace, every device</p>
            <p className="mt-1 text-ink-500">
              Your phone and your laptop sign in to the same workspace. What you save here appears there straight away.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-ink-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-ink-500">Actions waiting</p>
              <p className="text-lg font-semibold">{pendingActions.length}</p>
            </div>
            <div className="rounded-lg bg-ink-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-ink-500">Photos waiting</p>
              <p className="text-lg font-semibold">{pendingPhotos.length}</p>
            </div>
          </div>
          {pendingActions.length ? (
            <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
              {pendingActions.slice(0, 6).map((action) => (
                <li key={action.client_id} className="px-3 py-2">
                  <p className="text-[13px] text-ink-700">{action.label}</p>
                  <p className="text-[11px] text-ink-400">{relativeTime(action.created_at)}{action.error ? ` · ${action.error}` : ''}</p>
                </li>
              ))}
            </ul>
          ) : null}
          {storage.quota ? (
            <p className="text-[12px] text-ink-500">
              On this device FieldLink keeps a saved copy of your work ({mb(storage.usage)} of {mb(storage.quota)} used) so it opens instantly and still works without signal.
            </p>
          ) : null}
        </div>
        <footer className="flex items-center justify-between gap-2 border-t border-ink-100 px-4 py-3">
          <Button
            icon="refresh"
            loading={syncing}
            onClick={async () => {
              await syncNow('manual');
              toast('Workspace checked for changes.', 'info');
            }}
          >
            Sync now
          </Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </footer>
      </div>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-700 text-white shadow-card">
        <Icon name="life-buoy" className="h-5 w-5" />
      </span>
      {!compact ? (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-[0.16em] text-ink-900">FIELDLINK</span>
          <span className="block text-[10px] uppercase tracking-[0.14em] text-ink-400">Field workspace</span>
        </span>
      ) : null}
    </button>
  );
}

export function Layout({ children, title, subtitle, actions, currentName }: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  currentName: string;
}) {
  const { user, sync, signOut, toast } = useApp();
  const path = usePath();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [moreOpen, setMoreOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const items = visibleNav(user?.role);
  const badges: Record<string, number> = {
    messages: sync.revision >= 0 ? Number(sessionStorage.getItem('badge:messages') || 0) : 0,
    notifications: Number(sessionStorage.getItem('badge:notifications') || 0),
    tasks: Number(sessionStorage.getItem('badge:tasks') || 0),
    forms: Number(sessionStorage.getItem('badge:forms') || 0),
  };

  useEffect(() => {
    if (!moreOpen && !quickOpen && !userMenu) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        setQuickOpen(false);
        setUserMenu(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [moreOpen, quickOpen, userMenu]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!searchValue.trim()) return;
    navigate(`/search?q=${encodeURIComponent(searchValue.trim())}`);
    setSearchOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-ink-100">
      {/* ------------------------------------------------- desktop sidebar */}
      {isDesktop ? (
        <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col border-r border-ink-200 bg-ink-50 px-3 py-4 lg:flex">
          <div className="px-2 pb-4">
            <Brand />
          </div>
          <nav className="flex-1 space-y-4 overflow-y-auto pb-4">
            {NAV_GROUPS.map((group) => {
              const groupItems = items.filter((item) => item.group === group.key);
              if (!groupItems.length) return null;
              return (
                <div key={group.key}>
                  {group.label ? <p className="section-title px-3 pb-1.5">{group.label}</p> : null}
                  <div className="space-y-0.5">
                    {groupItems.map((item) => {
                      const active = isActive(item.path, path);
                      const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => navigate(item.path)}
                          className={cx('sidebar-link w-full', active && 'sidebar-link-active')}
                        >
                          <Icon name={item.icon} className="h-[18px] w-[18px]" />
                          <span className="flex-1 text-left">{item.label}</span>
                          {badge ? <span className="rounded-full bg-brand-700 px-1.5 text-[11px] font-semibold text-white">{badge}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
          <div className="rounded-xl border border-ink-200 bg-white p-3">
            <div className="flex items-center gap-2.5">
              <Avatar name={user?.name} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-ink-800">{user?.name}</p>
                <p className="truncate text-[11px] text-ink-500">{user?.job_title || user?.role}</p>
              </div>
              <IconButton name="log-out" label="Sign out" size="sm" onClick={async () => { await signOut(); toast('Signed out.', 'info'); }} />
            </div>
          </div>
        </aside>
      ) : null}

      {/* --------------------------------------------------------- content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
          <div className="flex items-center gap-3 px-3 py-2.5 sm:px-5">
            {!isDesktop ? (
              <div className="flex items-center gap-2">
                <Brand compact />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[17px] font-semibold text-ink-900 sm:text-lg">{title}</h1>
              {subtitle ? <p className="hidden truncate text-[12px] text-ink-500 sm:block">{subtitle}</p> : null}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="hidden sm:block">
                <SyncPill />
              </div>
              <IconButton name="search" label="Search the workspace" onClick={() => setSearchOpen((open) => !open)} />
              <IconButton name="bell" label="Notifications" onClick={() => navigate('/notifications')} className="relative" />
              {!isDesktop ? (
                <button type="button" onClick={() => setUserMenu((open) => !open)} aria-label="Your account" className="ml-0.5">
                  <Avatar name={user?.name} size={32} />
                </button>
              ) : null}
            </div>
          </div>
          {actions ? <div className="scroll-x items-center gap-2 px-3 pb-2.5 sm:px-5">{actions}</div> : null}
          {searchOpen ? (
            <form onSubmit={submitSearch} className="border-t border-ink-100 px-3 py-2.5 sm:px-5">
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  className="input"
                  placeholder="Search families, tasks, documents, events…"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                />
                <Button variant="primary" type="submit">Search</Button>
              </div>
            </form>
          ) : null}
          {!isDesktop ? (
            <div className="px-3 pb-2">
              <SyncPill compact />
            </div>
          ) : null}
        </header>

        <main className="min-w-0 flex-1 pb-28 lg:pb-8">{children}</main>
      </div>

      {/* ------------------------------------------------------ mobile nav */}
      {!isDesktop ? (
        <>
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
            <div className="flex items-stretch justify-between px-1.5 pt-1.5">
              {mobilePrimary(user?.role).map((item) => {
                const active = isActive(item.path, path);
                const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                return (
                  <button key={item.key} type="button" onClick={() => navigate(item.path)} className={cx('nav-item relative flex-1 py-2', active && 'nav-item-active')}>
                    <span className="relative">
                      <Icon name={item.icon} className="h-[22px] w-[22px]" />
                      {badge ? (
                        <span className="absolute -right-2 -top-1.5 rounded-full bg-brand-700 px-1 text-[10px] font-semibold text-white">{badge > 9 ? '9+' : badge}</span>
                      ) : null}
                    </span>
                    {item.label}
                    {active ? <span className="absolute -top-1.5 h-0.5 w-8 rounded-full bg-brand-700" /> : null}
                  </button>
                );
              })}
              <button type="button" onClick={() => setMoreOpen(true)} className={cx('nav-item flex-1 py-2', mobileMore(user?.role).some((item) => isActive(item.path, path)) && 'nav-item-active')}>
                <Icon name="grid" className="h-[22px] w-[22px]" />
                More
              </button>
            </div>
          </div>

          {/* quick actions button — the six things an officer does most */}
          <button
            type="button"
            onClick={() => setQuickOpen(true)}
            className="fixed bottom-24 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-brand-700 text-white shadow-raised transition active:scale-95"
            aria-label="Quick actions"
          >
            <Icon name="plus" className="h-7 w-7" />
          </button>
        </>
      ) : null}

      {/* -------------------------------------------------- more launcher */}
      {moreOpen ? (
        <div className="fixed inset-0 z-40 flex items-end">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setMoreOpen(false)} />
          <div className="animate-in relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-ink-50 px-4 pb-8 pt-4 shadow-raised">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-ink-300" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink-900">All mini-apps</h2>
              <IconButton name="x" label="Close" onClick={() => setMoreOpen(false)} />
            </div>
            <div className="grid grid-cols-2 gap-3 xs:grid-cols-3">
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    navigate(item.path);
                  }}
                  className="flex flex-col items-start gap-2 rounded-xl border border-ink-200 bg-white p-3 text-left shadow-card transition active:scale-[0.98]"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-800">
                    <Icon name={item.icon} className="h-5 w-5" />
                  </span>
                  <span className="text-[14px] font-medium text-ink-800">{item.label}</span>
                  <span className="text-[11px] leading-snug text-ink-500">{item.description}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setMoreOpen(false); navigate('/settings'); }}
                className="flex flex-col items-start gap-2 rounded-xl border border-ink-200 bg-white p-3 text-left shadow-card"
              >
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-ink-100 text-ink-600">
                  <Icon name="settings" className="h-5 w-5" />
                </span>
                <span className="text-[14px] font-medium text-ink-800">Settings</span>
                <span className="text-[11px] leading-snug text-ink-500">Account, devices and sync</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* -------------------------------------------------- quick actions */}
      {quickOpen ? (
        <QuickActions onClose={() => setQuickOpen(false)} />
      ) : null}

      {/* ------------------------------------------------------ user menu */}
      {userMenu && !isDesktop ? (
        <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)}>
          <div className="absolute right-3 top-14 w-[260px] overflow-hidden rounded-xl border border-ink-200 bg-white shadow-raised" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-ink-100 px-3 py-3">
              <Avatar name={user?.name} size={38} />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold">{user?.name}</p>
                <p className="truncate text-[12px] text-ink-500">{user?.email}</p>
              </div>
            </div>
            <div className="p-1.5">
              <button type="button" onClick={() => { setUserMenu(false); navigate('/settings'); }} className="sidebar-link w-full">
                <Icon name="settings" className="h-[18px] w-[18px]" /> Settings
              </button>
              <button type="button" onClick={() => { setUserMenu(false); navigate('/team'); }} className="sidebar-link w-full">
                <Icon name="users" className="h-[18px] w-[18px]" /> Team
              </button>
              {user?.role === 'admin' ? (
                <button type="button" onClick={() => { setUserMenu(false); navigate('/admin'); }} className="sidebar-link w-full">
                  <Icon name="shield" className="h-[18px] w-[18px]" /> Administration
                </button>
              ) : null}
              <button
                type="button"
                onClick={async () => {
                  setUserMenu(false);
                  await signOut();
                  toast('Signed out on this device. Your work stays in the workspace.', 'info');
                }}
                className="sidebar-link w-full text-rose-600 hover:text-rose-700"
              >
                <Icon name="log-out" className="h-[18px] w-[18px]" /> Sign out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function QuickActions({ onClose }: { onClose: () => void }) {
  const { user } = useApp();
  const actions = [
    { label: 'New family', icon: 'user-plus', path: '/families?new=1', tone: '#0f766e' },
    { label: 'Start visit', icon: 'map-pin', path: '/families', tone: '#334155' },
    { label: 'Open camera', icon: 'camera', path: '/camera', tone: '#b45309' },
    { label: 'Add task', icon: 'check-square', path: '/tasks?new=1', tone: '#3730a3' },
    { label: 'Call contact', icon: 'phone', path: '/families?call=1', tone: '#3f6212' },
    { label: 'Send message', icon: 'message-circle', path: '/messages?new=1', tone: '#7c3aed' },
    { label: 'Start assessment', icon: 'clipboard-list', path: '/forms?new=1', tone: '#0f766e' },
    { label: 'Add event', icon: 'calendar', path: '/planner?new=1', tone: '#9f1239' },
  ];
  return (
    <div className="fixed inset-0 z-40 flex items-end">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />
      <div className="animate-in relative w-full rounded-t-2xl bg-white px-4 pb-8 pt-4 shadow-raised">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-ink-300" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Quick actions</h2>
          <IconButton name="x" label="Close" onClick={onClose} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                onClose();
                navigate(action.path);
              }}
              className="flex flex-col items-center gap-2 rounded-xl border border-ink-200 p-3 text-center"
            >
              <span className="grid h-11 w-11 place-items-center rounded-full" style={{ background: `${action.tone}14`, color: action.tone }}>
                <Icon name={action.icon} className="h-5 w-5" />
              </span>
              <span className="text-[12px] font-medium leading-tight text-ink-700">{action.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-center text-[12px] text-ink-400">
          Signed in as {user?.name} · {describeDevice()}
        </p>
      </div>
    </div>
  );
}

export { Badge };
