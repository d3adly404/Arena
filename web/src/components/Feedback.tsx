/** FieldLink — toasts and confirmation dialogs, used everywhere for plain-language feedback. */
import React from 'react';
import { useApp } from '../lib/store';
import { Button, cx } from './ui';
import { Icon } from './Icon';

export function ToastHost() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;
  const tones: Record<string, { bg: string; icon: string }> = {
    info: { bg: 'bg-ink-900', icon: 'info' },
    good: { bg: 'bg-emerald-700', icon: 'check-circle' },
    warn: { bg: 'bg-amber-600', icon: 'alert-triangle' },
    danger: { bg: 'bg-rose-700', icon: 'alert-circle' },
  };
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismissToast(toast.id)}
          className={cx('animate-in pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-xl px-3.5 py-3 text-left text-white shadow-raised', tones[toast.tone].bg)}
        >
          <Icon name={tones[toast.tone].icon} className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium leading-snug">{toast.message}</span>
            {toast.detail ? <span className="mt-0.5 block text-[12px] text-white/75">{toast.detail}</span> : null}
          </span>
          <Icon name="x" className="h-3.5 w-3.5 opacity-70" />
        </button>
      ))}
    </div>
  );
}

export function ConfirmHost() {
  const { confirmState, resolveConfirm } = useApp();
  if (!confirmState) return null;
  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-ink-900/40" onClick={() => resolveConfirm(false)} />
      <div className="animate-in relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-raised">
        <h2 className="text-[15px] font-semibold text-ink-900">{confirmState.title}</h2>
        {confirmState.message ? <p className="mt-2 text-[13px] leading-relaxed text-ink-600">{confirmState.message}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => resolveConfirm(false)}>{confirmState.cancelLabel || 'Cancel'}</Button>
          <Button variant={confirmState.danger ? 'danger' : 'primary'} onClick={() => resolveConfirm(true)}>
            {confirmState.confirmLabel || 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}
