/**
 * FieldLink — Field Camera.
 * The checklist that stops required photographs being forgotten during a visit: house,
 * people, child documents and adult documents. Each line has TAKE PHOTO, UPLOAD FILE or
 * NOT AVAILABLE, and the photograph is filed automatically with its family, section,
 * category, subcategory, officer and date.
 */
import React, { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { useApi, navigate } from '../lib/hooks';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Modal, Progress, SearchInput, Select, Thumb, cx } from '../components/ui';
import { Icon } from '../components/Icon';
import { CameraCapture } from '../components/CameraCapture';
import { post, upload, RequestFailed } from '../lib/api';
import { blobList, queueBlob } from '../lib/offline';
import { relativeTime, shortDate } from '../lib/format';

type ChecklistItem = {
  key: string;
  label: string;
  subcategory: string;
  category: string;
  groupKey: string;
  childId: string | null;
  childName: string | null;
  required: boolean;
  status: 'pending' | 'captured' | 'uploaded' | 'not_available';
  media_id?: string | null;
  url?: string | null;
  captured_at?: string | null;
  note?: string | null;
};

export function CameraScreen({ query }: { query: Record<string, string> }) {
  const { user, sync, toast } = useApp();
  const [familyId, setFamilyId] = useState(query.family || '');
  const [pickerOpen, setPickerOpen] = useState(!query.family);
  const [capture, setCapture] = useState<{ item: ChecklistItem; mode: 'camera' | 'file' } | null>(null);
  const [notAvailable, setNotAvailable] = useState<ChecklistItem | null>(null);
  const [reason, setReason] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [queueVersion, setQueueVersion] = useState(0);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const fileTarget = React.useRef<ChecklistItem | null>(null);

  const { data, loading, reload } = useApi<any>(familyId ? `/api/media/checklist/${familyId}` : null, {
    cacheKey: `checklist:${familyId}`,
    deps: [familyId, sync.revision],
  });

  React.useEffect(() => {
    blobList().then((items) => setPendingCount(items.length));
  }, [sync.revision, queueVersion]);

  const family = data?.family;
  const groups: any[] = data?.groups || [];
  const progress = data?.progress || { required: 0, completed: 0, handled: 0, outstanding: 0, percent: 0 };

  const allItems: ChecklistItem[] = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  const queueUpload = async (file: File, item: ChecklistItem, source: 'camera' | 'file') => {
    const capturedAt = new Date().toISOString();
    const formData = new FormData();
    formData.append('files', file);
    formData.append('family_id', familyId);
    formData.append('checklist_key', item.key);
    formData.append('group_key', item.groupKey);
    formData.append('category', item.category);
    formData.append('subcategory', item.subcategory);
    if (item.childId) formData.append('child_id', item.childId);
    formData.append('source', source);
    formData.append('captured_at', capturedAt);
    if (family?.consent_photo === 0) {
      toast('This family has not agreed to photographs. Update the consent answer on the family record first.', 'danger');
      return;
    }
    setUploading(item.key);
    try {
      await upload('/api/media', formData);
      toast(`${item.subcategory} saved to ${family?.code || 'the family'}.`, 'good');
      reload();
    } catch (err: any) {
      if (err instanceof RequestFailed && err.status === 0) {
        // No connection — keep the photograph on the device with all its metadata.
        await queueBlob({
          blob: file,
          filename: file.name || `fieldlink-${Date.now()}.jpg`,
          label: `${family?.code || 'Family'} · ${item.subcategory}`,
          fields: {
            family_id: familyId,
            checklist_key: item.key,
            group_key: item.groupKey,
            category: item.category,
            subcategory: item.subcategory,
            child_id: item.childId || '',
            source,
            captured_at: capturedAt,
          },
        });
        setQueueVersion((value) => value + 1);
        toast('Saved on this device. It will upload automatically when you have a connection.', 'warn');
      } else {
        toast(err.message || 'The photograph could not be saved.', 'danger');
      }
    } finally {
      setUploading(null);
    }
  };

  const markNotAvailable = async () => {
    if (!notAvailable) return;
    try {
      await post('/api/media/not-available', {
        family_id: familyId,
        checklist_key: notAvailable.key,
        group_key: notAvailable.groupKey,
        category: notAvailable.category,
        subcategory: notAvailable.subcategory,
        child_id: notAvailable.childId,
        note: reason,
      }, { queueLabel: `${notAvailable.subcategory} — not available` });
      toast('Recorded as not available, with your reason.', 'info');
      setNotAvailable(null);
      setReason('');
      reload();
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  const token = localStorage.getItem('fieldlink.token') || '';

  return (
    <div className="space-y-4 p-3 sm:p-5">
      {/* family + progress */}
      <Card>
        <CardHeader
          title={family ? `${family.code} — ${family.name}` : 'Choose the family you are visiting'}
          subtitle={family ? `${family.community || ''}${family.guardian_name ? ` · guardian ${family.guardian_name}` : ''}` : 'The checklist is built from the family record, including each orphan child.'}
          icon="camera"
          action={<Button size="sm" icon="users" onClick={() => setPickerOpen(true)}>Change family</Button>}
        />
        {family ? (
          <div className="space-y-3 px-4 py-3.5 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[14px] font-semibold text-ink-900">
                {progress.completed} of {progress.required} required items completed
              </p>
              <div className="flex items-center gap-3 text-[12px] text-ink-500">
                <span>{progress.handled} handled in total</span>
                {progress.outstanding ? <span className="font-medium text-amber-700">{progress.outstanding} still to do</span> : <span className="font-medium text-emerald-700">Checklist complete</span>}
              </div>
            </div>
            <Progress value={progress.percent} showLabel />
            {pendingCount ? (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                <Icon name="cloud-off" className="h-4 w-4" />
                {pendingCount} {pendingCount === 1 ? 'photograph is' : 'photographs are'} saved on this device and will upload automatically.
              </div>
            ) : null}
            {family.consent_photo === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-900">
                <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  The family has not agreed to photographs. Ask for consent first and record it on the family record before taking any picture.
                </span>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button icon="users" onClick={() => navigate(`/families/${familyId}`)}>Open family record</Button>
              <Button icon="clipboard-list" onClick={() => navigate('/forms?new=1')}>Start assessment</Button>
              <Button icon="images" onClick={() => navigate(`/media?family=${familyId}`)}>View all media</Button>
            </div>
          </div>
        ) : null}
      </Card>

      {!familyId ? (
        <Card>
          <EmptyState
            icon="camera"
            title="No family chosen"
            message="Choose the family you are visiting so FieldLink can build the exact list of required photographs."
            action={<Button variant="primary" icon="users" onClick={() => setPickerOpen(true)}>Choose a family</Button>}
          />
        </Card>
      ) : null}

      {loading && familyId && !groups.length ? <Card className="card-pad text-sm text-ink-500">Building the checklist…</Card> : null}

      {groups.map((group: any) => {
        const items: ChecklistItem[] = group.items || [];
        const done = items.filter((item) => item.status === 'captured' || item.status === 'uploaded').length;
        return (
          <Card key={group.key}>
            <CardHeader
              title={group.title}
              subtitle={group.description}
              icon={group.key === 'house' ? 'building' : group.key === 'people' ? 'users' : group.key === 'child_docs' ? 'baby' : 'user-shield'}
              action={
                <span className="text-[12px] font-medium text-ink-500">
                  {done}/{items.length}
                </span>
              }
            />
            <ul className="divide-y divide-ink-100">
              {items.map((item) => {
                const hasFile = item.status === 'captured' || item.status === 'uploaded';
                return (
                  <li key={item.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {hasFile ? (
                        <Thumb
                          src={`${item.url}?token=${encodeURIComponent(token)}`}
                          alt={item.label}
                          className="h-14 w-14 shrink-0"
                          onClick={() => navigate(`/media?family=${familyId}`)}
                        />
                      ) : (
                        <span className={cx('grid h-14 w-14 shrink-0 place-items-center rounded-lg border', item.status === 'not_available' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-ink-200 bg-ink-50 text-ink-400')}>
                          <Icon name={item.status === 'not_available' ? 'minus' : 'camera'} className="h-5 w-5" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium text-ink-800">
                          {item.label}
                          {!item.required ? <span className="ml-2 text-[11px] font-normal text-ink-400">only if required</span> : null}
                        </p>
                        <p className="mt-0.5 text-[12px] text-ink-500">
                          {item.status === 'not_available'
                            ? `Not available${item.note ? ` — ${item.note}` : ''}`
                            : hasFile
                              ? `${item.status === 'uploaded' ? 'Uploaded' : 'Captured'} ${relativeTime(item.captured_at)}`
                              : 'Not captured yet'}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {item.status === 'not_available' ? <Badge tone="warn">Not available</Badge> : null}
                      {hasFile ? <Badge tone="good">Done</Badge> : null}
                      <Button size="sm" variant={hasFile ? 'ghost' : 'primary'} icon="camera" onClick={() => setCapture({ item, mode: 'camera' })}>
                        {hasFile ? 'Retake' : 'Take photo'}
                      </Button>
                      <Button size="sm" icon="upload" onClick={() => { fileTarget.current = item; fileRef.current?.click(); }}>Upload file</Button>
                      {!hasFile ? (
                        <Button size="sm" variant="ghost" onClick={() => { setNotAvailable(item); setReason(''); }}>Not available</Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
              {!items.length ? (
                <li className="px-4 py-4 text-[13px] text-ink-500">
                  {group.perChild ? 'No orphan children are recorded for this family yet. Add them in the assessment.' : 'Nothing listed in this group.'}
                </li>
              ) : null}
            </ul>
          </Card>
        );
      })}

      {familyId && !loading && allItems.length && progress.required === 0 ? (
        <Card className="card-pad text-[13px] text-ink-500">
          This family has no required items in the checklist yet because no orphan children are recorded.
        </Card>
      ) : null}

      {/* hidden file input for UPLOAD FILE */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const item = fileTarget.current;
          event.target.value = '';
          if (file && item) void queueUpload(file, item, 'file');
        }}
      />

      <CameraCapture
        open={Boolean(capture && capture.mode === 'camera')}
        title={capture?.item.subcategory || 'Photograph'}
        hint={family ? `${family.code} · ${capture?.item.category}` : undefined}
        onClose={() => setCapture(null)}
        onUse={(file, meta) => {
          const item = capture?.item;
          setCapture(null);
          if (item) void queueUpload(file, item, meta.source);
        }}
      />

      {/* not available reason */}
      <Modal
        open={Boolean(notAvailable)}
        onClose={() => setNotAvailable(null)}
        title="Mark as not available"
        subtitle={notAvailable ? `${notAvailable.subcategory} — ${family?.code}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNotAvailable(null)}>Cancel</Button>
            <Button variant="primary" icon="check" onClick={markNotAvailable}>Save reason</Button>
          </>
        }
      >
        <Field label="Why is it not available?" hint="Your supervisor sees this reason, so a missing photograph is explained rather than forgotten.">
          <textarea
            className="input min-h-[100px]"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="For example: Guardian says the card is with her brother in Kumasi."
          />
        </Field>
      </Modal>

      {/* family picker */}
      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Choose the family you are visiting" size="md">
        <FamilyPicker
          onPick={(id) => {
            setFamilyId(id);
            setPickerOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}

function FamilyPicker({ onPick }: { onPick: (familyId: string) => void }) {
  const [search, setSearch] = useState('');
  const { data, loading } = useApi<any>('/api/families?sort=visit', { cacheKey: 'families:list' });
  const families = (data?.families || []).filter((family: any) =>
    !search || `${family.name} ${family.code} ${family.community || ''}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search families" className="flex-1" />
      </div>
      {loading ? <p className="text-[13px] text-ink-500">Loading families…</p> : null}
      <div className="max-h-[55vh] space-y-2 overflow-y-auto">
        {families.map((family: any) => (
          <button
            key={family.id}
            type="button"
            onClick={() => onPick(family.id)}
            className="flex w-full items-center gap-3 rounded-lg border border-ink-200 px-3 py-2.5 text-left transition hover:border-brand-500 hover:bg-brand-50/40"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-100 text-[12px] font-semibold text-ink-600">
              {family.orphans_count ?? family.orphan_count ?? 0}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-ink-800">{family.name}</span>
              <span className="block text-[12px] text-ink-500">
                <span className="font-mono">{family.code}</span> · {family.community || family.district || 'No location'} ·{' '}
                {family.last_visit_at ? `visited ${shortDate(family.last_visit_at)}` : 'never visited'}
              </span>
            </span>
            <span className="shrink-0 text-[12px] text-ink-500">
              {family.media_completed || 0}/{family.media_required || 0} photos
            </span>
          </button>
        ))}
        {!loading && !families.length ? <p className="text-[13px] text-ink-500">No families match that search.</p> : null}
      </div>
    </div>
  );
}
