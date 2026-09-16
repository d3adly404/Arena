/**
 * FieldLink — signing in.
 * One account. The same account works on the phone in the field and on the laptop at the
 * office, and both see the same workspace.
 */
import React, { useState } from 'react';
import { useApp } from '../lib/store';
import { Button, Field, Note, cx } from './ui';
import { Icon } from './Icon';
import { RequestFailed, describeDevice } from '../lib/api';

const DEMO_ACCOUNTS = [
  { email: 'officer@fieldlink.org', label: 'Mohammed Abdulai', role: 'Field Officer' },
  { email: 'supervisor@fieldlink.org', label: 'Rashid Bello', role: 'Supervisor' },
  { email: 'admin@fieldlink.org', label: 'Amina Yusuf', role: 'Administrator' },
  { email: 'volunteer@fieldlink.org', label: 'Sadia Musah', role: 'Volunteer' },
];

export function AuthScreen() {
  const { signIn, toast } = useApp();
  const [email, setEmail] = useState('officer@fieldlink.org');
  const [password, setPassword] = useState('fieldlink');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      toast('Welcome back to FieldLink.', 'good');
    } catch (err) {
      setError(err instanceof RequestFailed ? err.message : 'Sign in failed. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-ink-100 lg:flex-row">
      <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-ink-900 px-6 py-8 text-white lg:px-12 lg:py-14">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-700">
            <Icon name="life-buoy" className="h-6 w-6" />
          </span>
          <div>
            <p className="text-[17px] font-semibold tracking-[0.18em]">FIELDLINK</p>
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/60">The digital workplace for humanitarian field work</p>
          </div>
        </div>

        <div className="my-10 max-w-xl space-y-6">
          <h1 className="text-2xl font-semibold leading-snug lg:text-[32px]">
            One account. One database. One workspace. All devices sync.
          </h1>
          <p className="text-[15px] leading-relaxed text-white/75">
            Visit a family with your phone, complete the assessment, take the required photographs and record the calls.
            Open FieldLink on your laptop and it is all there — ready for your supervisor to review.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: 'clipboard-list', title: 'Forms', text: 'Family assessments in 14 clear sections, saved as you go.' },
              { icon: 'camera', title: 'Field camera', text: 'A checklist that stops required photographs being missed.' },
              { icon: 'phone-call', title: 'Click to call', text: 'Call any saved number and record the outcome.' },
              { icon: 'calendar', title: 'Planner', text: 'Visits, meetings, distributions and reminders.' },
            ].map((feature) => (
              <div key={feature.title} className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                <Icon name={feature.icon} className="h-5 w-5 text-brand-300" />
                <p className="mt-2 text-[13px] font-semibold">{feature.title}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-white/65">{feature.text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-white/45">
          FieldLink is a workspace, not a phone system or a browser. Your work stays inside the organisation’s own database.
        </p>
      </div>

      <div className="flex w-full flex-col justify-center px-5 py-10 lg:w-[480px] lg:px-10">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-ink-900">Sign in</h2>
            <p className="mt-1 text-[13px] text-ink-500">Use your FieldLink account. You are signing in from {describeDevice()}.</p>
          </div>

          <Field label="Email address" required>
            <input
              className="input"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>

          <Field label="Password" required>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-400 hover:bg-ink-100"
              >
                <Icon name="eye" className="h-4 w-4" />
              </button>
            </div>
          </Field>

          {error ? <Note tone="danger" icon="alert-triangle">{error}</Note> : null}

          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} icon="log-in">
            Sign in
          </Button>

          <div className="rounded-xl border border-ink-200 bg-white p-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-500">Demonstration accounts</p>
            <p className="mt-1 text-[12px] text-ink-500">
              This workspace is filled with realistic field data. Tap an account to sign in, password <span className="font-mono">fieldlink</span>.
            </p>
            <div className="mt-2 grid gap-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword('fieldlink');
                  }}
                  className={cx(
                    'flex items-center justify-between rounded-lg border px-3 py-2 text-left text-[13px] transition',
                    email === account.email ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:border-ink-300',
                  )}
                >
                  <span>
                    <span className="block font-medium text-ink-800">{account.label}</span>
                    <span className="block text-[11px] text-ink-500">{account.email}</span>
                  </span>
                  <span className="text-[11px] font-medium text-ink-500">{account.role}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="text-center text-[11px] text-ink-400">
            Signed in on a phone? Set the same account on your laptop and your work is already there.
          </p>
        </form>
      </div>
    </div>
  );
}
