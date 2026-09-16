/**
 * FieldLink — click-to-call.
 *
 * FieldLink never replaces the phone's calling system. Tapping a saved number opens the
 * normal dialer, and when the officer comes back the workspace asks what happened so the
 * outcome is recorded on the family, a note can be added, and a follow-up task created.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { post } from '../lib/api';
import { Button, Field, Modal, Note, Select, cx } from './ui';
import { Icon } from './Icon';
import { telHref, dueLabel, dateInput } from '../lib/format';

export const CALL_OUTCOMES = [
  { key: 'answered', label: 'Answered', tone: 'good', icon: 'check-circle' },
  { key: 'no_answer', label: 'No Answer', tone: 'warn', icon: 'x-circle' },
  { key: 'unavailable', label: 'Number Unavailable', tone: 'warn', icon: 'cloud-off' },
  { key: 'wrong_number', label: 'Wrong Number', tone: 'danger', icon: 'alert-triangle' },
  { key: 'call_later', label: 'Call Again Later', tone: 'info', icon: 'clock' },
] as const;

type CallTarget = {
  familyId?: string | null;
  familyName?: string;
  familyCode?: string;
  contactName?: string | null;
  phone: string;
  context?: string;
};

type CallContextValue = {
  openCall: (target: CallTarget) => void;
};

const CallContext = createContext<CallContextValue>({ openCall: () => undefined });
export const useCall = () => useContext(CallContext);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<CallTarget | null>(null);
  const openCall = useCallback((next: CallTarget) => setTarget(next), []);
  const value = useMemo(() => ({ openCall }), [openCall]);
  return (
    <CallContext.Provider value={value}>
      {children}
      <CallDialog target={target} onClose={() => setTarget(null)} />
    </CallContext.Provider>
  );
}

function CallDialog({ target, onClose }: { target: CallTarget | null; onClose: () => void }) {
  const { toast } = useApp();
  const [step, setStep] = useState<'confirm' | 'outcome' | 'details'>('confirm');
  const [outcome, setOutcome] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [createTask, setCreateTask] = useState(false);
  const [taskDue, setTaskDue] = useState(() => dateInput(new Date(Date.now() + 86400000).toISOString()));
  const [taskTitle, setTaskTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep('confirm');
    setOutcome(null);
    setNote('');
    setCreateTask(false);
    setTaskTitle('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const placeCall = () => {
    const href = telHref(target?.phone);
    // Hand the call to the device. When the officer returns, FieldLink asks for the outcome.
    if (href) window.location.href = href;
    setStep('outcome');
  };

  const chooseOutcome = (key: string) => {
    setOutcome(key);
    setCreateTask(key !== 'answered');
    const guardian = target?.contactName || target?.familyName || 'the guardian';
    if (!taskTitle) {
      setTaskTitle(key === 'wrong_number' ? `Find the correct number for ${guardian}` : `Call ${guardian} again`);
    }
    setStep('details');
  };

  const save = async () => {
    if (!outcome) return;
    setSaving(true);
    try {
      if (target?.familyId) {
        const result = await post<{ queued?: boolean }>(`/api/families/${target.familyId}/calls`, {
          phone: target.phone,
          contact_name: target.contactName,
          status: outcome,
          note: note || null,
          create_follow_up: createTask,
          follow_up_title: createTask ? taskTitle : undefined,
          follow_up_detail: createTask ? `Call on ${taskDue}. ${note || ''}`.trim() : undefined,
          follow_up_due_at: createTask ? new Date(`${taskDue}T09:00:00`).toISOString() : undefined,
          called_at: new Date().toISOString(),
        }, { queueLabel: `Call ${target.phone} — ${outcome}` });
        toast(
          result?.queued
            ? 'Call saved on this device. It will sync when you have a connection.'
            : createTask
              ? 'Call recorded and follow-up task created.'
              : 'Call recorded on the family.',
          result?.queued ? 'warn' : 'good',
        );
      } else {
        toast('Call noted. Open the family record to save it against someone.', 'info');
      }
      close();
    } catch (err: any) {
      toast(err.message || 'The call could not be saved.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const guardian = target?.contactName || target?.familyName || 'this contact';

  return (
    <Modal
      open={Boolean(target)}
      onClose={close}
      title={step === 'confirm' ? 'Call this number?' : step === 'outcome' ? 'Call follow-up' : 'Add note'}
      subtitle={target ? `${target.contactName || target.familyName || ''}${target.familyCode ? ` · ${target.familyCode}` : ''}` : undefined}
      size="sm"
      footer={
        step === 'confirm' ? (
          <>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button variant="primary" icon="phone" onClick={placeCall}>Call</Button>
          </>
        ) : step === 'details' ? (
          <>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={save} icon="check">Save call</Button>
          </>
        ) : null
      }
    >
      {step === 'confirm' && target ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-700">
            <Icon name="phone-call" className="h-7 w-7" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-wide text-ink-900">{target.phone}</p>
            <p className="mt-1 text-[13px] text-ink-500">
              FieldLink will open the normal dialer on this device.
              {target.context ? ` ${target.context}` : ''}
            </p>
          </div>
          <Note tone="info" icon="info">
            When you come back to FieldLink you will be asked what happened, so the outcome is recorded for {guardian}.
          </Note>
        </div>
      ) : null}

      {step === 'outcome' ? (
        <div className="space-y-4">
          <Note tone="warn" icon="phone-call">
            Welcome back. Was the call answered?
          </Note>
          <div className="grid gap-2">
            {CALL_OUTCOMES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => chooseOutcome(option.key)}
                className="flex items-center gap-3 rounded-lg border border-ink-200 bg-white px-3.5 py-3 text-left text-[14px] font-medium text-ink-800 transition hover:border-brand-600 hover:bg-brand-50/40"
              >
                <Icon name={option.icon} className="h-5 w-5 text-ink-500" />
                {option.label}
                <Icon name="chevron-right" className="ml-auto h-4 w-4 text-ink-400" />
              </button>
            ))}
          </div>
          <button type="button" className="text-[13px] text-ink-500 underline" onClick={close}>
            I did not make the call
          </button>
        </div>
      ) : null}

      {step === 'details' && outcome ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2.5 text-[13px] text-ink-700">
            <Icon name="phone" className="h-4 w-4 text-ink-500" />
            <span className="font-medium">{target?.phone}</span>
            <span className="ml-auto font-semibold">
              {CALL_OUTCOMES.find((option) => option.key === outcome)?.label}
            </span>
          </div>
          <Field label="Note" hint="For example: Guardian asked us to call again on Thursday.">
            <textarea className="input min-h-[92px]" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What was discussed?" />
          </Field>
          <label className="flex items-start gap-3 rounded-lg border border-ink-200 p-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={createTask} onChange={(event) => setCreateTask(event.target.checked)} />
            <span>
              <span className="block text-[14px] font-medium text-ink-800">Create follow-up task</span>
              <span className="block text-xs text-ink-500">The task appears in Tasks, Planner and Notifications.</span>
            </span>
          </label>
          {createTask ? (
            <div className="grid gap-3 rounded-lg bg-ink-50 p-3">
              <Field label="Task">
                <input className="input" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
              </Field>
              <Field label="Call again on">
                <input type="date" className="input" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} />
              </Field>
              <p className="text-xs text-ink-500">
                {taskDue ? `${dueLabel(new Date(`${taskDue}T09:00:00`).toISOString())} · assigned to you` : 'Choose a date'}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

/** A phone number that can be tapped from anywhere in the workspace. */
export function PhoneLink({
  phone, familyId, familyName, familyCode, contactName, className, showIcon = true, context,
}: {
  phone?: string | null; familyId?: string | null; familyName?: string; familyCode?: string; contactName?: string | null;
  className?: string; showIcon?: boolean; context?: string;
}) {
  const { openCall } = useCall();
  if (!phone) return <span className={cx('text-ink-400', className)}>No number saved</span>;
  return (
    <button
      type="button"
      onClick={() => openCall({ phone, familyId, familyName, familyCode, contactName, context })}
      className={cx('inline-flex items-center gap-1.5 font-medium text-brand-800 underline decoration-brand-300 decoration-1 underline-offset-2 hover:text-brand-900', className)}
    >
      {showIcon ? <Icon name="phone" className="h-3.5 w-3.5" /> : null}
      {phone}
    </button>
  );
}

