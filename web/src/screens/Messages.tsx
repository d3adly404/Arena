/**
 * FieldLink — Messages.
 * Conversations that behave the way people expect: a list, unread dots, search,
 * timestamps, photographs and documents — and conversations that belong to a family,
 * a task or an event so the discussion stays with the work.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { useApi, navigate } from '../lib/hooks';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Modal, SearchInput, cx } from '../components/ui';
import { Icon } from '../components/Icon';
import { get, post, upload, newClientId } from '../lib/api';
import { relativeTime, clockTime, fileSize, shortDate } from '../lib/format';

export function MessagesScreen({ conversationId, query }: { conversationId?: string; query: Record<string, string> }) {
  const { user, sync, toast } = useApp();
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(query.new === '1');
  const { data, loading, stale, reload } = useApi<any>('/api/messages/conversations', { cacheKey: 'conversations', deps: [sync.revision] });

  const conversations = useMemo(() => {
    const list = data?.conversations || [];
    if (!search) return list;
    return list.filter((conversation: any) =>
      `${conversation.display_title} ${conversation.member_names?.join(' ')} ${conversation.last_message?.body || ''}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  }, [data, search]);

  const active = conversationId || (typeof window !== 'undefined' && window.innerWidth >= 1024 ? conversations[0]?.id : null);

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[420px] gap-0 lg:h-[calc(100vh-120px)]">
      {/* conversation list */}
      <div className={cx('flex w-full flex-col border-r border-ink-200 lg:w-[340px]', conversationId && 'hidden lg:flex')}>
        <div className="flex items-center gap-2 border-b border-ink-100 p-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search conversations" />
          <Button icon="plus" variant="primary" onClick={() => setNewOpen(true)} aria-label="New conversation" />
        </div>
        {stale ? (
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            <Icon name="cloud-off" className="h-3.5 w-3.5" /> Saved messages
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && !conversations.length ? <p className="p-4 text-[13px] text-ink-500">Loading conversations…</p> : null}
          {!loading && !conversations.length ? (
            <EmptyState icon="message-circle" title="No conversations yet" message="Start a conversation with a colleague, or open a family and tap Discuss family." action={<Button variant="primary" icon="plus" onClick={() => setNewOpen(true)}>New conversation</Button>} />
          ) : null}
          {conversations.map((conversation: any) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => navigate(`/messages/${conversation.id}`)}
              className={cx('flex w-full items-start gap-3 border-b border-ink-100 px-3 py-3 text-left transition hover:bg-ink-50', active === conversation.id && 'bg-brand-50/60')}
            >
              <Avatar name={conversation.display_title} size={40} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-ink-900">{conversation.display_title}</span>
                  {conversation.kind === 'group' ? <Icon name="users" className="h-3.5 w-3.5 shrink-0 text-ink-400" /> : null}
                  <span className="ml-auto shrink-0 text-[11px] text-ink-400">
                    {conversation.last_message ? clockTime(conversation.last_message.created_at) : ''}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className={cx('truncate text-[12px]', conversation.unread ? 'font-medium text-ink-800' : 'text-ink-500')}>
                    {conversation.last_message
                      ? `${conversation.kind === 'group' ? `${conversation.last_message.sender_name?.split(' ')[0]}: ` : ''}${conversation.last_message.body || (conversation.last_message.kind === 'photo' ? '📷 Photograph' : '📄 Document')}`
                      : 'No messages yet'}
                  </span>
                  {conversation.unread ? <span className="ml-auto shrink-0 rounded-full bg-brand-700 px-1.5 text-[10px] font-semibold text-white">{conversation.unread}</span> : null}
                </span>
                {conversation.family ? <Badge tone="info" className="mt-1">{conversation.family.code}</Badge> : null}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* thread */}
      <div className={cx('min-w-0 flex-1', !conversationId && 'hidden lg:block')}>
        {active ? (
          <ConversationThread conversationId={active} onChanged={reload} onBack={() => navigate('/messages')} />
        ) : (
          <EmptyState icon="message-circle" title="Choose a conversation" message="Pick a conversation on the left, or start a new one." />
        )}
      </div>

      <NewConversationModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(conversation) => {
          setNewOpen(false);
          reload();
          navigate(`/messages/${conversation.id}`);
        }}
      />
    </div>
  );
}

