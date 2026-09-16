/**
 * FieldLink — one family record.
 * Everything about a household in one place: who lives there, the assessments, the
 * required photographs, the calls, the tasks, the documents and the conversation that
 * belongs to this family's work.
 */
import React, { useState } from 'react';
import { useApp } from '../lib/store';
import { useApi, navigate } from '../lib/hooks';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, InfoRow, KeyValueList, Modal, Progress, Tabs, Thumb, cx,
} from '../components/ui';
import { Icon } from '../components/Icon';
import { PhoneLink, CallHistory } from '../components/CallDialog';
import { post, patch, del } from '../lib/api';
import { dueLabel, money, shortDate, dateInput, fileSize, relativeTime } from '../lib/format';
import { FORM_STATUS } from '@shared/formTemplate';

const URGENCY_TONES: Record<string, string> = { Critical: 'danger', High: 'warn', Medium: 'info', Low: 'neutral' };

export function FamilyDetailScreen({ familyId, query }: { familyId: string; query: Record<string, string> }) {
  const { user, sync, toast, confirm } = useApp();
  const { data, loading, error, stale, reload } = useApi<any>(`/api/families/${familyId}`, {
    cacheKey: `family:${familyId}`,
    deps: [familyId, sync.revision],
  });
  const [tab, setTab] = useState(query.tab || 'overview');
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [taskOpen, setTaskOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(true && query.visit === '1');
  const [memberOpen, setMemberOpen] = useState(false);

  const family = data?.family;

  if (loading && !family) return <Card className="m-4 card-pad text-sm text-ink-500">Loading the family record…</Card>;
  if (error && !family) return <EmptyState icon="alert-triangle" title="Could not open this family" message={error} action={<Button onClick={() => navigate('/families')}>Back to families</Button>} />;
  if (!family) return null;

  const mediaProgressData = family.media_progress || { required: 0, completed: 0, percent: 0 };
  const activeForms = (family.forms || []).filter((form: any) => form.status !== 'approved');

  const startAssessment = async () => {
    try {
      const result = await post<{ form: any }>('/api/forms', { family_id: family.id });
      if ((result as any)?.queued) {
        toast('Saved on this device. The assessment will open once you have a connection.', 'warn');
        return;
      }
      toast('Assessment started. Your answers save automatically.', 'good');
      navigate(`/forms/${result.form.id}`);
    } catch (err: any) {
      toast(err.message || 'The assessment could not be started.', 'danger');
    }
  };

  const discuss = async () => {
    try {
      const result = await post<{ conversation: any }>(`/api/messages/for/family/${family.id}`, {});
      navigate(`/messages/${result.conversation.id}`);
    } catch (err: any) {
      toast(err.message || 'The conversation could not be opened.', 'danger');
    }
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    try {
      await post(`/api/families/${family.id}/notes`, { body: noteText }, { queueLabel: `Note on ${family.name}` });
      setNoteText('');
      setNoteOpen(false);
      toast('Note saved on the family record.', 'good');
      reload();
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  const tabs = [
    { key: 'overview', label: 'Overview', icon: 'info' },
    { key: 'members', label: 'People', icon: 'users', badge: (family.members || []).length },
    { key: 'forms', label: 'Forms', icon: 'clipboard-list', badge: (family.forms || []).length },
    { key: 'media', label: 'Photos', icon: 'camera', badge: family.media_progress?.required ? `${family.media_progress.completed}/${family.media_progress.required}` : undefined },
    { key: 'calls', label: 'Calls', icon: 'phone', badge: (family.calls || []).length },
    { key: 'tasks', label: 'Tasks', icon: 'check-square', badge: (family.tasks || []).filter((task: any) => task.status === 'open').length },
    { key: 'notes', label: 'Notes', icon: 'pen-line' },
    { key: 'documents', label: 'Documents', icon: 'folder', badge: (family.documents || []).length },
  ];

  return (
    <div className="pb-4">
      <div className="border-b border-ink-200 bg-white px-3 pb-3 pt-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[12px] font-semibold text-ink-500">{family.code}</span>
              <Badge tone={URGENCY_TONES[family.urgency] || 'neutral'}>{family.urgency || 'Medium'} urgency</Badge>
              <Badge tone={family.status === 'active' ? 'good' : 'neutral'}>{family.status}</Badge>
              {family.consent_photo ? null : <Badge tone="danger" icon="alert-triangle">No photo consent</Badge>}
            </div>
            <h2 className="mt-1 text-xl font-semibold text-ink-900">{family.name}</h2>
            <p className="mt-0.5 text-[13px] text-ink-500">
              {[family.community, family.district, family.region].filter(Boolean).join(', ') || 'Location not recorded'}
              {' · '}
              {family.last_visit_at ? `last visited ${shortDate(family.last_visit_at)}` : 'never visited'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon="clipboard-list" onClick={startAssessment}>Start visit / assessment</Button>
            <Button icon="camera" onClick={() => navigate(`/camera?family=${family.id}`)}>Required photos</Button>
            <Button icon="message-circle" onClick={discuss}>Discuss family</Button>
            <Button icon="check-square" onClick={() => setTaskOpen(true)}>Add task</Button>
            <Button icon="pen-line" onClick={() => setNoteOpen(true)}>Add note</Button>
            <Button icon="settings" onClick={() => setEditOpen(true)}>Edit</Button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <SummaryTile icon="phone" label="Primary phone" value={<PhoneLink phone={family.phone} familyId={family.id} familyName={family.name} familyCode={family.code} contactName={family.guardian_name || family.head_name} />} />
          <SummaryTile icon="users" label="Household" value={`${family.member_count || (family.members || []).length} people · ${family.orphan_count || 0} orphan children`} />
          <SummaryTile icon="wallet" label="Monthly income" value={money(family.monthly_income)} />
          <SummaryTile
            icon="camera"
            label="Required photographs"
            value={
              <span className="flex items-center gap-2">
                <span>{mediaProgressData.completed} of {mediaProgressData.required}</span>
                <Progress value={mediaProgressData.percent} className="w-16" />
              </span>
            }
          />
        </div>
      </div>

      {stale ? (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 sm:mx-5">
          <Icon name="cloud-off" className="h-4 w-4" /> Showing the copy saved on this device.
        </div>
      ) : null}

      <div className="px-3 pt-3 sm:px-5">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>

      <div className="space-y-4 p-3 sm:p-5">
        {tab === 'overview' ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Family information" icon="users" action={<Button size="sm" variant="ghost" icon="pen-line" onClick={() => setEditOpen(true)}>Edit</Button>} />
              <KeyValueList
                rows={[
                  { label: 'Head of household', value: family.head_name },
                  { label: 'Guardian / caregiver', value: family.guardian_name },
                  { label: 'Alternate phone', value: family.alternate_phone ? <PhoneLink phone={family.alternate_phone} familyId={family.id} familyName={family.name} contactName="Alternate contact" /> : undefined },
                  { label: 'Nearest landmark', value: family.address },
                  { label: 'Registered', value: family.registered_at ? shortDate(family.registered_at) : undefined },
                  { label: 'Field officer', value: family.officer?.name },
                  { label: 'GPS', value: family.gps_lat ? `${family.gps_lat.toFixed(4)}, ${family.gps_lng?.toFixed(4)}` : undefined },
                  { label: 'Photo consent', value: family.consent_photo ? 'Agreed' : 'Not agreed' },
                ]}
              />
              {family.summary ? (
                <div className="border-t border-ink-100 px-4 py-3.5 sm:px-5">
                  <p className="section-title mb-1.5">Summary</p>
                  <p className="text-[13px] leading-relaxed text-ink-700">{family.summary}</p>
                </div>
              ) : null}
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader title="Visit readiness" subtitle="What a complete visit needs" icon="check-square" />
                <div className="space-y-2.5 px-4 py-3.5">
                  <ReadinessRow done={Boolean(family.forms?.length)} label="Assessment started" hint={`${family.forms?.length || 0} form(s) on record`} />
                  <ReadinessRow done={mediaProgressData.required === 0 || mediaProgressData.completed >= mediaProgressData.required} label="Required photographs taken" hint={`${mediaProgressData.completed} of ${mediaProgressData.required}`} />
                  <ReadinessRow done={(family.calls || []).length > 0} label="Contact number verified by a call" hint={`${family.calls?.length || 0} calls recorded`} />
                  <ReadinessRow done={(family.documents || []).length > 0} label="Supporting document attached" hint={`${family.documents?.length || 0} documents`} />
                </div>
              </Card>

              {activeForms.length ? (
                <Card>
                  <CardHeader title="Open assessment" icon="clipboard-list" />
                  <div className="px-4 py-3.5">
                    <p className="text-[14px] font-medium text-ink-800">{FORM_STATUS[activeForms[0].status]?.label || activeForms[0].status}</p>
                    <p className="mt-0.5 text-[12px] text-ink-500">
                      {activeForms[0].progress || 0}% complete · saved {relativeTime(activeForms[0].updated_at)}
                    </p>
                    {activeForms[0].status === 'corrections' ? (
                      <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[12px] text-amber-900">
                        Your supervisor asked for corrections. Open the form to see the notes.
                      </p>
                    ) : null}
                    <Button className="mt-3 w-full" variant="primary" iconRight="arrow-right" onClick={() => navigate(`/forms/${activeForms[0].id}`)}>
                      Continue assessment
                    </Button>
                  </div>
                </Card>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === 'members' ? (
          <Card>
            <CardHeader
              title="People in this household"
              subtitle="Orphan children need their documents photographed in the Field Camera."
              icon="users"
              action={<Button size="sm" icon="user-plus" onClick={() => setMemberOpen(true)}>Add person</Button>}
            />
            <ul className="divide-y divide-ink-100">
              {(family.members || []).map((member: any) => (
                <li key={member.id} className="flex items-start gap-3 px-4 py-3">
                  <Avatar name={member.name} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium text-ink-800">{member.name}</span>
                      {member.is_orphan ? <Badge tone="info">Orphan child</Badge> : null}
                      {member.age ? <span className="text-[12px] text-ink-500">{member.age} years</span> : null}
                    </div>
                    <p className="mt-0.5 text-[12px] text-ink-500">
                      {[member.relation, member.gender, member.school, member.class_level, member.health_status].filter(Boolean).join(' · ')}
                    </p>
                    {member.notes ? <p className="mt-1 text-[12px] text-ink-600">{member.notes}</p> : null}
                    {member.is_orphan ? (
                      <Button size="sm" variant="ghost" className="mt-1.5" icon="camera" onClick={() => navigate(`/camera?family=${family.id}`)}>
                        Child documents checklist
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
              {!(family.members || []).length ? <EmptyState icon="users" title="No people recorded yet" message="Add household members, or capture the children in the assessment form." action={<Button variant="primary" icon="user-plus" onClick={() => setMemberOpen(true)}>Add person</Button>} /> : null}
            </ul>
          </Card>
        ) : null}

        {tab === 'forms' ? (
          <Card>
            <CardHeader
              title="Assessments for this family"
              subtitle="Drafts save as you work. Submitted assessments go to a supervisor."
              icon="clipboard-list"
              action={<Button size="sm" variant="primary" icon="plus" onClick={startAssessment}>New assessment</Button>}
            />
            <ul className="divide-y divide-ink-100">
              {(family.forms || []).map((form: any) => (
                <li key={form.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-600">
                    <Icon name="clipboard-list" className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium text-ink-800">Family Assessment</span>
                      <Badge tone={FORM_STATUS[form.status]?.tone || 'neutral'}>{FORM_STATUS[form.status]?.label || form.status}</Badge>
                    </div>
                    <p className="mt-0.5 text-[12px] text-ink-500">
                      {form.progress || 0}% complete · updated {relativeTime(form.updated_at)}
                      {form.created_by_name ? ` · started by ${form.created_by_name}` : ''}
                      {form.submitted_at ? ` · submitted ${shortDate(form.submitted_at)}` : ''}
                    </p>
                    {form.status === 'corrections' && form.review_note ? (
                      <p className="mt-1 rounded-md bg-amber-50 px-2 py-1.5 text-[12px] text-amber-900">{form.review_note}</p>
                    ) : null}
                    <Progress className="mt-2 max-w-[220px]" value={form.progress || 0} />
                  </div>
                  <Button size="sm" iconRight="arrow-right" onClick={() => navigate(`/forms/${form.id}`)}>
                    {form.status === 'draft' || form.status === 'corrections' ? 'Continue' : 'Open'}
                  </Button>
                </li>
              ))}
              {!(family.forms || []).length ? (
                <EmptyState icon="clipboard-list" title="No assessment yet" message="Start the family assessment during your visit. It is saved automatically as you go." action={<Button variant="primary" icon="plus" onClick={startAssessment}>Start assessment</Button>} />
              ) : null}
            </ul>
          </Card>
        ) : null}

        {tab === 'media' ? (
          <Card>
            <CardHeader
              title="Photographs and documents"
              subtitle={`${mediaProgressData.completed} of ${mediaProgressData.required} required items completed`}
              icon="camera"
              action={<Button size="sm" variant="primary" icon="camera" onClick={() => navigate(`/camera?family=${family.id}`)}>Open checklist</Button>}
            />
            <div className="px-4 py-3">
              <Progress value={mediaProgressData.percent} showLabel />
            </div>
            <div className="grid grid-cols-3 gap-2 px-4 pb-4 sm:grid-cols-4 lg:grid-cols-6">
              {(family.media || []).filter((item: any) => item.status !== 'not_available').map((item: any) => (
                <div key={item.id}>
                  <Thumb
                    src={item.file_path ? `/api/files/${item.file_path}?token=${encodeURIComponent(localStorage.getItem('fieldlink.token') || '')}` : null}
                    alt={item.subcategory || item.category}
                    onClick={() => navigate(`/media?view=family&family=${family.id}`)}
                  />
                  <p className="mt-1 truncate text-[11px] text-ink-500">{item.subcategory || item.category}</p>
                </div>
              ))}
            </div>
            {(family.media || []).some((item: any) => item.status === 'not_available') ? (
              <div className="border-t border-ink-100 px-4 py-3">
                <p className="section-title mb-2">Marked not available</p>
                <ul className="space-y-1.5">
                  {(family.media || []).filter((item: any) => item.status === 'not_available').map((item: any) => (
                    <li key={item.id} className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                      <span className="font-medium">{item.subcategory || item.category}</span>
                      {item.note ? ` — ${item.note}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!(family.media || []).length ? <EmptyState icon="camera" title="No photographs yet" message="Open the checklist before or during the visit so nothing is forgotten." /> : null}
          </Card>
        ) : null}

        {tab === 'calls' ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Call history" subtitle="Date, officer, number, outcome and note" icon="phone-call" />
              <CallHistory calls={family.calls || []} />
            </Card>
            <Card>
              <CardHeader title="Call the family" icon="phone" />
              <div className="space-y-3 px-4 py-3.5">
                <div>
                  <p className="text-[13px] font-medium text-ink-800">{family.guardian_name || family.head_name || 'Guardian'}</p>
                  <PhoneLink phone={family.phone} familyId={family.id} familyName={family.name} familyCode={family.code} contactName={family.guardian_name || family.head_name} />
                </div>
                {family.alternate_phone ? (
                  <div>
                    <p className="text-[13px] font-medium text-ink-800">Alternate number</p>
                    <PhoneLink phone={family.alternate_phone} familyId={family.id} familyName={family.name} familyCode={family.code} contactName="Alternate contact" />
                  </div>
                ) : null}
                <p className="rounded-lg bg-ink-50 px-3 py-2 text-[12px] text-ink-600">
                  FieldLink opens the normal dialer on your device. When you return, record what happened — answered, no answer,
                  number unavailable, wrong number or call again later — and add a note.
                </p>
              </div>
            </Card>
          </div>
        ) : null}

        {tab === 'tasks' ? (
          <Card>
            <CardHeader title="Tasks for this family" icon="check-square" action={<Button size="sm" icon="plus" onClick={() => setTaskOpen(true)}>Add task</Button>} />
            <ul className="divide-y divide-ink-100">
              {(family.tasks || []).map((task: any) => (
                <li key={task.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={cx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border', task.status === 'done' ? 'border-brand-700 bg-brand-700 text-white' : 'border-ink-300')}>
                    {task.status === 'done' ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cx('text-[14px] font-medium text-ink-800', task.status === 'done' && 'line-through decoration-ink-300')}>{task.title}</p>
                    <p className="mt-0.5 text-[12px] text-ink-500">
                      {dueLabel(task.due_at)} · {task.assignee_name || 'unassigned'} · {task.source === 'call_follow_up' ? 'from a call' : task.source}
                    </p>
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
              {!(family.tasks || []).length ? <EmptyState icon="check-square" title="No tasks yet" message="Create follow-up tasks so the next officer knows what to do." action={<Button variant="primary" icon="plus" onClick={() => setTaskOpen(true)}>Add task</Button>} /> : null}
            </ul>
          </Card>
        ) : null}

        {tab === 'notes' ? (
          <Card>
            <CardHeader title="Visit notes" icon="pen-line" action={<Button size="sm" icon="plus" onClick={() => setNoteOpen(true)}>Add note</Button>} />
            <ul className="divide-y divide-ink-100">
              {(family.notes || []).map((note: any) => (
                <li key={note.id} className="flex items-start gap-3 px-4 py-3">
                  <Avatar name={note.author_name} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink-800">{note.author_name || 'Officer'}</p>
                    <p className="text-[11px] text-ink-400">{new Date(note.created_at).toLocaleString()}</p>
                    <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-ink-700">{note.body}</p>
                  </div>
                </li>
              ))}
              {!(family.notes || []).length ? <EmptyState icon="pen-line" title="No notes yet" message="Notes stay with the family record so the whole team benefits." /> : null}
            </ul>
          </Card>
        ) : null}

        {tab === 'documents' ? (
          <Card>
            <CardHeader
              title="Documents"
              subtitle="Letters, certificates and reports connected to this family"
              icon="folder"
              action={<Button size="sm" icon="upload" onClick={() => navigate(`/documents?family=${family.id}`)}>Add document</Button>}
            />
            <ul className="divide-y divide-ink-100">
              {(family.documents || []).map((document: any) => (
                <li key={document.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink-100 text-ink-600">
                    <Icon name="file-text" className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ink-800">{document.title}</p>
                    <p className="text-[12px] text-ink-500">
                      {document.category || 'General'} · {fileSize(document.size)} · uploaded {relativeTime(document.created_at)}
                    </p>
                  </div>
                  {document.file_path ? (
                    <a className="btn btn-sm" href={`/api/files/${document.file_path}?token=${encodeURIComponent(localStorage.getItem('fieldlink.token') || '')}`} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : null}
                </li>
              ))}
              {!(family.documents || []).length ? <EmptyState icon="folder" title="No documents yet" message="Attach birth certificates, medical letters or school records." /> : null}
            </ul>
          </Card>
        ) : null}
      </div>

      {/* modals */}
      <Modal
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title="Add a visit note"
        subtitle={`${family.name} · ${family.code}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNoteOpen(false)}>Cancel</Button>
            <Button variant="primary" icon="check" onClick={addNote}>Save note</Button>
          </>
        }
      >
        <Field label="Note">
          <textarea className="input min-h-[120px]" value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="What did you observe during the visit?" />
        </Field>
      </Modal>

      <TaskModal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        familyId={family.id}
        familyName={family.name}
        onSaved={() => {
          setTaskOpen(false);
          reload();
          toast('Task created and added to the planner.', 'good');
        }}
      />

      <MemberModal
        open={memberOpen}
        onClose={() => setMemberOpen(false)}
        familyId={family.id}
        onSaved={() => {
          setMemberOpen(false);
          reload();
          toast('Household member added.', 'good');
        }}
      />

      <EditFamilyModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        family={family}
        onSaved={() => {
          setEditOpen(false);
          reload();
          toast('Family record updated.', 'good');
        }}
      />
    </div>
  );
}

function SummaryTile({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        <Icon name={icon} className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-1 text-[13px] font-medium text-ink-800">{value}</p>
    </div>
  );
}

function ReadinessRow({ done, label, hint }: { done: boolean; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={cx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full', done ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-400')}>
        <Icon name={done ? 'check' : 'minus'} className="h-3.5 w-3.5" />
      </span>
      <span>
        <span className="block text-[13px] font-medium text-ink-800">{label}</span>
        {hint ? <span className="block text-[12px] text-ink-500">{hint}</span> : null}
      </span>
    </div>
  );
}

export function TaskModal({ open, onClose, familyId, familyName, eventId, onSaved }: {
  open: boolean; onClose: () => void; familyId?: string; familyName?: string; eventId?: string; onSaved: () => void;
}) {
  const { toast } = useApp();
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [due, setDue] = useState(dateInput(new Date(Date.now() + 86400000).toISOString()));
  const [priority, setPriority] = useState('normal');
  const [category, setCategory] = useState('general');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) {
      toast('Give the task a short title.', 'warn');
      return;
    }
    setSaving(true);
    try {
      await post('/api/tasks', {
        title,
        detail,
        family_id: familyId || null,
        event_id: eventId || null,
        due_at: due ? new Date(`${due}T09:00:00`).toISOString() : null,
        priority,
        category,
      }, { queueLabel: `Task: ${title}` });
      setTitle('');
      setDetail('');
      onSaved();
    } catch (err: any) {
      toast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a task"
      subtitle={familyName ? `For ${familyName}` : 'The task appears in Tasks, the Planner and Notifications.'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="check" loading={saving} onClick={save}>Create task</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Task" required>
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="For example: Call Hawawu again tomorrow" />
        </Field>
        <Field label="Details">
          <textarea className="input min-h-[80px]" value={detail} onChange={(event) => setDetail(event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date">
            <input type="date" className="input" value={due} onChange={(event) => setDue(event.target.value)} />
          </Field>
          <Field label="Priority">
            <select className="input" value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </Field>
        </div>
        <Field label="Type">
          <select className="input" value={category} onChange={(event) => setCategory(event.target.value)}>
            {['general', 'call', 'visit', 'documents', 'media', 'distribution', 'reporting', 'form_review', 'finance'].map((option) => (
              <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function MemberModal({ open, onClose, familyId, onSaved }: { open: boolean; onClose: () => void; familyId: string; onSaved: () => void }) {
  const { toast } = useApp();
  const [form, setForm] = useState({ name: '', relation: 'Child', gender: 'Female', age: '', is_orphan: false, orphan_status: '', school: '', class_level: '', health_status: 'Good', notes: '' });
  const set = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!form.name.trim()) {
      toast('Enter the person’s name.', 'warn');
      return;
    }
    try {
      await post(`/api/families/${familyId}/members`, { ...form, age: form.age || null }, { queueLabel: `Add ${form.name} to the household` });
      onSaved();
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a person to the household"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="check" onClick={save}>Add person</Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Full name" required>
          <input className="input" value={form.name} onChange={(event) => set('name', event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Relation to head">
            <select className="input" value={form.relation} onChange={(event) => set('relation', event.target.value)}>
              {['Head', 'Spouse', 'Child', 'Grandchild', 'Parent', 'Sibling', 'Relative', 'Other'].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </Field>
          <Field label="Gender">
            <select className="input" value={form.gender} onChange={(event) => set('gender', event.target.value)}>
              <option>Female</option>
              <option>Male</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Age">
            <input className="input" type="number" min="0" value={form.age} onChange={(event) => set('age', event.target.value)} />
          </Field>
          <Field label="Health">
            <select className="input" value={form.health_status} onChange={(event) => set('health_status', event.target.value)}>
              {['Good', 'Fair', 'Chronic illness', 'Disabled', 'At risk'].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2.5 rounded-lg border border-ink-200 px-3 py-2.5">
          <input type="checkbox" className="h-4 w-4" checked={form.is_orphan} onChange={(event) => set('is_orphan', event.target.checked)} />
          <span className="text-[13px] text-ink-700">This child is supported as an orphan — their documents are needed in the Field Camera.</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="School">
            <input className="input" value={form.school} onChange={(event) => set('school', event.target.value)} />
          </Field>
          <Field label="Class">
            <input className="input" value={form.class_level} onChange={(event) => set('class_level', event.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function EditFamilyModal({ open, onClose, family, onSaved }: { open: boolean; onClose: () => void; family: any; onSaved: () => void }) {
  const { toast, confirm } = useApp();
  const [form, setForm] = useState({
    name: family.name || '', head_name: family.head_name || '', guardian_name: family.guardian_name || '',
    phone: family.phone || '', alternate_phone: family.alternate_phone || '', region: family.region || '',
    district: family.district || '', community: family.community || '', address: family.address || '',
    urgency: family.urgency || 'Medium', status: family.status || 'active', summary: family.summary || '',
    monthly_income: family.monthly_income ?? '', consent_photo: family.consent_photo ? true : false,
  });
  const set = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    try {
      await patch(`/api/families/${family.id}`, form, { queueLabel: `Update ${family.name}` });
      onSaved();
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit family record"
      subtitle={`${family.code} · changes sync to every device`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="check" onClick={save}>Save changes</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Family name" className="sm:col-span-2">
          <input className="input" value={form.name} onChange={(event) => set('name', event.target.value)} />
        </Field>
        <Field label="Head of household"><input className="input" value={form.head_name} onChange={(event) => set('head_name', event.target.value)} /></Field>
        <Field label="Guardian"><input className="input" value={form.guardian_name} onChange={(event) => set('guardian_name', event.target.value)} /></Field>
        <Field label="Phone"><input className="input" type="tel" value={form.phone} onChange={(event) => set('phone', event.target.value)} /></Field>
        <Field label="Alternate phone"><input className="input" type="tel" value={form.alternate_phone} onChange={(event) => set('alternate_phone', event.target.value)} /></Field>
        <Field label="Region"><input className="input" value={form.region} onChange={(event) => set('region', event.target.value)} /></Field>
        <Field label="District"><input className="input" value={form.district} onChange={(event) => set('district', event.target.value)} /></Field>
        <Field label="Community"><input className="input" value={form.community} onChange={(event) => set('community', event.target.value)} /></Field>
        <Field label="Landmark"><input className="input" value={form.address} onChange={(event) => set('address', event.target.value)} /></Field>
        <Field label="Urgency">
          <select className="input" value={form.urgency} onChange={(event) => set('urgency', event.target.value)}>
            {['Low', 'Medium', 'High', 'Critical'].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={form.status} onChange={(event) => set('status', event.target.value)}>
            {['active', 'pending', 'closed'].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        <Field label="Monthly income (GHS)"><input className="input" type="number" value={form.monthly_income} onChange={(event) => set('monthly_income', event.target.value)} /></Field>
        <label className="flex items-center gap-2.5 rounded-lg border border-ink-200 px-3 py-2.5 sm:col-span-2">
          <input type="checkbox" className="h-4 w-4" checked={form.consent_photo} onChange={(event) => set('consent_photo', event.target.checked)} />
          <span className="text-[13px] text-ink-700">The family has agreed to photographs being taken during visits.</span>
        </label>
        <Field label="Summary" className="sm:col-span-2">
          <textarea className="input min-h-[90px]" value={form.summary} onChange={(event) => set('summary', event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
