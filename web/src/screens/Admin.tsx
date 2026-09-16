/**
 * FieldLink — Administration.
 * People, imports and the activity log. Only administrators reach this screen; everything
 * here is about keeping the organisation's single workspace trustworthy.
 */
import React, { useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { useApi } from '../lib/hooks';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Modal, Segmented, Select, SearchInput, Tabs, cx } from '../components/ui';
import { Icon } from '../components/Icon';
import { del, patch, post, upload } from '../lib/api';
import { relativeTime, shortDate, fileSize } from '../lib/format';

const ROLE_OPTIONS = [
  { value: 'officer', label: 'Field Officer' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'admin', label: 'Administrator' },
];

export function AdminScreen() {
  const [tab, setTab] = useState('people');

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <Tabs
        tabs={[
          { key: 'people', label: 'People', icon: 'users' },
          { key: 'import', label: 'Import records', icon: 'upload' },
          { key: 'activity', label: 'Activity log', icon: 'list-checks' },
          { key: 'organisation', label: 'Organisation', icon: 'database' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'people' ? <PeoplePanel /> : null}
      {tab === 'import' ? <ImportPanel /> : null}
      {tab === 'activity' ? <ActivityPanel /> : null}
      {tab === 'organisation' ? <OrganisationPanel /> : null}
    </div>
  );
}

function PeoplePanel() {
  const { user, toast, confirm } = useApp();
  const { data, loading, reload } = useApi<any>('/api/workspace/users', { cacheKey: 'admin:users' });
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [search, setSearch] = useState('');

  const users = (data?.users || []).filter((member: any) =>
    !search || `${member.name} ${member.email} ${member.site || ''}`.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleActive = async (member: any) => {
    const ok = await confirm({
      title: member.active ? `Deactivate ${member.name}?` : `Reactivate ${member.name}?`,
      message: member.active ? 'They will no longer be able to sign in, but all their work stays in the workspace.' : 'They will be able to sign in again.',
      confirmLabel: member.active ? 'Deactivate' : 'Reactivate',
      danger: member.active,
    });
    if (!ok) return;
    try {
      await patch(`/api/workspace/users/${member.id}`, { active: member.active ? 0 : 1 });
      toast(member.active ? 'Account deactivated.' : 'Account reactivated.', 'good');
      reload();
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search people" className="min-w-[200px] flex-1" />
        <Button variant="primary" icon="user-plus" onClick={() => setCreateOpen(true)}>Add a person</Button>
      </div>

      <Card>
        <CardHeader title="FieldLink accounts" subtitle={`${users.length} people · one account each, used on every device`} icon="users" />
        {loading && !users.length ? <p className="px-4 py-5 text-[13px] text-ink-500">Loading accounts…</p> : null}
        <ul className="divide-y divide-ink-100">
          {users.map((member: any) => (
            <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar name={member.name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[14px] font-medium text-ink-800">
                  {member.name}
                  {member.id === user?.id ? <Badge tone="brand">You</Badge> : null}
                  {!member.active ? <Badge tone="danger">Deactivated</Badge> : null}
                </p>
                <p className="text-[12px] text-ink-500">
                  {member.email} · {member.job_title || member.role} · {member.site || 'No site'}
                </p>
                <p className="text-[11px] text-ink-400">
                  {member.last_seen_at ? `last active ${relativeTime(member.last_seen_at)}` : 'never signed in'} · {member.families} families · {member.open_tasks} open tasks
                </p>
              </div>
              <Badge tone={member.role === 'admin' ? 'info' : member.role === 'supervisor' ? 'brand' : 'neutral'}>{member.role}</Badge>
              <div className="flex gap-1.5">
                <Button size="sm" icon="settings" onClick={() => setEditing(member)}>Manage</Button>
                <Button size="sm" variant="ghost" onClick={() => toggleActive(member)}>{member.active ? 'Deactivate' : 'Reactivate'}</Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); reload(); toast('Account created. Share the starting password with them.', 'good'); }} />
      <ManageUserModal
        member={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); reload(); toast('Account updated.', 'good'); }}
      />
    </div>
  );
}

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { toast } = useApp();
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'officer', job_title: '', site: '', password: 'fieldlink' });
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a person to FieldLink"
      subtitle="They sign in with this email address and the starting password."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon="check"
            onClick={async () => {
              try {
                await post('/api/workspace/users', form);
                onCreated();
              } catch (err: any) {
                toast(err.message, 'danger');
              }
            }}
          >
            Create account
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" required><input className="input" value={form.name} onChange={(event) => set('name', event.target.value)} /></Field>
        <Field label="Email address" required><input className="input" type="email" value={form.email} onChange={(event) => set('email', event.target.value)} /></Field>
        <Field label="Phone number"><input className="input" type="tel" value={form.phone} onChange={(event) => set('phone', event.target.value)} /></Field>
        <Field label="Role">
          <Select value={form.role} onChange={(event) => set('role', event.target.value)}>
            {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </Field>
        <Field label="Job title"><input className="input" value={form.job_title} onChange={(event) => set('job_title', event.target.value)} /></Field>
        <Field label="Site or region"><input className="input" value={form.site} onChange={(event) => set('site', event.target.value)} /></Field>
        <Field label="Starting password" hint="At least 6 characters. They can change it in Settings." className="sm:col-span-2">
          <input className="input" value={form.password} onChange={(event) => set('password', event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function ManageUserModal({ member, onClose, onSaved }: { member: any | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [role, setRole] = useState(member?.role || 'officer');
  const [password, setPassword] = useState('');
  const [jobTitle, setJobTitle] = useState(member?.job_title || '');
  const [site, setSite] = useState(member?.site || '');
  const [phone, setPhone] = useState(member?.phone || '');

  React.useEffect(() => {
    if (!member) return;
    setRole(member.role);
    setJobTitle(member.job_title || '');
    setSite(member.site || '');
    setPhone(member.phone || '');
    setPassword('');
  }, [member]);

  if (!member) return null;

  return (
    <Modal
      open={Boolean(member)}
      onClose={onClose}
      title={`Manage ${member.name}`}
      subtitle={member.email}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon="check"
            onClick={async () => {
              try {
                await patch(`/api/workspace/users/${member.id}`, { role, job_title: jobTitle, site, phone, ...(password ? { password } : {}) });
                onSaved();
              } catch (err: any) {
                toast(err.message, 'danger');
              }
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Role" hint="Roles decide what somebody can see and change.">
          <Select value={role} onChange={(event) => setRole(event.target.value)}>
            {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </Field>
        <Field label="Job title"><input className="input" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} /></Field>
        <Field label="Site or region"><input className="input" value={site} onChange={(event) => setSite(event.target.value)} /></Field>
        <Field label="Phone number"><input className="input" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
        <Field label="Reset password" hint="Leave empty to keep the current password. They will be signed out on all devices when it changes.">
          <input className="input" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" />
        </Field>
      </div>
    </Modal>
  );
}

function ImportPanel() {
  const { toast } = useApp();
  const [csv, setCsv] = useState('');
  const [filename, setFilename] = useState('');
  const [result, setResult] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);

  const runImport = async () => {
    if (!csv.trim()) {
      toast('Paste a CSV or choose a file first.', 'warn');
      return;
    }
    setBusy(true);
    try {
      const response = await post<any>('/api/families/import', { csv, filename: filename || 'pasted.csv' });
      setResult(response);
      toast(`${response.created} families imported, ${response.skipped} skipped.`, response.created ? 'good' : 'warn');
    } catch (err: any) {
      toast(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Import families"
          subtitle="Bring an existing list into FieldLink. Duplicates are skipped automatically."
          icon="upload"
          action={
            <a className="btn btn-sm" href="/api/families/import/template" download>
              <Icon name="download" className="h-4 w-4" /> Template
            </a>
          }
        />
        <div className="space-y-3 px-4 py-3.5">
          <Field label="CSV file" hint="Columns: code, name, head_name, guardian_name, phone, region, district, community, orphan_count, member_count, urgency.">
            <input
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-[13px] text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-700 file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-white"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setFilename(file.name);
                setCsv(await file.text());
              }}
            />
          </Field>
          <Field label="Or paste the rows">
            <textarea className="input min-h-[150px] font-mono text-[12px]" value={csv} onChange={(event) => setCsv(event.target.value)} placeholder="name,head_name,guardian_name,phone,region,..." />
          </Field>
          <div className="flex gap-2">
            <Button variant="primary" icon="database" loading={busy} onClick={runImport}>Import families</Button>
            <Button variant="ghost" icon="user-plus" onClick={() => setTeamOpen(true)}>Import team members</Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Last import" subtitle="What FieldLink did with the file" icon="info" />
        {result ? (
          <div className="space-y-3 px-4 py-3.5">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Created" value={result.created} tone="#0f766e" />
              <Stat label="Skipped" value={result.skipped} tone="#b45309" />
              <Stat label="Errors" value={result.errors?.length || 0} tone="#be123c" />
            </div>
            {result.skipped_rows?.length ? (
              <div>
                <p className="section-title mb-1.5">Skipped rows</p>
                <ul className="space-y-1.5">
                  {result.skipped_rows.slice(0, 8).map((row: any, index: number) => (
                    <li key={index} className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                      {row.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.errors?.length ? (
              <div>
                <p className="section-title mb-1.5">Errors</p>
                <ul className="space-y-1.5">
                  {result.errors.slice(0, 8).map((row: any, index: number) => (
                    <li key={index} className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-900">{row.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="px-4 py-4 text-[13px] text-ink-500">
            Imported families appear immediately in Families, and their officers can start assessments straight away.
          </p>
        )}
      </Card>

      <TeamImportModal open={teamOpen} onClose={() => setTeamOpen(false)} />
    </div>
  );
}

function TeamImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useApp();
  const [text, setText] = useState('name, email, role, phone\nSarah Owusu, sarah@example.org, officer, +233 24 000 0000');
  const [result, setResult] = useState<any | null>(null);

  const run = async () => {
    const rows = text
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split(',').map((cell) => cell.trim()));
    const header = rows[0] || [];
    const users = rows.slice(1).map((row) => Object.fromEntries(header.map((key, index) => [key, row[index]])));
    try {
      const response = await post<any>('/api/workspace/users/import', { users });
      setResult(response);
      toast(`${response.created.length} accounts created.`, 'good');
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import team members"
      subtitle="One line per person: name, email, role, phone. Volunteers get a default password they can change."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="primary" icon="database" onClick={run}>Import people</Button>
        </>
      }
    >
      <Field label="People">
        <textarea className="input min-h-[140px] font-mono text-[12px]" value={text} onChange={(event) => setText(event.target.value)} />
      </Field>
      {result ? (
        <div className="mt-3 space-y-2">
          <p className="text-[13px] font-medium text-ink-800">{result.created.length} created, {result.skipped.length} skipped</p>
          <ul className="space-y-1.5">
            {result.created.map((row: any) => (
              <li key={row.id} className="rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
                {row.name} — {row.email} · starting password {row.password}
              </li>
            ))}
            {result.skipped.map((row: any, index: number) => (
              <li key={index} className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{row.email || row.name}: {row.reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Modal>
  );
}

function ActivityPanel() {
  const { data, loading } = useApi<any>('/api/workspace/audit?limit=200', { cacheKey: 'admin:audit' });
  const [search, setSearch] = useState('');

  const entries = (data?.entries || []).filter((entry: any) =>
    !search || `${entry.user_name} ${entry.action} ${entry.detail || ''}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <SearchInput value={search} onChange={setSearch} placeholder="Search the activity log" />
      <Card>
        <CardHeader title="Activity log" subtitle="Who changed what, and from which device" icon="list-checks" />
        {loading && !entries.length ? <p className="px-4 py-5 text-[13px] text-ink-500">Loading the log…</p> : null}
        <ul className="divide-y divide-ink-100">
          {entries.map((entry: any) => (
            <li key={entry.id} className="flex items-start gap-3 px-4 py-2.5">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-ink-100 text-ink-500">
                <Icon name={iconForAction(entry.action)} className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-ink-800">
                  <span className="font-medium">{entry.user_name || 'Someone'}</span> · {entry.action.replace(/[._]/g, ' ')}
                </p>
                {entry.detail ? <p className="text-[12px] text-ink-600">{entry.detail}</p> : null}
                <p className="text-[11px] text-ink-400">
                  {new Date(entry.created_at).toLocaleString()}
                  {entry.device ? ` · ${entry.device}` : ''}
                </p>
              </div>
            </li>
          ))}
          {!loading && !entries.length ? <EmptyState icon="list-checks" title="No activity recorded yet" /> : null}
        </ul>
      </Card>
    </div>
  );
}

function iconForAction(action: string) {
  if (action.startsWith('form')) return 'clipboard-list';
  if (action.startsWith('media')) return 'camera';
  if (action.startsWith('family')) return 'users';
  if (action.startsWith('task')) return 'check-square';
  if (action.startsWith('user') || action.startsWith('auth')) return 'user';
  if (action.startsWith('event') || action.startsWith('planner')) return 'calendar';
  if (action.startsWith('document')) return 'folder';
  if (action.startsWith('sync')) return 'refresh';
  return 'info';
}

function OrganisationPanel() {
  const { data } = useApi<any>('/api/workspace/reports/summary', { cacheKey: 'reports' });
  const { data: home } = useApi<any>('/api/workspace/home', { cacheKey: 'home' });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="The organisation's workspace" subtitle="One database holds everything" icon="database" />
        <div className="grid grid-cols-2 gap-3 px-4 py-3.5 sm:grid-cols-3">
          <Mini label="Families" value={home?.counts?.families_all ?? '—'} />
          <Mini label="People supported" value={home?.counts?.people ?? '—'} />
          <Mini label="Orphan children" value={home?.counts?.orphans ?? '—'} />
          <Mini label="Photographs" value={home?.counts?.media ?? '—'} />
          <Mini label="Documents" value={home?.counts?.documents ?? '—'} />
          <Mini label="Tasks open" value={data?.tasks?.open ?? '—'} />
        </div>
      </Card>

      <Card>
        <CardHeader title="FieldLink Version 1" subtitle="What this workspace does today" icon="life-buoy" />
        <ul className="space-y-2 px-4 py-3.5 text-[13px] text-ink-700">
          {[
            'One account signs in on a phone, tablet and laptop and sees the same workspace.',
            'Family assessments in fourteen sections, saved automatically, with supervisor review and corrections.',
            'A required photography checklist that files every picture with its family and section.',
            'Tasks, reminders and a planner with event types, participants and their own workspaces.',
            'Click-to-call with call outcomes, notes and follow-up tasks.',
            'Messages with attachments, documents, notifications and imports.',
          ].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
              {line}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-ink-200 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className="text-xl font-semibold" style={{ color: tone }}>{value}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-ink-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      <p className="text-lg font-semibold text-ink-800">{value}</p>
    </div>
  );
}