function ConversationThread({ conversationId, onChanged, onBack }: { conversationId: string; onChanged: () => void; onBack: () => void }) {
  const { user, sync, toast } = useApp();
  const { data, loading, reload } = useApi<any>(`/api/messages/conversations/${conversationId}`, {
    cacheKey: `conversation:${conversationId}`,
    deps: [conversationId, sync.revision],
  });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);

  const conversation = data?.conversation;
  const messages = useMemo(() => {
    const list = data?.messages || [];
    return search ? list.filter((message: any) => (message.body || '').toLowerCase().includes(search.toLowerCase())) : list;
  }, [data, search]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  useEffect(() => {
    post(`/api/messages/conversations/${conversationId}/read`, {}).then(() => onChanged()).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const send = async (payload: { body?: string; media_id?: string; document_id?: string } = {}) => {
    const body = payload.body ?? text;
    if (!body?.trim() && !payload.media_id && !payload.document_id) return;
    setSending(true);
    const clientId = newClientId();
    try {
      const result = await post<any>(
        `/api/messages/conversations/${conversationId}/messages`,
        { body: body?.trim() || null, ...payload, client_id: clientId },
        { queueLabel: `Message: ${(body || 'attachment').slice(0, 40)}` },
      );
      setText('');
      if (result?.queued) toast('Message saved on this device. It will send when you have a connection.', 'warn');
      reload();
      onChanged();
    } catch (err: any) {
      toast(err.message || 'The message could not be sent.', 'danger');
    } finally {
      setSending(false);
    }
  };

  const attachPhoto = async (files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    const formData = new FormData();
    formData.append('files', file);
    if (conversation?.family_id) {
      formData.append('family_id', conversation.family_id);
      formData.append('category', 'Messages');
      formData.append('subcategory', `Shared in conversation`);
      formData.append('source', 'file');
      try {
        const result = await upload<any>('/api/media', formData);
        await send({ media_id: result.media[0].id, body: text || null });
      } catch (err: any) {
        toast(err.message, 'danger');
      }
      return;
    }
    const docForm = new FormData();
    docForm.append('files', file);
    docForm.append('title', `${user?.name} shared a photograph`);
    docForm.append('category', 'Messages');
    try {
      const result = await upload<any>('/api/workspace/documents', docForm);
      await send({ document_id: result.documents[0].id, body: text || null });
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  const attachDocument = async (files: FileList | null) => {
    if (!files?.length) return;
    const formData = new FormData();
    formData.append('files', files[0]);
    formData.append('title', files[0].name);
    formData.append('category', 'Messages');
    if (conversation?.family_id) formData.append('family_id', conversation.family_id);
    try {
      const result = await upload<any>('/api/workspace/documents', formData);
      await send({ document_id: result.documents[0].id, body: text || null });
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  if (loading && !conversation) return <div className="p-4 text-sm text-ink-500">Opening the conversation…</div>;
  if (!conversation) return <EmptyState icon="alert-triangle" title="Conversation not found" message="It may have been removed, or you are not part of it." />;

  const token = localStorage.getItem('fieldlink.token') || '';

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-ink-200 bg-white px-3 py-2.5">
        <button type="button" className="rounded-lg p-1.5 hover:bg-ink-100 lg:hidden" onClick={onBack} aria-label="Back to conversations">
          <Icon name="arrow-left" className="h-5 w-5" />
        </button>
        <Avatar name={conversation.display_title} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-ink-900">{conversation.display_title}</p>
          <p className="truncate text-[12px] text-ink-500">
            {conversation.kind === 'group' ? `${conversation.members?.length || 0} people · ` : ''}
            {conversation.members?.map((member: any) => member.name?.split(' ')[0]).filter(Boolean).join(', ')}
          </p>
        </div>
        {conversation.family ? (
          <Button size="sm" variant="ghost" icon="users" onClick={() => navigate(`/families/${conversation.family.id}`)}>Family</Button>
        ) : null}
        {conversation.event_id ? (
          <Button size="sm" variant="ghost" icon="calendar" onClick={() => navigate(`/planner/${conversation.event_id}`)}>Event</Button>
        ) : null}
        <button type="button" className="rounded-lg p-1.5 hover:bg-ink-100" onClick={() => setSearchOpen((open) => !open)} aria-label="Search this conversation">
          <Icon name="search" className="h-4 w-4" />
        </button>
        <button type="button" className="rounded-lg p-1.5 hover:bg-ink-100" onClick={() => setDetailOpen(true)} aria-label="Conversation details">
          <Icon name="more-vertical" className="h-4 w-4" />
        </button>
      </header>

      {searchOpen ? (
        <div className="border-b border-ink-100 p-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search in this conversation" />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-ink-50/60 px-3 py-4">
        {messages.map((message: any, index: number) => {
          const mine = message.sender_id === user?.id;
          const previous = messages[index - 1];
          const newDay = !previous || new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString();
          return (
            <div key={message.id}>
              {newDay ? (
                <p className="my-2 text-center text-[11px] font-medium uppercase tracking-wide text-ink-400">
                  {shortDate(message.created_at)}
                </p>
              ) : null}
              <div className={cx('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}>
                {!mine ? <Avatar name={message.sender_name} size={28} /> : null}
                <div className={cx('max-w-[78%] rounded-2xl px-3.5 py-2.5 shadow-card sm:max-w-[62%]', mine ? 'bg-brand-700 text-white' : 'bg-white text-ink-800')}>
                  {!mine && conversation.kind === 'group' ? (
                    <p className="mb-0.5 text-[11px] font-semibold text-brand-800">{message.sender_name}</p>
                  ) : null}
                  {message.body ? <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{message.body}</p> : null}
                  {message.media_url ? (
                    <a href={`${message.media_url}?token=${encodeURIComponent(token)}`} target="_blank" rel="noreferrer" className="mt-2 block">
                      <img src={`${message.media_url}?token=${encodeURIComponent(token)}`} alt="Shared photograph" className="max-h-60 rounded-lg border border-black/10 object-cover" />
                    </a>
                  ) : null}
                  {message.document_url ? (
                    <a href={`${message.document_url}?token=${encodeURIComponent(token)}`} target="_blank" rel="noreferrer" className={cx('mt-2 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px]', mine ? 'bg-white/15' : 'bg-ink-50')}>
                      <Icon name="file-text" className="h-4 w-4" />
                      {message.document_title || 'Document'}
                    </a>
                  ) : null}
                  <p className={cx('mt-1 text-right text-[10px]', mine ? 'text-white/70' : 'text-ink-400')}>
                    {clockTime(message.created_at)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        {!messages.length ? (
          <div className="py-10 text-center text-[13px] text-ink-500">
            {search ? 'No messages match that search.' : 'No messages yet. Say something friendly to start.'}
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="safe-bottom border-t border-ink-200 bg-white px-3 py-2.5">
        <div className="flex items-end gap-2">
          <button type="button" className="rounded-lg p-2 text-ink-500 hover:bg-ink-100" onClick={() => photoInput.current?.click()} aria-label="Send a photograph">
            <Icon name="camera" className="h-5 w-5" />
          </button>
          <button type="button" className="rounded-lg p-2 text-ink-500 hover:bg-ink-100" onClick={() => docInput.current?.click()} aria-label="Send a document">
            <Icon name="paperclip" className="h-5 w-5" />
          </button>
          <textarea
            className="input max-h-32 min-h-[44px] flex-1 resize-none py-2.5"
            rows={1}
            placeholder="Write a message…"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <Button variant="primary" icon="send" loading={sending} onClick={() => send()} aria-label="Send" />
        </div>
        <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={(event) => { attachPhoto(event.target.files); event.target.value = ''; }} />
        <input ref={docInput} type="file" className="hidden" onChange={(event) => { attachDocument(event.target.files); event.target.value = ''; }} />
      </div>

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Conversation details" size="sm">
        <div className="space-y-3">
          <div>
            <p className="section-title mb-2">People</p>
            <ul className="space-y-1.5">
              {(conversation.members || []).map((member: any) => (
                <li key={member.user_id} className="flex items-center gap-2.5">
                  <Avatar name={member.name} size={30} />
                  <span className="text-[13px] text-ink-700">{member.name}</span>
                  <span className="ml-auto text-[11px] text-ink-400">{member.role}</span>
                </li>
              ))}
            </ul>
          </div>
          {conversation.family ? (
            <div className="rounded-lg border border-ink-200 p-3">
              <p className="text-[12px] text-ink-500">Connected to family</p>
              <button type="button" className="mt-0.5 text-[14px] font-medium text-brand-800 hover:underline" onClick={() => navigate(`/families/${conversation.family.id}`)}>
                {conversation.family.code} — {conversation.family.name}
              </button>
            </div>
          ) : null}
          <p className="text-[12px] text-ink-500">Messages are kept in the organisation's workspace and are visible to everyone in the conversation.</p>
        </div>
      </Modal>
    </div>
  );
}

function NewConversationModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (conversation: any) => void }) {
  const { user, toast } = useApp();
  const { data } = useApi<any>(open ? '/api/auth/team' : null, { cacheKey: 'team' });
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!selected.length) {
      toast('Choose at least one person.', 'warn');
      return;
    }
    setSaving(true);
    try {
      const result = await post<any>('/api/messages/conversations', {
        user_ids: selected,
        kind: selected.length > 1 ? 'group' : 'direct',
        title: selected.length > 1 ? title || 'Group conversation' : null,
      }, { queueLabel: 'New conversation' });
      onCreated(result.conversation);
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
      title="New conversation"
      subtitle="Message one colleague, or choose several for a group."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="send" loading={saving} onClick={create}>Start conversation</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          {(data?.users || []).filter((member: any) => member.id !== user?.id).map((member: any) => (
            <label key={member.id} className="flex items-center gap-3 rounded-lg border border-ink-200 px-3 py-2.5">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={selected.includes(member.id)}
                onChange={(event) => setSelected((current) => (event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id)))}
              />
              <Avatar name={member.name} size={30} />
              <span className="text-[13px] text-ink-700">{member.name}</span>
              <span className="ml-auto text-[11px] text-ink-400">{member.job_title || member.role}</span>
            </label>
          ))}
        </div>
        {selected.length > 1 ? (
          <Field label="Group name">
            <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="For example: Tamale field team" />
          </Field>
        ) : null}
      </div>
    </Modal>
  );
}
