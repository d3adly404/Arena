/**
 * FieldLink — Families list.
 * The register of every household the organisation supports, with the two things that
 * matter for field work: when they were last visited, and what is still missing.
 */
import React, { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { useApi, useDebounced, navigate } from '../lib/hooks';
import { Badge, Button, Card, EmptyState, Field, Modal, Progress, SearchInput, Segmented, Select, cx } from '../components/ui';
import { Icon } from '../components/Icon';
import { PhoneLink } from '../components/CallDialog';
import { post } from '../lib/api';
import { shortDate, money } from '../lib/format';

const URGENCY_TONES: Record<string, string> = {
  Critical: 'danger',
  High: 'warn',
  Medium: 'info',
  Low: 'neutral',
};

export function FamiliesScreen({ query }: { query: Record<string, string> }) {
  const { user, sync, toast, confirm } = useApp();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [region, setRegion] = useState('all');
  const [sort, setSort] = useState<'recent' | 'urgency' | 'name' | 'visit'>('recent');
  const [layout, setLayout] = useState<'cards' | 'list'>('cards');
  const [newOpen, setNewOpen] = useState(query.new === '1');
  const debounced = useDebounced(search, 250);

  const params = new URLSearchParams();
  if (debounced) params.set('query', debounced);
  if (status !== 'all') params.set('status', status);
  if (region !== 'all') params.set('region', region);
  params.set('sort', sort);
  const { data, loading, stale, reload } = useApi<any>(`/api/families?${params.toString()}`, {
    cacheKey: `families:${params.toString()}`,
    deps: [debounced, status, region, sort, sync.revision],
  });

  const families = data?.families || [];
  const regions = data?.regions || [];

  const totalOrphans = useMemo(() => families.reduce((sum: number, family: any) => sum + (family.orphans_count || 0), 0), [families]);

  const openCameraForFirst = () => {
    if (!families.length) return;
    navigate(`/camera?family=${families[0].id}`);
  };

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, code, phone or community" className="min-w-[220px] flex-1" />
        <Select value={status} onChange={(event) => setStatus(event.target.value)} className="w-auto">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="closed">Closed</option>
        </Select>
        <Select value={region} onChange={(event) => setRegion(event.target.value)} className="w-auto">
          <option value="all">All regions</option>
          {regions.map((item: string) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </Select>
        <Select value={sort} onChange={(event) => setSort(event.target.value as any)} className="w-auto">
          <option value="recent">Recently updated</option>
          <option value="urgency">Most urgent</option>
          <option value="visit">Last visit</option>
          <option value="name">Name</option>
        </Select>
        <Segmented<'cards' | 'list'>
          value={layout}
          onChange={setLayout}
          options={[
            { value: 'cards', label: 'Cards', icon: 'grid' },
            { value: 'list', label: 'List', icon: 'list' },
          ]}
        />
        <Button variant="primary" icon="user-plus" onClick={() => setNewOpen(true)}>New family</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-500">
        <span>{families.length} families shown</span>
        <span>·</span>
        <span>{totalOrphans} orphan children</span>
        {stale ? (
          <>
            <span>·</span>
            <span className="text-amber-700">showing saved copy</span>
          </>
        ) : null}
        {families.length ? (
          <button type="button" className="ml-auto inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline" onClick={openCameraForFirst}>
            <Icon name="camera" className="h-3.5 w-3.5" /> Open camera checklist
          </button>
        ) : null}
      </div>

      {loading && !families.length ? (
        <Card className="card-pad text-sm text-ink-500">Loading families…</Card>
      ) : null}

      {!loading && !families.length ? (
        <Card>
          <EmptyState
            icon="users"
            title="No families found"
            message={search ? 'No family matches that search. Try the family code, the guardian name or the community.' : 'Register the first family in this workspace.'}
            action={<Button variant="primary" icon="user-plus" onClick={() => setNewOpen(true)}>New family</Button>}
          />
        </Card>
      ) : null}

      {layout === 'cards' ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {families.map((family: any) => (
            <Card key={family.id} className="flex flex-col p-4 transition hover:shadow-raised">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-ink-500">{family.code}</span>
                    <Badge tone={URGENCY_TONES[family.urgency] || 'neutral'}>{family.urgency || 'Medium'}</Badge>
                    {family.status !== 'active' ? <Badge tone="neutral">{family.status}</Badge> : null}
                  </div>
                  <button type="button" onClick={() => navigate(`/families/${family.id}`)} className="mt-1 block text-left text-[15px] font-semibold text-ink-900 hover:underline">
                    {family.name}
                  </button>
                  <p className="mt-0.5 text-[12px] text-ink-500">
                    {family.community ? `${family.community}, ` : ''}{family.district || family.region || 'Location not recorded'}
                  </p>
                </div>
                <Icon name="chevron-right" className="mt-1 h-4 w-4 shrink-0 text-ink-300" />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] text-ink-600">
                <span className="inline-flex items-center gap-1.5"><Icon name="users" className="h-3.5 w-3.5 text-ink-400" />{family.members_count || family.member_count || 0} people</span>
                <span className="inline-flex items-center gap-1.5"><Icon name="baby" className="h-3.5 w-3.5 text-ink-400" />{family.orphans_count ?? family.orphan_count ?? 0} orphan children</span>
                <span className="inline-flex items-center gap-1.5"><Icon name="map-pin" className="h-3.5 w-3.5 text-ink-400" />{family.last_visit_at ? `Visited ${shortDate(family.last_visit_at)}` : 'Never visited'}</span>
                <span className="inline-flex items-center gap-1.5"><Icon name="clipboard-list" className="h-3.5 w-3.5 text-ink-400" />{family.forms_count || 0} assessment{family.forms_count === 1 ? '' : 's'}</span>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] font-medium text-ink-500">
                  <span>Required photographs</span>
                  <span>{family.media_completed || 0} of {family.media_required || 0}</span>
                </div>
                <Progress className="mt-1.5" value={family.media_percent || 0} tone={(family.media_percent || 0) >= 100 ? '#0f766e' : (family.media_percent || 0) < 40 ? '#b45309' : '#0d9488'} />
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink-100 pt-3">
                <PhoneLink phone={family.phone} familyId={family.id} familyName={family.name} familyCode={family.code} contactName={family.guardian_name || family.head_name} className="text-[12px]" />
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" icon="camera" onClick={() => navigate(`/camera?family=${family.id}`)}>Photos</Button>
                  <Button size="sm" variant="ghost" iconRight="arrow-right" onClick={() => navigate(`/families/${family.id}`)}>Open</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-3 border-b border-ink-200 bg-ink-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500 lg:grid">
            <span>Family</span>
            <span>People</span>
            <span>Last visit</span>
            <span>Photographs</span>
            <span />
          </div>
          <ul className="divide-y divide-ink-100">
            {families.map((family: any) => (
              <li key={family.id} className="grid grid-cols-1 items-center gap-2 px-4 py-3 hover:bg-ink-50 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto] lg:gap-3">
                <div className="min-w-0">
                  <button type="button" onClick={() => navigate(`/families/${family.id}`)} className="text-left text-[14px] font-medium text-ink-900 hover:underline">
                    {family.name}
                  </button>
                  <p className="text-[12px] text-ink-500">
                    <span className="font-mono">{family.code}</span> · {family.community || family.district || 'No location'} · {family.members_count || 0} people
                  </p>
                </div>
                <span className="text-[13px] text-ink-600">{family.orphans_count ?? family.orphan_count ?? 0} orphan children</span>
                <span className="text-[13px] text-ink-600">{family.last_visit_at ? shortDate(family.last_visit_at) : 'Never'}</span>
                <div className="flex items-center gap-2">
                  <Progress value={family.media_percent || 0} className="w-24" />
                  <span className="text-[12px] text-ink-500">{family.media_completed || 0}/{family.media_required || 0}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <PhoneLink phone={family.phone} familyId={family.id} familyName={family.name} familyCode={family.code} contactName={family.guardian_name || family.head_name} showIcon />
                  <Button size="sm" variant="ghost" iconRight="chevron-right" onClick={() => navigate(`/families/${family.id}`)}>Open</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <NewFamilyModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(family) => {
          toast(`${family.name} registered as ${family.code}.`, 'good');
          setNewOpen(false);
          reload();
          navigate(`/families/${family.id}`);
        }}
      />
    </div>
  );
}

export function NewFamilyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (family: any) => void }) {
  const { toast } = useApp();
  const [form, setForm] = useState({
    name: '', head_name: '', guardian_name: '', phone: '', alternate_phone: '',
    region: '', district: '', community: '', address: '', urgency: 'Medium', orphan_count: '', member_count: '', monthly_income: '', summary: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await post<{ family: any }>('/api/families', form, { queueLabel: `Register family ${form.name}` });
      if ((result as any)?.queued) {
        toast('Saved on this device. The family will be registered when you have a connection.', 'warn');
        onClose();
        return;
      }
      onCreated(result.family);
      setForm({ name: '', head_name: '', guardian_name: '', phone: '', alternate_phone: '', region: '', district: '', community: '', address: '', urgency: 'Medium', orphan_count: '', member_count: '', monthly_income: '', summary: '' });
    } catch (err: any) {
      toast(err.message || 'The family could not be saved.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Register a family"
      subtitle="Only the name is needed today. The rest can be completed during the visit."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="check" loading={saving} onClick={submit}>Save family</Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Household / family name" required className="sm:col-span-2">
          <input className="input" required value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="For example: Aminah Household" />
        </Field>
        <Field label="Head of household">
          <input className="input" value={form.head_name} onChange={(event) => set('head_name', event.target.value)} />
        </Field>
        <Field label="Guardian / caregiver">
          <input className="input" value={form.guardian_name} onChange={(event) => set('guardian_name', event.target.value)} />
        </Field>
        <Field label="Phone number" hint="Saved numbers can be called directly from FieldLink.">
          <input className="input" type="tel" inputMode="tel" value={form.phone} onChange={(event) => set('phone', event.target.value)} placeholder="+233 …" />
        </Field>
        <Field label="Alternate phone number">
          <input className="input" type="tel" inputMode="tel" value={form.alternate_phone} onChange={(event) => set('alternate_phone', event.target.value)} />
        </Field>
        <Field label="Region">
          <input className="input" value={form.region} onChange={(event) => set('region', event.target.value)} />
        </Field>
        <Field label="District">
          <input className="input" value={form.district} onChange={(event) => set('district', event.target.value)} />
        </Field>
        <Field label="Community / village">
          <input className="input" value={form.community} onChange={(event) => set('community', event.target.value)} />
        </Field>
        <Field label="Nearest landmark" hint="Helps other officers find the home.">
          <input className="input" value={form.address} onChange={(event) => set('address', event.target.value)} />
        </Field>
        <Field label="Urgency">
          <Select value={form.urgency} onChange={(event) => set('urgency', event.target.value)}>
            {['Low', 'Medium', 'High', 'Critical'].map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        </Field>
        <Field label="Number of orphan children">
          <input className="input" type="number" min="0" value={form.orphan_count} onChange={(event) => set('orphan_count', event.target.value)} />
        </Field>
        <Field label="Household size">
          <input className="input" type="number" min="0" value={form.member_count} onChange={(event) => set('member_count', event.target.value)} />
        </Field>
        <Field label="Monthly income (GHS)">
          <input className="input" type="number" min="0" step="0.01" value={form.monthly_income} onChange={(event) => set('monthly_income', event.target.value)} />
        </Field>
        <Field label="Short summary" className="sm:col-span-2">
          <textarea className="input min-h-[80px]" value={form.summary} onChange={(event) => set('summary', event.target.value)} placeholder="What happened in this household? Why do they need support?" />
        </Field>
      </form>
    </Modal>
  );
}

export function useCurrencyPreview(value?: number | null) {
  return money(value);
}
