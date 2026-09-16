/**
 * FieldLink — completing one family assessment.
 *
 * The paper form is broken into its fourteen sections rather than one enormous page, so an
 * officer on a phone always knows where they are. Answers save automatically: the officer
 * can lose signal, close the phone, and continue later from the laptop.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { useApi, navigate } from '../lib/hooks';
import { FieldInput, sectionAnswerCount } from '../components/FormFields';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Modal, Progress, cx } from '../components/ui';
import { Icon } from '../components/Icon';
import { patch, post } from '../lib/api';
import { relativeTime, shortDate } from '../lib/format';
import { PhoneLink } from '../components/CallDialog';
import { FORM_STATUS } from '@shared/formTemplate';

export function FormScreen({ formId, query }: { formId: string; query: Record<string, string> }) {
  const { user, sync, toast, confirm } = useApp();
  const { data, loading, error, reload } = useApi<any>(`/api/forms/${formId}`, { cacheKey: `form:${formId}`, deps: [formId, sync.revision] });

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [activeSection, setActiveSection] = useState<string>('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [sectionMenu, setSectionMenu] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(query.review === '1');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionText, setCorrectionText] = useState('');
  const [correctionSection, setCorrectionSection] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const initialized = useRef(false);
  const firstRender = useRef(true);

  const form = data?.form;
  const template = data?.template;
  const sections = data?.sections || [];
  const comments = data?.comments || [];
  const revisions = data?.revisions || [];
  const family = data?.family;
  const canEdit = data?.can_edit && form && ['draft', 'corrections', 'submitted', 'under_review'].includes(form.status) && form.status !== 'approved';
  const canReview = data?.can_review;

  // Load the saved answers once, then keep them locally.
  useEffect(() => {
    if (!form || initialized.current) return;
    setAnswers(form.data || {});
    setActiveSection(form.current_section || template?.sections?.[0]?.key || '');
    initialized.current = true;
  }, [form, template]);

  // Autosave: wait until the officer pauses, then save quietly.
  useEffect(() => {
    if (!initialized.current || !canEdit) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setDirty(true);
    const timer = window.setTimeout(() => { void saveDraft(); }, 1400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  const saveDraft = async (options: { silent?: boolean } = {}) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const result = await patch<any>(`/api/forms/${formId}`, { data: answers, current_section: activeSection }, { queueLabel: `Save ${form?.template_key} draft` });
      setDirty(false);
      setQueued(Boolean(result?.queued));
      setSavedAt(new Date().toISOString());
      if (!options.silent && result?.queued) toast('Saved on this device. It will sync when you have a connection.', 'warn');
    } catch (err: any) {
      toast(err.message || 'The draft could not be saved.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const sectionList = template?.sections || [];
  const activeIndex = Math.max(0, sectionList.findIndex((section: any) => section.key === activeSection));
  const active = sectionList[activeIndex];

  const missingForSection = useMemo(() => {
    const map: Record<string, any[]> = {};
    (data?.missing_required || []).forEach((item: any) => {
      map[item.section] = [...(map[item.section] || []), item];
    });
    return map;
  }, [data]);

  const overall = useMemo(() => {
    if (!template) return { filled: 0, total: 0, percent: 0 };
    let filled = 0;
    let total = 0;
    sectionList.forEach((section: any) => {
      const counts = sectionAnswerCount(section, answers);
      filled += counts.filled;
      total += counts.total;
    });
    return { filled, total, percent: total ? Math.round((filled / total) * 100) : 0 };
  }, [answers, sectionList, template]);

  const submit = async () => {
    if (!canEdit) return;
    const missing = data?.missing_required || [];
    const ok = await confirm({
      title: 'Send this assessment to your supervisor?',
      message: missing.length
        ? `There are still ${missing.length} required answers missing. Fill them in first — the form will show you which section they are in.`
        : 'Your supervisor will be able to review it, comment on it and ask for corrections. You can still read it afterwards.',
      confirmLabel: 'Send for review',
    });
    if (!ok) return;
    if (missing.length) {
      setActiveSection(missing[0].section);
      toast(`Still missing: ${missing[0].label}`, 'warn');
      return;
    }
    setSubmitting(true);
    try {
      await saveDraft({ silent: true });
      await post(`/api/forms/${formId}/submit`, { data: answers }, { queueLabel: `Submit assessment for ${family?.name || 'family'}` });
      toast('Assessment submitted. Your supervisor has been notified.', 'good');
      reload();
    } catch (err: any) {
      toast(err.message || 'The assessment could not be submitted.', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const review = async (action: string, note?: string, sectionKey?: string) => {
    try {
      const result = await post<any>(`/api/forms/${formId}/review`, { action, note, section_key: sectionKey });
      toast(
        action === 'approve' ? 'Assessment approved.' : action === 'request_corrections' ? 'Corrections requested. The officer has been notified.' : 'Review started.',
        'good',
      );
      if (result?.task_id) toast('A correction task was added to the officer’s tasks.', 'info');
      setReviewOpen(false);
      setCorrectionOpen(false);
      setCorrectionText('');
      reload();
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  const addComment = async () => {
    if (!commentText.trim()) return;
    try {
      await post(`/api/forms/${formId}/comments`, { body: commentText, section_key: activeSection }, { queueLabel: 'Add a comment' });
      setCommentText('');
      setCommentOpen(false);
      toast('Comment added.', 'good');
      reload();
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  if (loading && !form) return <Card className="m-4 card-pad text-sm text-ink-500">Opening the assessment…</Card>;
  if (error && !form) return <EmptyState icon="alert-triangle" title="Could not open this assessment" message={error} action={<Button onClick={() => navigate('/forms')}>Back to forms</Button>} />;
  if (!form || !template) return null;

  const statusMeta = FORM_STATUS[form.status] || { label: form.status, tone: 'neutral', hint: '' };
  const sectionComments = comments.filter((comment: any) => comment.section_key === activeSection && !comment.resolved);
  const openComments = comments.filter((comment: any) => !comment.resolved);
  const saveLabel = saving ? 'Saving…' : dirty ? 'Unsaved changes' : queued ? 'Saved on this device' : savedAt ? `Saved ${relativeTime(savedAt)}` : 'All changes saved';

  return (
    <div className="pb-32 lg:pb-6">
      {/* header */}
      <div className="border-b border-ink-200 bg-white px-3 pb-3 pt-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
              <span className="font-mono text-[11px] font-semibold text-ink-500">{family?.code}</span>
              {openComments.length ? <Badge tone="danger" icon="message-circle">{openComments.length} open comment{openComments.length === 1 ? '' : 's'}</Badge> : null}
              <span className={cx('inline-flex items-center gap-1.5 text-[12px]', queued ? 'text-amber-700' : dirty ? 'text-ink-500' : 'text-emerald-700')}>
                <Icon name={queued ? 'cloud-off' : saving ? 'refresh' : 'check'} className={cx('h-3.5 w-3.5', saving && 'animate-spin')} />
                {saveLabel}
              </span>
            </div>
            <h2 className="mt-1 text-lg font-semibold text-ink-900">{family?.name}</h2>
            <p className="mt-0.5 text-[12px] text-ink-500">
              {template.title} · started {shortDate(form.created_at)}
              {family?.guardian_name ? ` · guardian ${family.guardian_name}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {family?.phone ? <PhoneLink phone={family.phone} familyId={family.id} familyName={family.name} familyCode={family.code} contactName={family.guardian_name || family.head_name} /> : null}
            <Button icon="check" onClick={() => saveDraft()} disabled={!canEdit}>Save draft</Button>
            {canEdit ? (
              <Button variant="primary" icon="send" loading={submitting} onClick={submit}>Submit for review</Button>
            ) : null}
            {canReview && (form.status === 'submitted' || form.status === 'under_review') ? (
              <Button variant="primary" icon="check-square" onClick={() => setReviewOpen(true)}>Review</Button>
            ) : null}
            {form.status === 'corrections' && form.review_note ? (
              <Button icon="alert-circle" onClick={() => { setCorrectionSection(openComments[0]?.section_key || activeSection); setCorrectionOpen(true); }}>See corrections</Button>
            ) : null}
            <Button icon="git-branch" onClick={() => setHistoryOpen(true)}>History</Button>
            <Button icon="printer" onClick={() => window.print()}>Print</Button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Progress value={overall.percent} showLabel />
          <span className="shrink-0 text-[12px] text-ink-500">{overall.filled} of {overall.total} answers</span>
        </div>
        {statusMeta.hint ? <p className="mt-2 text-[12px] text-ink-500">{statusMeta.hint}</p> : null}
        {form.status === 'corrections' && form.review_note ? (
          <div className="mt-2 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
            <Icon name="alert-circle" className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Your supervisor asked for a correction</p>
              <p className="mt-0.5">{form.review_note}</p>
              <p className="mt-1 text-[12px]">Fix the section, then submit again.</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex gap-4 p-3 sm:p-5">
        {/* section rail (desktop) */}
        <aside className="hidden w-[240px] shrink-0 lg:block">
          <div className="sticky top-[132px] space-y-1">
            {sectionList.map((section: any, index: number) => {
              const counts = sectionAnswerCount(section, answers);
              const complete = counts.filled >= counts.total;
              const sectionMissing = (missingForSection[section.key] || []).length;
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => { setActiveSection(section.key); }}
                  className={cx(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition',
                    activeSection === section.key ? 'bg-white text-ink-900 shadow-card' : 'text-ink-600 hover:bg-white/70',
                  )}
                >
                  <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold', complete ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-200 text-ink-600')}>
                    {complete ? <Icon name="check" className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{section.short || section.title}</span>
                  {sectionMissing ? <span className="rounded-full bg-rose-100 px-1.5 text-[10px] font-semibold text-rose-700">{sectionMissing}</span> : null}
                </button>
              );
            })}
          </div>
        </aside>

        {/* the section being completed */}
        <div className="min-w-0 flex-1 space-y-4">
          <Card>
            <CardHeader
              title={`${activeIndex + 1}. ${active.title}`}
              subtitle={active.description}
              action={
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" icon="message-circle" onClick={() => setCommentOpen(true)}>Comment</Button>
                  <Button size="sm" variant="ghost" icon="list" className="lg:hidden" onClick={() => setSectionMenu(true)}>Sections</Button>
                </div>
              }
            />

            {sectionComments.length ? (
              <div className="space-y-2 border-b border-ink-100 bg-amber-50/60 px-4 py-3">
                {sectionComments.map((comment: any) => (
                  <div key={comment.id} className="flex items-start gap-2.5">
                    <Avatar name={comment.author_name} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-ink-800">
                        {comment.author_name} {comment.kind === 'correction' ? '· correction requested' : ''}
                        <span className="ml-2 font-normal text-ink-400">{relativeTime(comment.created_at)}</span>
                      </p>
                      <p className="text-[13px] text-ink-700">{comment.body}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await patch(`/api/forms/comments/${comment.id}`, { resolved: true });
                        toast('Comment marked as done.', 'good');
                        reload();
                      }}
                    >
                      Resolve
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
              {(active.fields || []).map((field: any) => {
                const error = (missingForSection[active.key] || []).find((item: any) => item.key === field.key);
                return (
                  <div key={field.key} className={field.type === 'repeat' || field.type === 'textarea' || field.type === 'note' || field.type === 'multiselect' || field.type === 'gps' ? 'sm:col-span-2' : ''}>
                    <FieldInput
                      field={field}
                      value={answers[field.key]}
                      onChange={(next) => setAnswers((current) => ({ ...current, [field.key]: next }))}
                      error={error ? 'This answer is still needed.' : undefined}
                      disabled={!canEdit}
                    />
                  </div>
                );
              })}
            </div>
          </Card>

          {/* previous / next */}
          <div className="flex items-center justify-between gap-2">
            <Button
              icon="chevron-left"
              disabled={activeIndex === 0}
              onClick={() => setActiveSection(sectionList[activeIndex - 1].key)}
            >
              Previous
            </Button>
            <span className="text-[12px] text-ink-500">
              Section {activeIndex + 1} of {sectionList.length}
            </span>
            {activeIndex < sectionList.length - 1 ? (
              <Button
                iconRight="chevron-right"
                onClick={() => setActiveSection(sectionList[activeIndex + 1].key)}
              >
                Next section
              </Button>
            ) : (
              <Button variant="primary" icon="send" onClick={submit} disabled={!canEdit}>Submit for review</Button>
            )}
          </div>

          {comments.length ? (
            <Card>
              <CardHeader title="Comments and corrections" subtitle={`${openComments.length} still open`} icon="message-circle" action={<Button size="sm" variant="ghost" icon="plus" onClick={() => setCommentOpen(true)}>Add comment</Button>} />
              <ul className="divide-y divide-ink-100">
                {comments.map((comment: any) => (
                  <li key={comment.id} className="flex items-start gap-3 px-4 py-3">
                    <Avatar name={comment.author_name} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink-800">
                        {comment.author_name}
                        {comment.section_key ? (
                          <span className="ml-2 text-[12px] font-normal text-ink-500">
                            on {sectionList.find((section: any) => section.key === comment.section_key)?.short || comment.section_key}
                          </span>
                        ) : null}
                        <span className="ml-2 text-[12px] font-normal text-ink-400">{relativeTime(comment.created_at)}</span>
                      </p>
                      <p className="mt-0.5 text-[13px] text-ink-700">{comment.body}</p>
                    </div>
                    {comment.resolved ? (
                      <Badge tone="good">Resolved</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await patch(`/api/forms/comments/${comment.id}`, { resolved: true });
                          reload();
                        }}
                      >
                        Resolve
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      {/* mobile section chooser */}
      <Modal open={sectionMenu} onClose={() => setSectionMenu(false)} title="Sections" subtitle="Tap a section to open it" size="sm">
        <div className="space-y-1">
          {sectionList.map((section: any, index: number) => {
            const counts = sectionAnswerCount(section, answers);
            const complete = counts.filled >= counts.total;
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => { setActiveSection(section.key); setSectionMenu(false); }}
                className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px]', activeSection === section.key ? 'bg-brand-50 font-medium text-brand-900' : 'hover:bg-ink-50')}
              >
                <span className={cx('grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold', complete ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-200 text-ink-600')}>
                  {complete ? <Icon name="check" className="h-3.5 w-3.5" /> : index + 1}
                </span>
                {section.title}
                <span className="ml-auto text-[12px] text-ink-400">{counts.filled}/{counts.total}</span>
              </button>
            );
          })}
        </div>
      </Modal>

      {/* comment */}
      <Modal
        open={commentOpen}
        onClose={() => setCommentOpen(false)}
        title="Add a comment"
        subtitle={`On section ${activeIndex + 1}: ${active.title}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCommentOpen(false)}>Cancel</Button>
            <Button variant="primary" icon="send" onClick={addComment}>Add comment</Button>
          </>
        }
      >
        <Field label="Comment">
          <textarea className="input min-h-[110px]" value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Ask a question or explain something in this section" />
        </Field>
      </Modal>

      {/* review */}
      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Supervisor review"
        subtitle={`${family?.name} · ${family?.code}`}
        size="md"
        footer={<Button variant="ghost" onClick={() => setReviewOpen(false)}>Close</Button>}
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-ink-50 p-3 text-[13px] text-ink-700">
            <p>
              Submitted by <span className="font-medium">{data?.form?.created_by_name || 'an officer'}</span>
              {form.submitted_at ? ` on ${shortDate(form.submitted_at)}` : ''}. Progress {form.progress || 0}%.
            </p>
            <p className="mt-1 text-ink-500">Read the sections, then approve, or ask for corrections with a clear note.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button icon="eye" onClick={() => { review('start_review'); }}>Mark as under review</Button>
            <Button variant="primary" icon="check-circle" onClick={() => review('approve', 'Approved after review.')}>Approve assessment</Button>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-[13px] font-semibold text-amber-900">Request corrections</p>
            <p className="mt-0.5 text-[12px] text-amber-800">The officer is notified straight away and a correction task is created.</p>
            <Field label="Section" className="mt-2">
              <select className="input" value={correctionSection} onChange={(event) => setCorrectionSection(event.target.value)}>
                <option value="">Whole assessment</option>
                {sectionList.map((section: any) => (
                  <option key={section.key} value={section.key}>{section.title}</option>
                ))}
              </select>
            </Field>
            <Field label="What needs correcting?" className="mt-2" required>
              <textarea className="input min-h-[90px]" value={correctionText} onChange={(event) => setCorrectionText(event.target.value)} placeholder="For example: the guardian phone number recorded here does not reach her." />
            </Field>
            <Button className="mt-2" variant="danger" icon="alert-circle" onClick={() => review('request_corrections', correctionText, correctionSection || undefined)}>
              Send correction request
            </Button>
          </div>
        </div>
      </Modal>

      {/* corrections summary */}
      <Modal open={correctionOpen} onClose={() => setCorrectionOpen(false)} title="Corrections requested" subtitle={family?.name} size="sm" footer={<Button variant="primary" onClick={() => setCorrectionOpen(false)}>Understood</Button>}>
        <div className="space-y-3">
          {openComments.length ? openComments.map((comment: any) => (
            <div key={comment.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-[12px] font-semibold text-amber-900">
                {sectionList.find((section: any) => section.key === comment.section_key)?.title || 'Whole assessment'}
              </p>
              <p className="mt-1 text-[13px] text-amber-900">{comment.body}</p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                iconRight="arrow-right"
                onClick={() => {
                  if (comment.section_key) setActiveSection(comment.section_key);
                  setCorrectionOpen(false);
                }}
              >
                Go to section
              </Button>
            </div>
          )) : <p className="text-[13px] text-ink-600">{form.review_note || 'Open the comments to see what needs attention.'}</p>}
        </div>
      </Modal>

      {/* revision history */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Revision history" subtitle="Every change is kept, so the record can always be explained." size="md" footer={<Button variant="ghost" onClick={() => setHistoryOpen(false)}>Close</Button>}>
        <ol className="space-y-3">
          {revisions.map((revision: any) => (
            <li key={revision.id} className="flex items-start gap-3">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-100 text-[11px] font-semibold text-ink-600">
                {revision.revision}
              </span>
              <div className="min-w-0 flex-1 border-b border-ink-100 pb-3">
                <p className="text-[13px] font-medium text-ink-800">
                  {revision.change_note || 'Draft saved'}
                  <span className="ml-2 font-normal text-ink-500">by {revision.author_name || 'an officer'}</span>
                </p>
                <p className="text-[12px] text-ink-400">{new Date(revision.created_at).toLocaleString()} · status {FORM_STATUS[revision.status]?.label || revision.status}</p>
              </div>
            </li>
          ))}
          {!revisions.length ? <p className="text-[13px] text-ink-500">No revisions recorded yet.</p> : null}
        </ol>
      </Modal>

      {/* sticky save bar on phones */}
      {canEdit ? (
        <div className="safe-bottom fixed inset-x-0 bottom-[57px] z-20 flex items-center gap-2 border-t border-ink-200 bg-white/95 px-3 py-2 backdrop-blur lg:hidden">
          <span className={cx('flex-1 text-[12px]', queued ? 'text-amber-700' : 'text-ink-500')}>{saveLabel}</span>
          <Button size="sm" icon="check" onClick={() => saveDraft()}>Save draft</Button>
          <Button size="sm" variant="primary" icon="send" onClick={submit}>Submit</Button>
        </div>
      ) : null}
    </div>
  );
}
