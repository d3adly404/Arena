/**
 * FieldLink — Media library.
 * Every file carries its metadata: which family, which section, which category, who took
 * it and when. Family photographs are never shown to users who are not allowed to see
 * that family.
 */
import React, { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { useApi, navigate } from '../lib/hooks';
import { Badge, Button, Card, CardHeader, EmptyState, Modal, SearchInput, Segmented, Select, Thumb, cx } from '../components/ui';
import { Icon } from '../components/Icon';
import { del, post, patch } from '../lib/api';
import { fileSize, longDate, relativeTime, shortDate, clockTime } from '../lib/format';

const VIEWS = [
  { value: 'grid', label: 'Grid', icon: 'grid' },
  { value: 'list', label: 'List', icon: 'list' },
  { value: 'gallery', label: 'Gallery', icon: 'image' },
] as const;

export function MediaScreen({ query }: { query: Record<string, string> }) {
  const { user, sync, toast, confirm } = useApp();
  const [view, setView] = useState<'grid' | 'list' | 'gallery'>(query.view === 'list' ? 'list' : 'grid');
  const [familyId, setFamilyId] = useState(query.family || 'all');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any | null>(null);

  const params = new URLSearchParams({ limit: '400' });
  if (familyId !== 'all') params.set('family_id', familyId);
  if (category !== 'all') params.set('category', category);
  if (status !== 'all') params.set('status', status);
  const { data, loading, reload } = useApi<any>(`/api/media?${params.toString()}`, {
    cacheKey: `media:${params.toString()}`,
    deps: [familyId, category, status, sync.revision],
  });
  const { data: familyData } = useApi<any>('/api/families?sort=name', { cacheKey: 'families:list' });

  const token = localStorage.getItem('fieldlink.token') || '';
  const items = (data?.media || []).filter((item: any) => {
    if (!search) return true;
    return `${item.family_name} ${item.family_code} ${item.category} ${item.subcategory} ${item.captured_by_name}`.toLowerCase().includes(search.toLowerCase());
  });

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const item of items) {
      const key = item.category || 'General';
      map.set(key, [...(map.get(key) || []), item]);
    }
    return [...map.entries()];
  }, [items]);

  const removeItem = async (item: any) => {
    const ok = await confirm({ title: 'Delete this item?', message: 'The photograph will be removed from the family record.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await del(`/api/media/${item.id}`);
      setSelected(null);
      toast('Item deleted.', 'info');
      reload();
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search photographs by family, category or officer" className="min-w-[220px] flex-1" />
        <Select value={familyId} onChange={(event) => setFamilyId(event.target.value)} className="w-auto">
          <option value="all">All families</option>
          {(familyData?.families || []).map((family: any) => (
            <option key={family.id} value={family.id}>{family.code} — {family.name}</option>
          ))}
        </Select>
        <Select value={category} onChange={(event) => setCategory(event.target.value)} className="w-auto">
          <option value="all">All categories</option>
          {(data?.categories || []).map((item: any) => (
            <option key={item.category} value={item.category}>{item.category} ({item.count})</option>
          ))}
        </Select>
        <Select value={status} onChange={(event) => setStatus(event.target.value)} className="w-auto">
          <option value="all">All statuses</option>
          <option value="captured">Captured</option>
          <option value="uploaded">Uploaded</option>
          <option value="not_available">Not available</option>
        </Select>
        <Segmented<'grid' | 'list' | 'gallery'>
          value={view}
          onChange={setView}
          options={VIEWS.map((item) => ({ value: item.value, label: item.label, icon: item.icon }))}
        />
        <Button variant="primary" icon="camera" onClick={() => navigate(`/camera${familyId !== 'all' ? `?family=${familyId}` : ''}`)}>Open camera</Button>
      </div>

      <Card>
        <CardHeader
          title="Media library"
          subtitle={`${items.length} items · metadata recorded with every file`}
          icon="images"
          action={<Button size="sm" variant="ghost" icon="rotate-ccw" onClick={reload}>Refresh</Button>}
        />
        {loading && !items.length ? <p className="px-4 py-5 text-[13px] text-ink-500">Loading media…</p> : null}
        {!loading && !items.length ? (
          <EmptyState
            icon="camera"
            title="No photographs here yet"
            message="Open the field camera before your next visit. The checklist tells you exactly which photographs are required."
            action={<Button variant="primary" icon="camera" onClick={() => navigate('/camera')}>Open the field camera</Button>}
          />
        ) : null}

        {view === 'grid' ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {items.map((item: any) => (
              <div key={item.id} className="min-w-0">
                <Thumb src={item.status === 'not_available' ? null : `${item.url}?token=${encodeURIComponent(token)}`} alt={item.subcategory || item.category} onClick={() => setSelected(item)} />
                <p className="mt-1 truncate text-[12px] font-medium text-ink-700">{item.subcategory || item.category}</p>
                <p className="truncate text-[11px] text-ink-500">{item.family_code} · {shortDate(item.captured_at)}</p>
                {item.status === 'not_available' ? <Badge tone="warn" className="mt-1">Not available</Badge> : null}
              </div>
            ))}
          </div>
        ) : null}

        {view === 'gallery' ? (
          <div className="space-y-5 p-4">
            {grouped.map(([groupName, groupItems]) => (
              <div key={groupName}>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-[14px] font-semibold text-ink-800">{groupName}</h3>
                  <span className="text-[12px] text-ink-500">{groupItems.length} items</span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {groupItems.map((item: any) => (
                    <Thumb
                      key={item.id}
                      ratio="wide"
                      src={item.status === 'not_available' ? null : `${item.url}?token=${encodeURIComponent(token)}`}
                      alt={item.subcategory || item.category}
                      onClick={() => setSelected(item)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {view === 'list' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="border-b border-ink-200 bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Preview</th>
                  <th className="px-4 py-2 font-semibold">Family</th>
                  <th className="px-4 py-2 font-semibold">Section</th>
                  <th className="px-4 py-2 font-semibold">Category</th>
                  <th className="px-4 py-2 font-semibold">Captured by</th>
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {items.map((item: any) => (
                  <tr key={item.id} className="hover:bg-ink-50">
                    <td className="px-4 py-2">
                      <button type="button" onClick={() => setSelected(item)} className="block h-10 w-14 overflow-hidden rounded border border-ink-200">
                        {item.status === 'not_available' ? (
                          <span className="grid h-full w-full place-items-center bg-ink-100 text-ink-400"><Icon name="minus" className="h-4 w-4" /></span>
                        ) : (
                          <img src={`${item.url}?token=${encodeURIComponent(token)}`} alt="" className="h-full w-full object-cover" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <button type="button" className="font-medium text-brand-800 hover:underline" onClick={() => navigate(`/families/${item.family_id}`)}>
                        {item.family_code}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-ink-700">{item.subcategory || '—'}</td>
                    <td className="px-4 py-2 text-ink-600">{item.category}</td>
                    <td className="px-4 py-2 text-ink-600">{item.captured_by_name || '—'}</td>
                    <td className="px-4 py-2 text-ink-600">{shortDate(item.captured_at)}</td>
                    <td className="px-4 py-2">
                      <Badge tone={item.status === 'not_available' ? 'warn' : 'good'}>{item.status === 'not_available' ? 'Not available' : item.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {/* viewer with metadata */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.subcategory || selected?.category || 'Media item'}
        subtitle={selected ? `${selected.family_code} — ${selected.family_name}` : undefined}
        size="lg"
        footer={
          <>
            {selected?.family_id ? (
              <Button icon="users" onClick={() => navigate(`/families/${selected.family_id}`)}>Open family</Button>
            ) : null}
            {selected?.family_id ? (
              <Button icon="camera" onClick={() => navigate(`/camera?family=${selected.family_id}`)}>Checklist</Button>
            ) : null}
            {selected && ['admin', 'supervisor', 'officer'].includes(user?.role) ? (
              <Button variant="danger" icon="trash" onClick={() => removeItem(selected)}>Delete</Button>
            ) : null}
          </>
        }
      >
        {selected ? (
          <div className="space-y-4">
            {selected.status === 'not_available' ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
                <p className="font-semibold">Marked as not available</p>
                <p className="mt-1">{selected.note || 'No reason recorded.'}</p>
              </div>
            ) : (
              <img
                src={`${selected.url}?token=${encodeURIComponent(token)}`}
                alt={selected.subcategory || 'Photograph'}
                className="max-h-[60vh] w-full rounded-lg border border-ink-200 object-contain"
              />
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
              <Meta label="Family" value={`${selected.family_code} — ${selected.family_name}`} />
              <Meta label="Section" value={selected.group_key || '—'} />
              <Meta label="Category" value={selected.category || '—'} />
              <Meta label="Subcategory" value={selected.subcategory || '—'} />
              <Meta label="Captured by" value={selected.captured_by_name || '—'} />
              <Meta label="Date captured" value={`${longDate(selected.captured_at)} ${clockTime(selected.captured_at)}`} />
              <Meta label="Source" value={selected.source === 'camera' ? 'Taken with the camera' : selected.source} />
              {selected.child_name ? <Meta label="Child" value={selected.child_name} /> : null}
              {selected.size ? <Meta label="File size" value={fileSize(selected.size)} /> : null}
              {selected.gps_lat ? <Meta label="Location" value={`${selected.gps_lat.toFixed(4)}, ${selected.gps_lng?.toFixed(4)}`} /> : null}
            </dl>
            {selected.note ? <p className="rounded-lg bg-ink-50 px-3 py-2 text-[13px] text-ink-700">{selected.note}</p> : null}
            <div className="flex flex-wrap gap-2">
              <a className="btn btn-sm" href={`${selected.url}?token=${encodeURIComponent(token)}`} download>
                <Icon name="download" className="h-4 w-4" /> Save a copy
              </a>
              <Button
                size="sm"
                icon="edit"
                onClick={async () => {
                  const note = window.prompt('Add or update the note for this photograph', selected.note || '');
                  if (note === null) return;
                  await patch(`/api/media/${selected.id}`, { note });
                  toast('Note saved.', 'good');
                  setSelected(null);
                  reload();
                }}
              >
                Add a note
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="text-[13px] text-ink-800">{value}</dd>
    </div>
  );
}
