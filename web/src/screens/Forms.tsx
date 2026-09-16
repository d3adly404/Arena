/**
 * FieldLink — Forms mini-app.
 * Field officers complete family assessments instead of writing on paper. This screen is
 * the desk that holds them: drafts to continue, assessments waiting for a supervisor,
 * corrections to fix, and everything already approved.
 */
import React, { useState } from 'react';
import { useApp } from '../lib/store';
import { useApi, navigate } from '../lib/hooks';
import { Badge, Button, Card, CardHeader, EmptyState, Modal, Progress, SearchInput, Select, Segmented, cx } from '../components/ui';
import { Icon } from '../components/Icon';
import { post } from '../lib/api';
import { relativeTime, shortDate } from '../lib/format';
import { FORM_STATUS } from '@shared/formTemplate';

export function FormsScreen({ query }: { query: Record<string, string> }) {
  const { user, sync, toast } = useApp();
  const [scope, setScope] = useState<string>(query.scope === 'review' ? 'review' : 'mine');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(query.new === '1');

  const canReview = user?.role === 'admin' || user?.role === 'supervisor';
  const params = new URLSearchParams();
  if (scope !== 'all') params.set('scope', scope);
  if (status !== 'all') params.set('status', status);

  const { data, loading, stale, reload } = useApi<any>(`/api/forms?${params.toString()}`, {
    cacheKey: `forms:${params.toString()}`,
    deps: [scope, status, sync.revision],
  });

  const forms = (data?.forms || []).filter((form: any) =>
    !search || [form.family_name, form.family_code, form.created_by_name].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()),
  );
  const counts = data?.counts || {};

  const tabs = [
    { key: 'mine', label: 'My assessments' },
    ...(canReview ? [{ key: 'review', label: 'Waiting for review' }] : []),
    { key: 'all', label: 'All assessments' },
  ];

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <Card>
        <CardHeader
          title="Family assessment"
          subtitle="Fourteen sections, saved automatically. Complete it during the visit and send it to your supervisor."
          icon="clipboard-list"
          action={<Button variant="primary" icon="plus" onClick={() => setNewOpen(true)}>New assessment</Button>}
        />
        <div className="grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-4">
          <CountTile label="Drafts to continue" value={counts.drafts || 0} icon="pen-line" tone="#b45309" />
          <CountTile label="Waiting for review" value={counts.waiting_review || 0} icon="clock" tone="#0369a1" />
          <CountTile label="Corrections requested" value={counts.corrections || 0} icon="alert-circle" tone="#be123c" />
          <CountTile label="Approved" value={counts.approved || 0} icon="check-circle" tone="#0f766e" />
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={scope} onChange={setScope} options={tabs.map((tab) => ({ value: tab.key, label: tab.label }))} />
        <SearchInput value={search} onChange={setSearch} placeholder="Search by family or officer" className="min-w-[200px] flex-1" />
        <Select value={status} onChange={(event) => setStatus(event.target.value)} className="w-auto">
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="corrections">Corrections requested</option>
          <option value="approved">Approved</option>
        </Select>
      </div>

      {stale ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <Icon name="cloud-off" className="h-4 w-4" /> Showing the copy saved on this device.
        </div>
      ) : null}

      {loading && !forms.length ? <Card className="card-pad text-sm text-ink-500">Loading assessments…</Card> : null}

      {!loading && !forms.length ? (
        <Card>
          <EmptyState
            icon="clipboard-list"
            title={scope === 'review' ? 'Nothing waiting for review' : 'No assessments here yet'}
            message={
              scope === 'review'
                ? 'When an officer submits an assessment it appears here for you to review, comment on and approve.'
                : 'Start a family assessment before your next visit. You can save a draft and continue later.'
            }
            action={<Button variant="primary" icon="plus" onClick={() => setNewOpen(true)}>Start an assessment</Button>}
          />
        </Card>
      ) : null}

      <div className="space-y-3">
        {forms.map((form: any) => {
          const statusMeta = FORM_STATUS[form.status] || { label: form.status, tone: 'neutral' };
          return (
            <Card key={form.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                    <span className="font-mono text-[11px] font-semibold text-ink-500">{form.family_code}</span>
                    {form.family_urgency === 'Critical' || form.family_urgency === 'High' ? <Badge tone="warn">{form.family_urgency}</Badge> : null}
                    {form.open_comment_count ? <Badge tone="danger" icon="message-circle">{form.open_comment_count} open comment{form.open_comment_count === 1 ? '' : 's'}</Badge> : null}
                  </div>
                  <button type="button" onClick={() => navigate(`/forms/${form.id}`)} className="mt-1.5 block text-left text-[15px] font-semibold text-ink-900 hover:underline">
                    {form.family_name}
                  </button>
                  <p className="mt-0.5 text-[12px] text-ink-500">
                    Started by {form.created_by_name || 'an officer'}
                    {form.assigned_to_name && form.assigned_to_name !== form.created_by_name ? ` · assigned to ${form.assigned_to_name}` : ''}
                    {form.submitted_at ? ` · submitted ${shortDate(form.submitted_at)}` : ` · updated ${relativeTime(form.updated_at)}`}
                  </p>
                  {form.status === 'corrections' && form.review_note ? (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                      <span className="font-semibold">Correction needed: </span>
                      {form.review_note}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-ink-500">{form.progress || 0}%</span>
                    <Progress value={form.progress || 0} className="w-24" />
                  </div>
                  <div className="flex gap-1.5">
                    {canReview && (form.status === 'submitted' || form.status === 'under_review') ? (
                      <Button size="sm" variant="primary" icon="check-square" onClick={() => navigate(`/forms/${form.id}?review=1`)}>Review</Button>
                    ) : null}
                    <Button size="sm" iconRight="arrow-right" onClick={() => navigate(`/forms/${form.id}`)}>
                      {form.status === 'draft' || form.status === 'corrections' ? 'Continue' : 'Open'}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <NewAssessmentModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(form) => {
          setNewOpen(false);
          toast('Assessment started. Answers save as you type.', 'good');
          reload();
          navigate(`/forms/${form.id}`);
        }}
      />
    </div>
  );
}

function CountTile({ label, value, icon, tone }: { label: string; value: number; icon: string; tone: string }) {
  return (
    <div className="rounded-lg border border-ink-200 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        <Icon name={icon} className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold" style={{ color: tone }}>{value}</p>
    </div>
  );
}

function NewAssessmentModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (form: any) => void }) {
  const { toast } = useApp();
  const { data, loading } = useApi<any>(open ? '/api/families?sort=visit' : null, { cacheKey: 'families:new-assessment' });
  const [familyId, setFamilyId] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const families = (data?.families || []).filter((family: any) =>
    !search || `${family.name} ${family.code} ${family.community || ''}`.toLowerCase().includes(search.toLowerCase()),
  );

  const start = async () => {
    if (!familyId) {
      toast('Choose the family first.', 'warn');
      return;
    }
    setSaving(true);
    try {
      const result = await post<{ form: any }>('/api/forms', { family_id: familyId });
      if ((result as any)?.queued) {
        toast('Saved on this device. The assessment will open when you have a connection.', 'warn');
        onClose();
        return;
      }
      onCreated(result.form);
    } catch (err: any) {
      toast(err.message || 'The assessment could not be started.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start a family assessment"
      subtitle="Choose the family you are visiting. Your answers save automatically."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="clipboard-list" loading={saving} onClick={start}>Start assessment</Button>
        </>
      }
    >
      <div className="space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search families" />
        <div className="max-h-[46vh] space-y-2 overflow-y-auto">
          {loading ? <p className="text-[13px] text-ink-500">Loading families…</p> : null}
          {families.map((family: any) => (
            <button
              key={family.id}
              type="button"
              onClick={() => setFamilyId(family.id)}
              className={cx(
                'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition',
                familyId === family.id ? 'border-brand-700 bg-brand-50' : 'border-ink-200 hover:border-ink-300',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-ink-800">{family.name}</span>
                <span className="block text-[12px] text-ink-500">
                  <span className="font-mono">{family.code}</span> · {family.community || family.district || 'No location'} · {family.members_count || 0} people
                </span>
              </span>
              {family.latest_form_status ? <Badge tone={FORM_STATUS[family.latest_form_status]?.tone || 'neutral'}>{FORM_STATUS[family.latest_form_status]?.label}</Badge> : null}
              {familyId === family.id ? <Icon name="check-circle" className="h-5 w-5 text-brand-700" /> : null}
            </button>
          ))}
          {!loading && !families.length ? <p className="text-[13px] text-ink-500">No families match that search.</p> : null}
        </div>
      </div>
    </Modal>
  );
}
