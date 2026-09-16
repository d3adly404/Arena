/**
 * FieldLink — Reports.
 * A calm, printable summary of the programme: families by region, assessment progress,
 * call outcomes, officer workload and media coverage.
 */
import React from 'react';
import { useApp } from '../lib/store';
import { useApi } from '../lib/hooks';
import { Badge, Button, Card, CardHeader, EmptyState, Progress } from '../components/ui';
import { Icon } from '../components/Icon';
import { relativeTime } from '../lib/format';
import { FORM_STATUS } from '@shared/formTemplate';

export function ReportsScreen() {
  const { sync } = useApp();
  const { data, loading, error } = useApi<any>('/api/workspace/reports/summary', { cacheKey: 'reports', deps: [sync.revision] });

  if (loading && !data) return <Card className="m-4 card-pad text-sm text-ink-500">Building the report…</Card>;
  if (error) {
    return (
      <Card className="m-4">
        <EmptyState icon="lock" title="Reports are for supervisors and administrators" message={error} />
      </Card>
    );
  }
  if (!data) return null;

  const regions = data.by_region || [];
  const maxFamilies = Math.max(1, ...regions.map((row: any) => row.families));
  const forms = data.forms_by_status || [];
  const totalForms = Math.max(1, forms.reduce((sum: number, row: any) => sum + row.n, 0));
  const calls = data.call_outcomes || [];
  const totalCalls = Math.max(1, calls.reduce((sum: number, row: any) => sum + row.n, 0));

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-500">
          Everything below comes from the live workspace — no separate reporting database.
        </p>
        <Button icon="printer" onClick={() => window.print()}>Print or save as PDF</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Assessments" value={totalForms} hint={`${forms.find((row: any) => row.status === 'approved')?.n || 0} approved`} icon="clipboard-list" tone="#0f766e" />
        <SummaryCard label="Open tasks" value={data.tasks?.open || 0} hint={`${data.tasks?.overdue || 0} overdue`} icon="check-square" tone="#3730a3" />
        <SummaryCard label="Calls recorded" value={totalCalls} hint={`${calls.find((row: any) => row.status === 'answered')?.n || 0} answered`} icon="phone-call" tone="#3f6212" />
        <SummaryCard label="Documents" value={data.documents || 0} hint="letters, records and reports" icon="folder" tone="#b45309" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Families by region" subtitle="Including how many are urgent and how many orphan children are supported" icon="map" />
          <div className="space-y-3 px-4 py-3.5 sm:px-5">
            {regions.map((row: any) => (
              <div key={row.region}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-ink-800">{row.region}</span>
                  <span className="text-ink-500">
                    {row.families} families · {row.urgent} urgent · {row.orphans} orphan children
                  </span>
                </div>
                <Progress className="mt-1.5" value={(row.families / maxFamilies) * 100} tone={row.urgent ? '#b45309' : '#0f766e'} />
              </div>
            ))}
            {!regions.length ? <p className="text-[13px] text-ink-500">No families recorded yet.</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Assessment progress" subtitle="Where the family assessments stand" icon="bar-chart" />
          <div className="space-y-2 px-4 py-3.5 sm:px-5">
            {forms.map((row: any) => (
              <div key={row.status} className="flex items-center gap-3">
                <Badge tone={FORM_STATUS[row.status]?.tone || 'neutral'}>{FORM_STATUS[row.status]?.label || row.status}</Badge>
                <Progress value={(row.n / totalForms) * 100} className="flex-1" />
                <span className="w-8 shrink-0 text-right text-[13px] font-medium text-ink-700">{row.n}</span>
              </div>
            ))}
            {!forms.length ? <p className="text-[13px] text-ink-500">No assessments yet.</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Call outcomes" subtitle="Every saved number can be called from the workspace" icon="phone" />
          <div className="space-y-2 px-4 py-3.5 sm:px-5">
            {calls.map((row: any) => (
              <div key={row.status} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-[13px] capitalize text-ink-700">{String(row.status).replace(/_/g, ' ')}</span>
                <Progress value={(row.n / totalCalls) * 100} className="flex-1" tone={row.status === 'answered' ? '#0f766e' : '#94a3b8'} />
                <span className="w-8 shrink-0 text-right text-[13px] font-medium text-ink-700">{row.n}</span>
              </div>
            ))}
            {!calls.length ? <p className="text-[13px] text-ink-500">No calls recorded yet.</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Photographs by category" subtitle="Media captured in the field" icon="camera" />
          <div className="grid grid-cols-2 gap-2 px-4 py-3.5 sm:px-5">
            {(data.media_by_category || []).map((row: any) => (
              <div key={row.category} className="rounded-lg border border-ink-200 px-3 py-2">
                <p className="text-[12px] text-ink-500">{row.category}</p>
                <p className="text-[18px] font-semibold text-ink-800">{row.n}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Officer workload" subtitle="Families, tasks, photographs and assessments per person" icon="users" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-b border-ink-200 bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Person</th>
                <th className="px-4 py-2 font-semibold">Role</th>
                <th className="px-4 py-2 font-semibold">Families</th>
                <th className="px-4 py-2 font-semibold">Open tasks</th>
                <th className="px-4 py-2 font-semibold">Assessments</th>
                <th className="px-4 py-2 font-semibold">Photographs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {(data.officer_load || []).map((row: any) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 font-medium text-ink-800">{row.name}</td>
                  <td className="px-4 py-2 capitalize text-ink-600">{row.role}</td>
                  <td className="px-4 py-2 text-ink-700">{row.families}</td>
                  <td className="px-4 py-2 text-ink-700">{row.open_tasks}</td>
                  <td className="px-4 py-2 text-ink-700">{row.assessments}</td>
                  <td className="px-4 py-2 text-ink-700">{row.photos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Recent imports" subtitle="Work brought in from outside FieldLink" icon="upload" />
        {(data.imports || []).length ? (
          <ul className="divide-y divide-ink-100">
            {data.imports.map((batch: any) => (
              <li key={batch.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <Icon name="database" className="h-4 w-4 text-ink-400" />
                <span className="min-w-0 flex-1 truncate text-ink-700">{batch.filename}</span>
                <span className="text-ink-500">{batch.created_count} created · {batch.skipped_count} skipped</span>
                <span className="text-ink-400">{relativeTime(batch.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-[13px] text-ink-500">No imports yet.</p>
        )}
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, hint, icon, tone }: { label: string; value: number; hint?: string; icon: string; tone: string }) {
  return (
    <Card className="card-pad">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</span>
        <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${tone}14`, color: tone }}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-1.5 text-2xl font-semibold text-ink-900">{value}</p>
      {hint ? <p className="text-[12px] text-ink-500">{hint}</p> : null}
    </Card>
  );
}