export function CallOutcomeBadge({ status }: { status?: string | null }) {
  const option = CALL_OUTCOMES.find((item) => item.key === status);
  if (!option) return <span className="text-ink-500">{status || 'Not recorded'}</span>;
  const tones: Record<string, string> = {
    good: 'bg-emerald-50 text-emerald-800',
    warn: 'bg-amber-50 text-amber-900',
    danger: 'bg-rose-50 text-rose-800',
    info: 'bg-sky-50 text-sky-800',
  };
  return <span className={cx('badge', tones[option.tone])}>{option.label}</span>;
}

/** Call history for a family: date, officer, number, outcome and note. */
export function CallHistory({ calls, compact = false }: { calls: any[]; compact?: boolean }) {
  if (!calls?.length) {
    return <p className="px-4 py-5 text-[13px] text-ink-500">No calls recorded yet. Tap a saved number to start.</p>;
  }
  return (
    <ul className={compact ? 'divide-y divide-ink-100' : 'divide-y divide-ink-100'}>
      {calls.map((call) => (
        <li key={call.id} className="flex items-start gap-3 px-4 py-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-500">
            <Icon name="phone-call" className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CallOutcomeBadge status={call.status} />
              <span className="text-[13px] font-medium text-ink-700">{call.contact_name || 'Contact'}</span>
              <span className="text-[12px] text-ink-400">{new Date(call.called_at).toLocaleString()}</span>
            </div>
            <p className="mt-1 text-[12px] text-ink-500">
              {call.phone} · recorded by {call.officer_name || 'an officer'}
              {call.duration_seconds ? ` · ${Math.round(call.duration_seconds / 60)} min` : ''}
            </p>
            {call.note ? <p className="mt-1.5 rounded-md bg-ink-50 px-2.5 py-2 text-[13px] text-ink-700">{call.note}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
