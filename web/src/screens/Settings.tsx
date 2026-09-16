/**
 * FieldLink — Settings.
 * Your account, the devices you are signed in on, and how the workspace keeps working when
 * the connection drops.
 */
import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/store';
import { useApi } from '../lib/hooks';
import { Badge, Button, Card, CardHeader, Field, Note, Segmented, Select, Toggle, cx } from '../components/ui';
import { Icon } from '../components/Icon';
import { describeDevice, patch, post } from '../lib/api';
import { clearDeviceData, storageEstimate } from '../lib/offline';
import { relativeTime } from '../lib/format';

export function SettingsScreen() {
  const { user, sync, toast, confirm, signOut, refreshUser } = useApp();
  const { data: devices, reload: reloadDevices } = useApi<any>('/api/auth/devices', { cacheKey: 'devices' });
  const [tab, setTab] = useState('account');
  const [profile, setProfile] = useState({ name: user?.name || '', phone: user?.phone || '', job_title: user?.job_title || '', site: user?.site || '' });
  const [password, setPassword] = useState({ current_password: '', new_password: '' });
  const [storage, setStorage] = useState({ usage: 0, quota: 0 });
  const [pending, setPending] = useState({ actions: sync.pendingActions.length, photos: sync.pendingPhotos.length });

  useEffect(() => {
    storageEstimate().then(setStorage);
    setPending({ actions: sync.pendingActions.length, photos: sync.pendingPhotos.length });
  }, [sync.pendingActions.length, sync.pendingPhotos.length]);

  const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'account', label: 'Account' },
          { value: 'devices', label: 'Devices' },
          { value: 'sync', label: 'Sync & offline' },
          { value: 'about', label: 'About' },
        ]}
      />

      {tab === 'account' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Your details" subtitle={`Signed in as ${user?.email}`} icon="user" />
            <div className="grid gap-3 px-4 py-3.5">
              <Field label="Full name"><input className="input" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></Field>
              <Field label="Phone number"><input className="input" type="tel" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></Field>
              <Field label="Job title"><input className="input" value={profile.job_title} onChange={(event) => setProfile({ ...profile, job_title: event.target.value })} /></Field>
              <Field label="Site or region"><input className="input" value={profile.site} onChange={(event) => setProfile({ ...profile, site: event.target.value })} /></Field>
              <Button
                variant="primary"
                icon="check"
                onClick={async () => {
                  try {
                    await patch('/api/auth/profile', profile);
                    await refreshUser();
                    toast('Your details were saved.', 'good');
                  } catch (err: any) {
                    toast(err.message || 'Your details could not be saved.', 'danger');
                  }
                }}
              >
                Save details
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Password" subtitle="Changing it signs you out on other devices" icon="lock" />
            <div className="grid gap-3 px-4 py-3.5">
              <Field label="Current password"><input className="input" type="password" value={password.current_password} onChange={(event) => setPassword({ ...password, current_password: event.target.value })} /></Field>
              <Field label="New password" hint="At least 6 characters."><input className="input" type="password" value={password.new_password} onChange={(event) => setPassword({ ...password, new_password: event.target.value })} /></Field>
              <Button
                icon="key"
                onClick={async () => {
                  try {
                    await post('/api/auth/password', password);
                    setPassword({ current_password: '', new_password: '' });
                    toast('Password changed.', 'good');
                  } catch (err: any) {
                    toast(err.message, 'danger');
                  }
                }}
              >
                Change password
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'devices' ? (
        <Card>
          <CardHeader
            title="Devices signed in"
            subtitle="The same account on every device — your work follows you"
            icon="database"
            action={<Button size="sm" variant="ghost" icon="rotate-ccw" onClick={reloadDevices}>Refresh</Button>}
          />
          <ul className="divide-y divide-ink-100">
            {(devices?.devices || []).map((device: any, index: number) => (
              <li key={index} className="flex items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink-100 text-ink-600">
                  <Icon name="database" className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-ink-800">
                    {device.device || 'Unknown device'}
                    {device.current ? <span className="ml-2"><Badge tone="brand">This device</Badge></span> : null}
                  </p>
                  <p className="text-[12px] text-ink-500">
                    signed in {relativeTime(device.created_at)} · last used {relativeTime(device.last_used_at)}
                  </p>
                </div>
              </li>
            ))}
            {!(devices?.devices || []).length ? <p className="px-4 py-4 text-[13px] text-ink-500">No other devices have signed in.</p> : null}
          </ul>
          <div className="border-t border-ink-100 px-4 py-3">
            <Button
              variant="danger"
              icon="log-out"
              onClick={async () => {
                const ok = await confirm({ title: 'Sign out on this device?', message: 'Your work stays in the workspace and is already synced.', confirmLabel: 'Sign out' });
                if (!ok) return;
                await signOut({ keepData: true });
              }}
            >
              Sign out on this device
            </Button>
          </div>
        </Card>
      ) : null}

      {tab === 'sync' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Sync status" subtitle={`${describeDevice()} · the same workspace as every other device`} icon="refresh" />
            <div className="space-y-3 px-4 py-3.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-ink-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-ink-400">Waiting to sync</p>
                  <p className="text-lg font-semibold text-ink-800">{pending.actions} actions · {pending.photos} photos</p>
                </div>
                <div className="rounded-lg bg-ink-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-ink-400">Last check</p>
                  <p className="text-lg font-semibold text-ink-800">{sync.lastSyncAt ? relativeTime(sync.lastSyncAt) : 'not yet'}</p>
                </div>
              </div>
              {sync.pendingActions.length ? (
                <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
                  {sync.pendingActions.slice(0, 8).map((action) => (
                    <li key={action.client_id} className="px-3 py-2">
                      <p className="text-[13px] text-ink-700">{action.label}</p>
                      <p className="text-[11px] text-ink-400">{relativeTime(action.created_at)}{action.error ? ` · ${action.error}` : ''}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <Note tone="good" icon="check-circle">Everything on this device has been sent to the workspace.</Note>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" icon="refresh" loading={sync.syncing} onClick={() => sync.syncNow('manual')}>Sync now</Button>
                <Button
                  icon="trash"
                  onClick={async () => {
                    const ok = await confirm({ title: 'Clear saved data on this device?', message: 'Anything still waiting to sync will be lost. Everything already synced stays in the workspace.', confirmLabel: 'Clear data', danger: true });
                    if (!ok) return;
                    await clearDeviceData();
                    toast('Saved data cleared on this device.', 'info');
                  }}
                >
                  Clear saved data
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Working without a connection" subtitle="How FieldLink behaves in the field" icon="cloud-off" />
            <div className="space-y-3 px-4 py-3.5 text-[13px] text-ink-700">
              <p className="flex items-start gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 text-brand-700" />Screens you have already opened stay readable from the saved copy.</p>
              <p className="flex items-start gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 text-brand-700" />Notes, assessments, call notes and tasks you record are kept on the device and sent when the connection returns.</p>
              <p className="flex items-start gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 text-brand-700" />Photographs taken without signal are stored on the device with their family and category, then uploaded automatically.</p>
              <p className="flex items-start gap-2"><Icon name="alert-triangle" className="mt-0.5 h-4 w-4 text-amber-600" />Keep FieldLink open in the background where possible; closing the browser does not lose saved work.</p>
              <p className="text-[12px] text-ink-500">
                On this device FieldLink is keeping {mb(storage.usage)} of saved data{storage.quota ? ` of a possible ${mb(storage.quota)}` : ''}.
              </p>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'about' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="FieldLink Version 1" subtitle="The digital workplace for humanitarian field work" icon="life-buoy" />
            <div className="space-y-3 px-4 py-3.5 text-[13px] text-ink-700">
              <p>
                FieldLink is a connected workspace made of small, focused mini-apps — Families, Forms, Tasks, Planner,
                Messages, Camera and Media, Documents, Notifications and Administration — over one organisation database.
              </p>
              <p>
                It is not a phone system, not an operating system and not a browser. Calls are handed to your device's own
                dialer, and everything else stays inside the organisation's workspace.
              </p>
              <ul className="space-y-1.5">
                <li className="flex items-center gap-2"><Icon name="check" className="h-4 w-4 text-brand-700" />One account works on phones, tablets and laptops</li>
                <li className="flex items-center gap-2"><Icon name="check" className="h-4 w-4 text-brand-700" />Changes sync between authorised devices</li>
                <li className="flex items-center gap-2"><Icon name="check" className="h-4 w-4 text-brand-700" />Family media is only visible to authorised users</li>
              </ul>
            </div>
          </Card>

          <Card>
            <CardHeader title="Your session" icon="user" />
            <div className="space-y-2 px-4 py-3.5 text-[13px]">
              <p className="flex items-center justify-between"><span className="text-ink-500">Name</span><span className="font-medium">{user?.name}</span></p>
              <p className="flex items-center justify-between"><span className="text-ink-500">Email</span><span className="font-medium">{user?.email}</span></p>
              <p className="flex items-center justify-between"><span className="text-ink-500">Role</span><span className="font-medium capitalize">{user?.role}</span></p>
              <p className="flex items-center justify-between"><span className="text-ink-500">Device</span><span className="font-medium">{describeDevice()}</span></p>
              <div className="pt-2">
                <Button
                  variant="danger"
                  icon="log-out"
                  onClick={async () => {
                    const ok = await confirm({ title: 'Sign out of FieldLink?', message: 'Your work is already in the workspace.', confirmLabel: 'Sign out' });
                    if (!ok) return;
                    await signOut();
                  }}
                >
                  Sign out
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
