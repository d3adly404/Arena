/**
 * FieldLink — one event and its own workspace.
 * A Qurbani distribution, a training day or a field visit is more than a date in a
 * calendar: it has people, tasks, documents, photographs and a conversation of its own.
 */
import React, { useState } from 'react';
import { useApp } from '../lib/store';
import { useApi, navigate } from '../lib/hooks';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, KeyValueList, Modal, Note, Tabs, Thumb, cx } from '../components/ui';
import { Icon } from '../components/Icon';
import { post, patch, del, upload } from '../lib/api';
import { clockTime, dueLabel, longDate, relativeTime, shortDate, fileSize } from '../lib/format';
import { EVENT_TYPES } from '@shared/eventTypes';
import { TaskModal } from './FamilyDetail';

export function EventScreen({ eventId }: { eventId: string }) {
  const { user, sync, toast, confirm } = useApp();
  const { data, loading, error, reload } = useApi<any>(`/api/planner/events/${eventId}`, { cacheKey: `event:${eventId}`, deps: [eventId, sync.revision] });
  const [tab, setTab] = useState('overview');
  const [taskOpen, setTaskOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);

  const event = data?.event;
  const theme = event?.theme || EVENT_TYPES.other;

  if (loading && !event) return <Card className="m-4 card-pad text-sm text-ink-500">Opening the event…</Card>;
  if (error && !event) return <EmptyState icon="alert-triangle" title="Could not open this event" message={error} action={<Button onClick={() => navigate('/planner')}>Back to planner</Button>} />;
  if (!event) return null;

  const discuss = async () => {
    try {
      const result = await post<{ conversation: any }>(`/api/planner/events/${event.id}/discuss`, {});
      toast('Event conversation opened.', 'good');
      navigate(`/messages/${result.conversation.id}`);
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    if (event.family_id) {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append('files', file));
      formData.append('family_id', event.family_id);
      formData.append('event_id', event.id);
      formData.append('category', 'Event');
      formData.append('subcategory', event.title);
      formData.append('source', 'file');
      try {
        await upload('/api/media', formData);
        toast('Photographs added to the event.', 'good');
        reload();
      } catch (err: any) {
        toast(err.message, 'danger');
      }
      return;
    }
    toast('Link this event to a family to store photographs, or add them from the family record.', 'warn');
  };

  const uploadDocuments = async (files: FileList | null) => {
    if (!files?.length) return;
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append('files', file));
    formData.append('event_id', event.id);
    formData.append('category', theme.label);
    try {
      await upload('/api/workspace/documents', formData);
      toast('Documents added to the event.', 'good');
      setDocOpen(false);
      reload();
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  const addReminder = async (offset: number) => {
    try {
      await post(`/api/planner/events/${event.id}/reminders`, { offsets: [offset] });
      toast('Reminder saved. Notifications go to everyone taking part.', 'good');
      setReminderOpen(false);
      reload();
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  return (
    <div className="pb-6">
      <div className="border-b border-ink-200 bg-white" style={{ borderTop: `3px solid ${theme.accent}` }}>
        <div className="px-3 pb-3 pt-3 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide" style={{ background: theme.soft, color: theme.accent }}>
                  <Icon name={theme.icon} className="h-3.5 w-3.5" />
                  {theme.label}
                </span>
                <Badge tone={event.status === 'completed' ? 'good' : 'neutral'}>{event.status}</Badge>
                {event.family_code ? <Badge tone="info">{event.family_code} · {event.family_name}</Badge> : null}
              </div>
              <h2 className="mt-2 text-xl font-semibold text-ink-900">{event.title}</h2>
              <p className="mt-1 text-[13px] text-ink-500">
                {longDate(event.starts_at)} · {clockTime(event.starts_at)}{event.ends_at ? `–${clockTime(event.ends_at)}` : ''}
                {event.location ? ` · ${event.location}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button icon="users" onClick={() => setPeopleOpen(true)}>Participants</Button>
              <Button icon="check-square" onClick={() => setTaskOpen(true)}>Add task</Button>
              <Button icon="bell" onClick={() => setReminderOpen(true)}>Reminder</Button>
              <Button icon="message-circle" onClick={discuss}>Discuss</Button>
              <Button icon="camera" onClick={() => navigate(event.family_id ? `/camera?family=${event.family_id}` : '/camera')}>Photos</Button>
              <Button icon="upload" onClick={() => setDocOpen(true)}>Documents</Button>
              <Button icon="settings" onClick={() => setEditOpen(true)}>Edit</Button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniTile icon="users" label="Taking part" value={`${data.participants?.length || 0}${event.participant_target ? ` of ${event.participant_target}` : ''}`} />
            <MiniTile icon="check-square" label="Open tasks" value={event.open_tasks || 0} />
            <MiniTile icon="file-text" label="Documents" value={event.document_count || 0} />
            <MiniTile icon="camera" label="Photographs" value={event.photo_count || 0} />
          </div>
        </div>

        <div className="px-3 sm:px-5">
          <Tabs
            tabs={(data.tabs || []).map((item: any) => ({ key: item.key, label: item.label }))}
            value={tab}
            onChange={setTab}
          />
        </div>
      </div>

      <div className="space-y-4 p-3 sm:p-5">
        {tab === 'overview' ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Event details" icon={theme.icon} action={<Button size="sm" variant="ghost" icon="settings" onClick={() => setEditOpen(true)}>Edit</Button>} />
              <KeyValueList
                rows={[
                  { label: 'Type', value: theme.label },
                  { label: 'Date', value: longDate(event.starts_at) },
                  { label: 'Time', value: `${clockTime(event.starts_at)}${event.ends_at ? ` – ${clockTime(event.ends_at)}` : ''}` },
                  { label: 'Location', value: event.location },
                  { label: 'Organiser', value: event.lead_name || event.created_by_name },
                  { label: 'Expected participants', value: event.participant_target },
                  { label: 'Linked family', value: event.family_code ? `${event.family_code} — ${event.family_name}` : undefined },
                  { label: 'Created', value: `${shortDate(event.created_at)} by ${event.created_by_name || 'someone'}` },
                ]}
              />
              {event.description ? (
                <div className="border-t border-ink-100 px-4 py-3.5 sm:px-5">
                  <p className="section-title mb-1.5">Plan</p>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-700">{event.description}</p>
                </div>
              ) : null}
              {event.family_id ? (
                <div className="border-t border-ink-100 px-4 py-3.5 sm:px-5">
                  <Button size="sm" iconRight="arrow-right" onClick={() => navigate(`/families/${event.family_id}`)}>Open the family record</Button>
                </div>
              ) : null}
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader title="Reminders" subtitle="Sent as notifications" icon="bell" action={<Button size="sm" variant="ghost" icon="plus" onClick={() => setReminderOpen(true)}>Add</Button>} />
                {(data.reminders || []).length ? (
                  <ul className="divide-y divide-ink-100">
                    {data.reminders.map((reminder: any) => (
                      <li key={reminder.id} className="flex items-center gap-3 px-4 py-2.5">
                        <Icon name="bell" className="h-4 w-4 text-ink-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] text-ink-700">{reminderLabel(reminder.offset_minutes)}</span>
                          <span className="block text-[11px] text-ink-500">
                            {reminder.user_name || 'Organiser'} · {relativeTime(reminder.remind_at)}
                            {reminder.sent_at ? ' · sent' : ''}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="text-[11px] text-ink-400 hover:text-rose-600"
                          onClick={async () => {
                            await del(`/api/planner/reminders/${reminder.id}`);
                            reload();
                          }}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-4 text-[13px] text-ink-500">No reminders yet. Add one so nobody forgets the day.</p>
                )}
              </Card>

              <Card>
                <CardHeader title="Quick facts" icon="info" />
                <div className="space-y-2 px-4 py-3 text-[13px] text-ink-600">
                  <p className="flex items-center gap-2"><Icon name="calendar" className="h-4 w-4 text-ink-400" />{dayCountdown(event.starts_at)}</p>
                  <p className="flex items-center gap-2"><Icon name="trending-up" className="h-4 w-4 text-ink-400" />{event.open_tasks || 0} tasks still open</p>
                  <p className="flex items-center gap-2"><Icon name="message-circle" className="h-4 w-4 text-ink-400" />{data.conversations?.length ? 'Conversation open' : 'No conversation yet'}</p>
                </div>
              </Card>
            </div>
          </div>
        ) : null}

        {tab === 'people' ? (
          <Card>
            <CardHeader
              title="Participants"
              subtitle="Team members and families invited to this event"
              icon="users"
              action={<Button size="sm" icon="user-plus" onClick={() => setPeopleOpen(true)}>Add people</Button>}
            />
            <ul className="divide-y divide-ink-100">
              {(data.participants || []).map((participant: any) => (
                <li key={participant.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={participant.user_name || participant.family_name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-ink-800">{participant.user_name || participant.family_name}</p>
                    <p className="text-[12px] text-ink-500">
                      {participant.user_role ? participant.user_role : 'Family'}
                      {participant.family_code ? ` · ${participant.family_code}` : ''} · {participant.status}
                    </p>
                  </div>
                  {(participant.user_id || participant.family_id) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await del(`/api/planner/events/${event.id}/participants/${participant.id}`);
                        reload();
                      }}
                    >
                      Remove
                    </Button>
                  ) : null}
                </li>
              ))}
              {!(data.participants || []).length ? <EmptyState icon="users" title="Nobody added yet" message="Add the team members and families taking part so they receive reminders." /> : null}
            </ul>
          </Card>
        ) : null}

        {tab === 'tasks' ? (
          <Card>
            <CardHeader title="Tasks for this event" icon="check-square" action={<Button size="sm" icon="plus" onClick={() => setTaskOpen(true)}>Add task</Button>} />
            <ul className="divide-y divide-ink-100">
              {(data.tasks || []).map((task: any) => (
                <li key={task.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={cx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border', task.status === 'done' ? 'border-brand-700 bg-brand-700 text-white' : 'border-ink-300')}>
                    {task.status === 'done' ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-ink-800">{task.title}</p>
                    <p className="text-[12px] text-ink-500">{dueLabel(task.due_at)} · {task.assignee_name || 'unassigned'}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await post(`/api/tasks/${task.id}/toggle`, {});
                      reload();
                    }}
                  >
                    {task.status === 'done' ? 'Reopen' : 'Done'}
                  </Button>
                </li>
              ))}
              {!(data.tasks || []).length ? <EmptyState icon="check-square" title="No tasks yet" message="Break the event into tasks so nothing is left for the last day." action={<Button variant="primary" icon="plus" onClick={() => setTaskOpen(true)}>Add task</Button>} /> : null}
            </ul>
          </Card>
        ) : null}

        {tab === 'documents' ? (
          <Card>
            <CardHeader title="Documents" subtitle="Plans, lists and reports for this event" icon="folder" action={<Button size="sm" icon="upload" onClick={() => setDocOpen(true)}>Add document</Button>} />
            <ul className="divide-y divide-ink-100">
              {(data.documents || []).map((document: any) => (
                <li key={document.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink-100 text-ink-600">
                    <Icon name="file-text" className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ink-800">{document.title}</p>
                    <p className="text-[12px] text-ink-500">{document.category || 'General'} · {fileSize(document.size)} · {relativeTime(document.created_at)}</p>
                  </div>
                  {document.file_path ? (
                    <a className="btn btn-sm" href={`/api/files/${document.file_path}?token=${encodeURIComponent(localStorage.getItem('fieldlink.token') || '')}`} target="_blank" rel="noreferrer">Open</a>
                  ) : null}
                </li>
              ))}
              {!(data.documents || []).length ? <EmptyState icon="folder" title="No documents yet" message="Add the distribution list, the programme or the report." /> : null}
            </ul>
          </Card>
        ) : null}

        {tab === 'photos' ? (
          <Card>
            <CardHeader title="Photographs" subtitle="Event photographs are stored with the family or the event" icon="camera" />
            <div className="px-4 py-3">
              <input
                type="file"
                accept="image/*"
                multiple
                className="block w-full text-[13px] text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-700 file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-white"
                onChange={(event) => uploadPhotos(event.target.files)}
              />
              {!event.family_id ? <p className="mt-2 text-[12px] text-ink-500">Link this event to a family to store photographs against the household record.</p> : null}
            </div>
            {(data.photos || []).length ? (
              <div className="grid grid-cols-3 gap-2 px-4 pb-4 sm:grid-cols-4 lg:grid-cols-6">
                {data.photos.map((photo: any) => (
                  <div key={photo.id}>
                    <Thumb src={photo.url ? `${photo.url}?token=${encodeURIComponent(localStorage.getItem('fieldlink.token') || '')}` : null} alt={photo.subcategory || 'Event photograph'} />
                    <p className="mt-1 truncate text-[11px] text-ink-500">{photo.captured_by_name || 'Officer'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon="camera" title="No photographs yet" message="Photographs taken during the event will appear here." />
            )}
          </Card>
        ) : null}

        {tab === 'messages' ? (
          <Card>
            <CardHeader
              title="Event conversation"
              subtitle="Everyone taking part can send messages, photographs and documents"
              icon="message-circle"
              action={<Button size="sm" variant="primary" icon="send" onClick={discuss}>Open conversation</Button>}
            />
            {(data.conversations || []).length ? (
              <ul className="divide-y divide-ink-100">
                {data.conversations.map((conversation: any) => (
                  <li key={conversation.id} className="flex items-center gap-3 px-4 py-3">
                    <Icon name="message-circle" className="h-5 w-5 text-ink-400" />
                    <span className="min-w-0 flex-1 text-[14px] text-ink-700">{conversation.title || 'Event conversation'}</span>
                    <Button size="sm" variant="ghost" iconRight="arrow-right" onClick={() => navigate(`/messages/${conversation.id}`)}>Open</Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="message-circle" title="No conversation yet" message="Open a conversation to plan the event with your colleagues." action={<Button variant="primary" icon="send" onClick={discuss}>Open conversation</Button>} />
            )}
          </Card>
        ) : null}
      </div>

      <TaskModal open={taskOpen} onClose={() => setTaskOpen(false)} eventId={event.id} familyId={event.family_id || undefined} familyName={event.title} onSaved={() => { setTaskOpen(false); reload(); toast('Task added to the event.', 'good'); }} />

      <Modal
        open={peopleOpen}
        onClose={() => setPeopleOpen(false)}
        title="Add participants"
        subtitle="They receive a notification and any reminders you set."
        size="md"
        footer={<Button variant="ghost" onClick={() => setPeopleOpen(false)}>Close</Button>}
      >
        <AddParticipants eventId={event.id} onDone={() => { reload(); }} />
      </Modal>

      <Modal
        open={reminderOpen}
        onClose={() => setReminderOpen(false)}
        title="Add a reminder"
        subtitle={`Reminders are sent to everyone taking part in ${event.title}.`}
        size="sm"
      >
        <div className="space-y-2">
          {[
            { value: 0, label: 'At event time' },
            { value: 60, label: '1 hour before' },
            { value: 1440, label: '1 day before' },
            { value: 4320, label: '3 days before' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => addReminder(option.value)}
              className="flex w-full items-center justify-between rounded-lg border border-ink-200 px-3.5 py-2.5 text-left text-[14px] hover:border-brand-600 hover:bg-brand-50/40"
            >
              {option.label}
              <Icon name="plus" className="h-4 w-4 text-ink-400" />
            </button>
          ))}
          <ReminderCustom onAdd={(when) => post(`/api/planner/events/${event.id}/reminders`, { offsets: [-1], remind_at: when }).then(() => { setReminderOpen(false); reload(); toast('Reminder saved.', 'good'); })} />
        </div>
      </Modal>

      <Modal
        open={docOpen}
        onClose={() => setDocOpen(false)}
        title="Add documents"
        subtitle="Lists, plans and reports stay with the event."
        size="sm"
      >
        <input
          type="file"
          multiple
          className="block w-full text-[13px] text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-700 file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-white"
          onChange={(event) => uploadDocuments(event.target.files)}
        />
        <p className="mt-2 text-[12px] text-ink-500">PDF, Word, Excel, images and text files up to 25 MB each.</p>
      </Modal>

      <EditEventModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        event={event}
        onSaved={() => { setEditOpen(false); reload(); toast('Event updated. Everyone taking part has been notified.', 'good'); }}
      />
    </div>
  );
}

function MiniTile({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-200 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        <Icon name={icon} className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-1 text-[14px] font-semibold text-ink-800">{value}</p>
    </div>
  );
}

function reminderLabel(offsetMinutes: number) {
  if (offsetMinutes === 0) return 'At event time';
  if (offsetMinutes === 60) return '1 hour before';
  if (offsetMinutes === 1440) return '1 day before';
  if (offsetMinutes === 4320) return '3 days before';
  if (offsetMinutes === -1) return 'Custom time';
  return `${offsetMinutes} minutes before`;
}

function dayCountdown(startsAt: string) {
  const days = Math.round((new Date(startsAt).getTime() - Date.now()) / 86400000);
  if (days === 0) return 'Happening today';
  if (days === 1) return 'Tomorrow';
  if (days > 1) return `In ${days} days`;
  return `Was ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
}

function ReminderCustom({ onAdd }: { onAdd: (iso: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="rounded-lg border border-dashed border-ink-300 p-3">
      <Field label="Custom reminder" hint="Choose the exact date and time.">
        <input type="datetime-local" className="input" value={value} onChange={(event) => setValue(event.target.value)} />
      </Field>
      <Button
        className="mt-2"
        size="sm"
        icon="bell"
        disabled={!value}
        onClick={() => onAdd(new Date(value).toISOString())}
      >
        Add custom reminder
      </Button>
    </div>
  );
}

function AddParticipants({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const { toast } = useApp();
  const { data: team } = useApi<any>('/api/auth/team', { cacheKey: 'team' });
  const { data: familyData } = useApi<any>('/api/families?sort=name', { cacheKey: 'families:list' });
  const [users, setUsers] = useState<string[]>([]);
  const [families, setFamilies] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!users.length && !families.length) {
      toast('Choose at least one person or family.', 'warn');
      return;
    }
    setSaving(true);
    try {
      await post(`/api/planner/events/${eventId}/participants`, { user_ids: users, family_ids: families });
      toast('Participants added.', 'good');
      onDone();
    } catch (err: any) {
      toast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="section-title mb-2">Team members</p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {(team?.users || []).map((member: any) => (
            <label key={member.id} className="flex items-center gap-2.5 rounded-lg border border-ink-200 px-3 py-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={users.includes(member.id)}
                onChange={(event) => setUsers((current) => (event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id)))}
              />
              <span className="text-[13px] text-ink-700">{member.name}</span>
              <span className="ml-auto text-[11px] text-ink-400">{member.role}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="section-title mb-2">Families</p>
        <div className="max-h-52 space-y-1.5 overflow-y-auto">
          {(familyData?.families || []).map((family: any) => (
            <label key={family.id} className="flex items-center gap-2.5 rounded-lg border border-ink-200 px-3 py-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={families.includes(family.id)}
                onChange={(event) => setFamilies((current) => (event.target.checked ? [...current, family.id] : current.filter((id) => id !== family.id)))}
              />
              <span className="text-[13px] text-ink-700">
                <span className="font-mono text-[11px] text-ink-500">{family.code}</span> {family.name}
              </span>
            </label>
          ))}
        </div>
      </div>
      <Button variant="primary" icon="check" loading={saving} onClick={save}>Add participants</Button>
    </div>
  );
}

function EditEventModal({ open, onClose, event, onSaved }: { open: boolean; onClose: () => void; event: any; onSaved: () => void }) {
  const { toast } = useApp();
  const [form, setForm] = useState({
    title: event.title || '',
    type: event.type,
    description: event.description || '',
    location: event.location || '',
    status: event.status || 'planned',
    starts_at: event.starts_at ? new Date(event.starts_at).toISOString().slice(0, 16) : '',
    ends_at: event.ends_at ? new Date(event.ends_at).toISOString().slice(0, 16) : '',
  });
  const set = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    try {
      await patch(`/api/planner/events/${event.id}`, {
        ...form,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      }, { queueLabel: `Update event: ${form.title}` });
      onSaved();
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit event"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="check" onClick={save}>Save changes</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2"><input className="input" value={form.title} onChange={(event) => set('title', event.target.value)} /></Field>
        <Field label="Type">
          <select className="input" value={form.type} onChange={(event) => set('type', event.target.value)}>
            {Object.entries(EVENT_TYPES).map(([key, value]: any) => (
              <option key={key} value={key}>{value.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={form.status} onChange={(event) => set('status', event.target.value)}>
            {['planned', 'confirmed', 'in_progress', 'completed', 'cancelled'].map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </Field>
        <Field label="Starts"><input type="datetime-local" className="input" value={form.starts_at} onChange={(event) => set('starts_at', event.target.value)} /></Field>
        <Field label="Ends"><input type="datetime-local" className="input" value={form.ends_at} onChange={(event) => set('ends_at', event.target.value)} /></Field>
        <Field label="Location" className="sm:col-span-2"><input className="input" value={form.location} onChange={(event) => set('location', event.target.value)} /></Field>
        <Field label="Description" className="sm:col-span-2"><textarea className="input min-h-[100px]" value={form.description} onChange={(event) => set('description', event.target.value)} /></Field>
      </div>
    </Modal>
  );
}
