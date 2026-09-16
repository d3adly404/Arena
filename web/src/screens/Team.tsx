/**
 * FieldLink — Team.
 * Who is in the organisation, what they do, and how to reach them. Every number here can
 * be called straight from the workspace.
 */
import React, { useState } from 'react';
import { useApp } from '../lib/store';
import { useApi, navigate } from '../lib/hooks';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, SearchInput, Segmented, cx } from '../components/ui';
import { Icon } from '../components/Icon';
import { PhoneLink } from '../components/CallDialog';
import { post } from '../lib/api';
import { relativeTime } from '../lib/format';

const ROLE_LABELS: Record<string, { label: string; tone: string }> = {
  admin: { label: 'Administrator', tone: 'info' },
  supervisor: { label: 'Supervisor', tone: 'brand' },
  officer: { label: 'Field Officer', tone: 'good' },
  volunteer: { label: 'Volunteer', tone: 'warn' },
};

export function TeamScreen() {
  const { user, toast } = useApp();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const { data, loading } = useApi<any>('/api/auth/team', { cacheKey: 'team' });
  const { data: loadData } = useApi<any>(user?.role === 'admin' || user?.role === 'supervisor' ? '/api/workspace/reports/summary' : null, { cacheKey: 'reports' });

  const members = (data?.users || []).filter((member: any) => {
    if (role !== 'all' && member.role !== role) return false;
    if (!search) return true;
    return `${member.name} ${member.email} ${member.site || ''} ${member.job_title || ''}`.toLowerCase().includes(search.toLowerCase());
  });

  const loadFor = (userId: string) => (loadData?.officer_load || []).find((row: any) => row.id === userId);

  const message = async (member: any) => {
    try {
      const result = await post<{ conversation: any }>('/api/messages/conversations', { user_ids: [member.id] }, { queueLabel: `Message ${member.name}` });
      navigate(`/messages/${result.conversation.id}`);
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search the team" className="min-w-[200px] flex-1" />
        <Segmented
          value={role}
          onChange={setRole}
          options={[
            { value: 'all', label: 'Everyone' },
            { value: 'officer', label: 'Officers' },
            { value: 'volunteer', label: 'Volunteers' },
            { value: 'supervisor', label: 'Supervisors' },
          ]}
        />
      </div>

      {loading && !members.length ? <Card className="card-pad text-sm text-ink-500">Loading the team…</Card> : null}
      {!loading && !members.length ? <Card><EmptyState icon="users" title="Nobody matches" message="Try a different name or role." /></Card> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {members.map((member: any) => {
          const meta = ROLE_LABELS[member.role] || { label: member.role, tone: 'neutral' };
          const load = loadFor(member.id);
          return (
            <Card key={member.id} className="p-4">
              <div className="flex items-start gap-3">
                <Avatar name={member.name} size={46} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[15px] font-semibold text-ink-900">{member.name}</p>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-500">
                    {member.job_title || meta.label}
                    {member.site ? ` · ${member.site}` : ''}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-500">
                    {member.last_seen_at ? `Active ${relativeTime(member.last_seen_at)}` : 'Not signed in yet'}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-1.5 text-[13px]">
                <p className="flex items-center gap-2">
                  <Icon name="mail" className="h-4 w-4 text-ink-400" />
                  <a className="truncate text-brand-800 hover:underline" href={`mailto:${member.email}`}>{member.email}</a>
                </p>
                <p className="flex items-center gap-2">
                  <Icon name="phone" className="h-4 w-4 text-ink-400" />
                  <PhoneLink phone={member.phone} familyName={member.name} contactName={member.name} context="This is a colleague in your organisation." />
                </p>
              </div>

              {load ? (
                <div className="mt-3 grid grid-cols-4 gap-1.5 rounded-lg bg-ink-50 p-2 text-center">
                  <Mini label="Families" value={load.families} />
                  <Mini label="Open tasks" value={load.open_tasks} />
                  <Mini label="Photos" value={load.photos} />
                  <Mini label="Forms" value={load.assessments} />
                </div>
              ) : null}

              <div className="mt-3 flex gap-2">
                <Button size="sm" icon="message-circle" onClick={() => message(member)}>Message</Button>
                {member.id === user?.id ? <Badge tone="brand">You</Badge> : null}
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader title="How the team works in FieldLink" icon="info" />
        <div className="grid gap-3 px-4 py-3.5 sm:grid-cols-2">
          {[
            { role: 'Administrator', text: 'Creates accounts, manages imports, sees the activity log and reports.' },
            { role: 'Supervisor', text: 'Reviews submitted assessments, requests corrections, plans events and assigns work.' },
            { role: 'Field Officer', text: 'Visits families, completes assessments, takes required photographs and records calls.' },
            { role: 'Volunteer', text: 'Supports visits for assigned families and can send assessments in for review.' },
          ].map((item) => (
            <div key={item.role} className="rounded-lg border border-ink-200 p-3">
              <p className="text-[13px] font-semibold text-ink-800">{item.role}</p>
              <p className="mt-0.5 text-[12px] text-ink-600">{item.text}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <span className="block text-[15px] font-semibold text-ink-800">{value ?? 0}</span>
      <span className="block text-[10px] uppercase tracking-wide text-ink-400">{label}</span>
    </span>
  );
}
