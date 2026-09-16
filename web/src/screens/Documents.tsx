/**
 * FieldLink — Documents.
 * Birth certificates, medical letters, school records, distribution lists and reports.
 * Documents attach to a family or to an event, and are only visible to authorised users.
 */
import React, { useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { useApi, navigate } from '../lib/hooks';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Modal, SearchInput, Select, cx } from '../components/ui';
import { Icon } from '../components/Icon';
import { del, upload } from '../lib/api';
import { fileSize, relativeTime, shortDate } from '../lib/format';

export function DocumentsScreen({ query }: { query: Record<string, string> }) {
  const { user, sync, toast, confirm } = useApp();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [familyFilter, setFamilyFilter] = useState(query.family || 'all');
  const [uploadOpen, setUploadOpen] = useState(Boolean(query.family));
  const { data, loading, reload } = useApi<any>(
    `/api/workspace/documents${familyFilter !== 'all' ? `?family_id=${familyFilter}` : ''}`,
    { cacheKey: `documents:${familyFilter}`, deps: [familyFilter, sync.revision] },
  );
  const { data: familyData } = useApi<any>('/api/families?sort=name', { cacheKey: 'families:list' });

  const documents = (data?.documents || []).filter((document: any) => {
    if (category !== 'all' && document.category !== category) return false;
    if (!search) return true;
    return `${document.title} ${document.family_name || ''} ${document.category || ''} ${document.notes || ''}`.toLowerCase().includes(search.toLowerCase());
  });

  const token = localStorage.getItem('fieldlink.token') || '';

  const remove = async (document: any) => {
    const ok = await confirm({ title: 'Delete this document?', message: `${document.title} will be removed from the workspace.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await del(`/api/workspace/documents/${document.id}`);
      toast('Document deleted.', 'info');
      reload();
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search documents" className="min-w-[200px] flex-1" />
        <Select
          value={familyFilter}
          onChange={(event) => setFamilyFilter(event.target.value)}
          className="w-auto"
        >
          <option value="all">All families</option>
          {(familyData?.families || []).map((family: any) => (
            <option key={family.id} value={family.id}>{family.code} — {family.name}</option>
          ))}
        </Select>
        <Select value={category} onChange={(event) => setCategory(event.target.value)} className="w-auto">
          <option value="all">All categories</option>
          {(data?.categories || []).map((item: string) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </Select>
        <Button variant="primary" icon="upload" onClick={() => setUploadOpen(true)}>Add document</Button>
      </div>

      <Card>
        <CardHeader
          title="Documents in the workspace"
          subtitle={`${documents.length} shown · only authorised users can open family documents`}
          icon="folder"
        />
        {loading && !documents.length ? <p className="px-4 py-5 text-[13px] text-ink-500">Loading documents…</p> : null}
        {!loading && !documents.length ? (
          <EmptyState
            icon="folder"
            title="No documents here"
            message="Upload birth certificates, medical letters, school records or reports. They stay attached to the family or event."
            action={<Button variant="primary" icon="upload" onClick={() => setUploadOpen(true)}>Add document</Button>}
          />
        ) : null}
        <ul className="divide-y divide-ink-100">
          {documents.map((document: any) => (
            <li key={document.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-600">
                <Icon name={document.mime?.startsWith('image/') ? 'image' : 'file-text'} className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-ink-800">{document.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-500">
                  {document.category ? <span>{document.category}</span> : null}
                  {document.size ? <span>· {fileSize(document.size)}</span> : null}
                  <span>· uploaded {relativeTime(document.created_at)}</span>
                  {document.uploaded_by_name ? <span>· {document.uploaded_by_name}</span> : null}
                </p>
                {document.family_name ? (
                  <button type="button" onClick={() => navigate(`/families/${document.family_id}`)} className="mt-1 text-[12px] font-medium text-brand-800 hover:underline">
                    {document.family_code} — {document.family_name}
                  </button>
                ) : null}
                {document.event_title ? (
                  <button type="button" onClick={() => navigate(`/planner/${document.event_id}`)} className="mt-1 block text-[12px] font-medium text-brand-800 hover:underline">
                    Event: {document.event_title}
                  </button>
                ) : null}
                {document.notes ? <p className="mt-1 text-[12px] text-ink-600">{document.notes}</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {document.url ? (
                  <a className="btn btn-sm" href={`${document.url}?token=${encodeURIComponent(token)}`} target="_blank" rel="noreferrer">
                    <Icon name="eye" className="h-4 w-4" /> Open
                  </a>
                ) : (
                  <Badge tone="warn">No file stored</Badge>
                )}
                {document.url ? (
                  <a className="btn btn-sm" href={`${document.url}?token=${encodeURIComponent(token)}`} download={`${document.title}`}>
                    <Icon name="download" className="h-4 w-4" /> Save
                  </a>
                ) : null}
                {user?.role === 'admin' || user?.role === 'supervisor' ? (
                  <button type="button" onClick={() => remove(document)} className="rounded-lg p-2 text-ink-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete document">
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        families={familyData?.families || []}
        defaultFamily={familyFilter !== 'all' ? familyFilter : query.family}
        onUploaded={() => {
          setUploadOpen(false);
          toast('Document uploaded and shared with the workspace.', 'good');
          reload();
        }}
      />
    </div>
  );
}

export function UploadDocumentModal({ open, onClose, families, defaultFamily, eventId, onUploaded }: {
  open: boolean; onClose: () => void; families: any[]; defaultFamily?: string; eventId?: string; onUploaded: () => void;
}) {
  const { toast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('General');
  const [familyId, setFamilyId] = useState(defaultFamily || '');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!files.length) {
      toast('Choose a file first.', 'warn');
      return;
    }
    setBusy(true);
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('title', title || files[0].name);
    formData.append('category', category);
    formData.append('notes', notes);
    if (familyId) formData.append('family_id', familyId);
    if (eventId) formData.append('event_id', eventId);
    try {
      await upload('/api/workspace/documents', formData);
      setFiles([]);
      setTitle('');
      setNotes('');
      onUploaded();
    } catch (err: any) {
      toast(err.message || 'The document could not be uploaded.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a document"
      subtitle="PDF, Word, Excel, images and text files up to 25 MB."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="upload" loading={busy} onClick={submit}>Upload</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="File" required>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="block w-full text-[13px] text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-700 file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-white"
            onChange={(event) => setFiles(Array.from(event.target.files || []))}
          />
          {files.length ? <p className="hint">{files.map((file) => file.name).join(', ')}</p> : null}
        </Field>
        <Field label="Title">
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="For example: Birth certificate — Mariam Yakubu" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category">
            <Select value={category} onChange={(event) => setCategory(event.target.value)}>
              {['General', 'Identification', 'Education', 'Health', 'Distribution', 'Financial', 'Reports', 'Photos'].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </Select>
          </Field>
          <Field label="Attach to family">
            <Select value={familyId} onChange={(event) => setFamilyId(event.target.value)}>
              <option value="">Not attached to a family</option>
              {families.map((family: any) => (
                <option key={family.id} value={family.id}>{family.code} — {family.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notes">
          <textarea className="input min-h-[80px]" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function DocumentRow({ document, token }: { document: any; token: string }) {
  return (
    <div className={cx('flex items-center gap-3')}>
      <Icon name="file-text" className="h-4 w-4 text-ink-400" />
      <a className="truncate text-[13px] text-brand-800 hover:underline" href={`${document.url}?token=${encodeURIComponent(token)}`} target="_blank" rel="noreferrer">
        {document.title}
      </a>
      <span className="ml-auto shrink-0 text-[11px] text-ink-400">{shortDate(document.created_at)}</span>
    </div>
  );
}
