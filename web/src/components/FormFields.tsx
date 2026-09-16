/**
 * FieldLink — the field renderer for assessment sections.
 * Every answer type used in the family assessment: text, choices, numbers, dates, money,
 * a signature line, GPS and repeating lists (children, household members).
 */
import React, { useState } from 'react';
import { Icon } from './Icon';
import { Button, Field, MultiSelect, RadioGroup, Select, cx } from './ui';

export type TemplateField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  hint?: string;
  options?: string[];
  rows?: number;
  min?: number;
  itemLabel?: string;
  fields?: TemplateField[];
  computed?: string;
  text?: string;
  defaultFrom?: string;
};

export function FieldInput({
  field, value, onChange, error, disabled,
}: {
  field: TemplateField;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  disabled?: boolean;
}) {
  if (field.type === 'note') {
    return (
      <div className="rounded-lg border border-ink-200 bg-ink-50 p-3 text-[13px] leading-relaxed text-ink-700">
        {field.text || field.label}
      </div>
    );
  }

  if (field.type === 'repeat') {
    return <RepeatField field={field} value={value} onChange={onChange} disabled={disabled} />;
  }

  if (field.type === 'gps') {
    return <GpsField field={field} value={value} onChange={onChange} disabled={disabled} />;
  }

  if (field.type === 'multiselect') {
    return (
      <Field label={field.label} hint={field.hint} required={field.required} error={error}>
        <MultiSelect options={field.options || []} value={Array.isArray(value) ? value : []} onChange={onChange} />
      </Field>
    );
  }

  if (field.type === 'radio') {
    const options = field.options || [];
    return (
      <Field label={field.label} hint={field.hint} required={field.required} error={error}>
        <RadioGroup
          options={options}
          value={value || ''}
          onChange={onChange}
          columns={options.length > 3 ? 2 : options.length}
        />
      </Field>
    );
  }

  if (field.type === 'select') {
    return (
      <Field label={field.label} hint={field.hint} required={field.required} error={error}>
        <Select value={value ?? ''} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
          <option value="">Choose…</option>
          {(field.options || []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </Select>
      </Field>
    );
  }

  if (field.type === 'textarea') {
    return (
      <Field label={field.label} hint={field.hint} required={field.required} error={error}>
        <textarea
          className="input min-h-[92px] leading-relaxed"
          rows={field.rows || 3}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
      </Field>
    );
  }

  if (field.type === 'signature') {
    return (
      <Field label={field.label} hint={field.hint || 'Type the person’s full name. It is recorded as their signature.'} required={field.required} error={error}>
        <input
          className="input font-serif text-lg italic"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
      </Field>
    );
  }

  const inputType = field.type === 'money' || field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'tel' ? 'tel' : 'text';
  return (
    <Field
      label={field.label}
      hint={field.hint}
      required={field.required}
      error={error}
      className={field.type === 'textarea' ? 'sm:col-span-2' : undefined}
    >
      <div className="relative">
        <input
          className={cx('input', field.type === 'money' && 'pl-12')}
          type={inputType}
          inputMode={field.type === 'tel' ? 'tel' : field.type === 'money' || field.type === 'number' ? 'decimal' : undefined}
          step={field.type === 'money' ? '0.01' : undefined}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
        {field.type === 'money' ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-medium text-ink-400">GHS</span> : null}
      </div>
    </Field>
  );
}

function RepeatField({ field, value, onChange, disabled }: { field: TemplateField; value: any; onChange: (next: any[]) => void; disabled?: boolean }) {
  const items: any[] = Array.isArray(value) ? value : [];
  const [expanded, setExpanded] = useState<number | null>(items.length ? 0 : null);

  const update = (index: number, key: string, next: any) => {
    const copy = items.map((item, position) => (position === index ? { ...item, [key]: next } : item));
    onChange(copy);
  };

  const add = () => {
    const blank: Record<string, any> = {};
    (field.fields || []).forEach((sub) => { blank[sub.key] = sub.type === 'multiselect' ? [] : ''; });
    onChange([...items, blank]);
    setExpanded(items.length);
  };

  const remove = (index: number) => {
    onChange(items.filter((_, position) => position !== index));
    setExpanded(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-medium text-ink-700">{field.label}</p>
          <p className="text-xs text-ink-500">
            {items.length ? `${items.length} recorded` : `No ${(field.itemLabel || 'entry').toLowerCase()} added yet`}
          </p>
        </div>
        <Button size="sm" icon="plus" onClick={add} disabled={disabled}>
          Add {field.itemLabel?.toLowerCase() || 'entry'}
        </Button>
      </div>

      {items.map((item, index) => {
        const open = expanded === index;
        const title = item.name || item.full_name || `${field.itemLabel || 'Entry'} ${index + 1}`;
        return (
          <div key={index} className="overflow-hidden rounded-xl border border-ink-200 bg-white">
            <button
              type="button"
              onClick={() => setExpanded(open ? null : index)}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-ink-50"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-semibold text-brand-800">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-ink-800">{title}</span>
                <span className="block truncate text-[12px] text-ink-500">
                  {[item.age ? `${item.age} years` : null, item.gender, item.class_level || item.relation || item.orphan_status].filter(Boolean).join(' · ') || 'Tap to complete'}
                </span>
              </span>
              {item.is_orphan === 'Yes' ? <span className="badge bg-sky-50 text-sky-800">Orphan</span> : null}
              <Icon name={open ? 'chevron-up' : 'chevron-down'} className="h-4 w-4 text-ink-400" />
            </button>
            {open ? (
              <div className="grid gap-3 border-t border-ink-100 px-3.5 py-3.5 sm:grid-cols-2">
                {(field.fields || []).map((sub) => (
                  <FieldInput key={sub.key} field={{ ...sub, label: sub.label }} value={item[sub.key]} onChange={(next) => update(index, sub.key, next)} disabled={disabled} />
                ))}
                <div className="sm:col-span-2">
                  <Button variant="danger" size="sm" icon="trash" onClick={() => remove(index)} disabled={disabled}>
                    Remove {field.itemLabel?.toLowerCase() || 'entry'}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ink-300 px-3 py-4 text-center text-[13px] text-ink-500">
          Add each {(field.itemLabel || 'entry').toLowerCase()} so the household record stays complete.
        </p>
      ) : null}
    </div>
  );
}

function GpsField({ field, value, onChange, disabled }: { field: TemplateField; value: any; onChange: (next: any) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capture = () => {
    if (!navigator.geolocation) {
      setError('This device cannot share its location.');
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
          accuracy: Math.round(position.coords.accuracy),
          recorded_at: new Date().toISOString(),
        });
        setBusy(false);
      },
      (err) => {
        setError(err.message || 'Location was not available.');
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  return (
    <Field label={field.label} hint={field.hint || 'Recorded during the visit so other officers can find the home.'} error={error || undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <Button icon="map-pin" onClick={capture} loading={busy} disabled={disabled}>
          {value?.lat ? 'Update location' : 'Record location'}
        </Button>
        {value?.lat ? (
          <span className="rounded-lg bg-ink-50 px-3 py-2 font-mono text-[12px] text-ink-700">
            {value.lat}, {value.lng}
            {value.accuracy ? ` · ±${value.accuracy}m` : ''}
          </span>
        ) : null}
      </div>
    </Field>
  );
}

export function sectionAnswerCount(section: any, data: Record<string, any>) {
  const filled = (section.fields || []).filter((field: TemplateField) => {
    if (field.type === 'repeat') return Array.isArray(data[field.key]) && data[field.key].length > 0;
    const value = data[field.key];
    return value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && !value.length);
  }).length;
  return { filled, total: (section.fields || []).length };
}
