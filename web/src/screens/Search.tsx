/**
 * FieldLink — workspace search.
 * One field that looks through families, tasks, assessments, documents, media and events,
 * because in a small team a person's name is often the fastest way to find everything.
 */
import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/store';
import { useApi, navigate } from '../lib/hooks';
import { Badge, Button, Card, CardHeader, EmptyState, SearchInput } from '../components/ui';
import { Icon } from '../components/Icon';
import { PhoneLink } from '../components/CallDialog';
import { shortDate } from '../lib/format';
import { FORM_STATUS } from '@shared/formTemplate';

export function SearchScreen({ query }: { query: Record<string, string> }) {
  const { sync } = useApp();
  const [term, setTerm] = useState(query.q || '');
  const [submitted, setSubmitted] = useState(query.q || '');

  useEffect(() => {
    setTerm(query.q || '');
    setSubmitted(query.q || '');
  }, [query.q]);

  const { data, loading } = useApi<any>(submitted ? `/api/workspace/search?q=${encodeURIComponent(submitted)}` : null, {
    cacheKey: `search:${submitted}`,
    deps: [submitted, sync.revision],
  });

  const groups = [
    { key: 'families', label: 'Families', icon: 'users', items: data?.families || [] },
    { key: 'tasks', label: 'Tasks', icon: 'check-square', items: data?.tasks || [] },
    { key: 'forms', label: 'Assessments', icon: 'clipboard-list', items: data?.forms || [] },
    { key: 'events', label: 'Events', icon: 'calendar', items: data?.events || [] },
    { key: 'documents', label: 'Documents', icon: 'folder', items: data?.documents || [] },
    { key: 'media', label: 'Media', icon: 'camera', items: data?.media || [] },
  ];
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(term.trim());
          navigate(`/search?q=${encodeURIComponent(term.trim())}`, { replace: true });
        }}
        className="flex gap-2"
      >
        <SearchInput value={term} onChange={setTerm} placeholder="Search families, tasks, assessments, documents, events" className="flex-1" />
        <Button variant="primary" type="submit" icon="search">Search</Button>
      </form>

      {!submitted ? (
        <Card>
          <EmptyState icon="search" title="Search the whole workspace" message="Type a family name, a family code, a guardian, a task or a place. FieldLink looks everywhere at once." />
        </Card>
      ) : null}

      {submitted && loading && !total ? <Card className="card-pad text-sm text-ink-500">Searching…</Card> : null}
      {submitted && !loading && !total ? (
        <Card>
          <EmptyState icon="search" title={`Nothing found for “${submitted}”`} message="Try the family code (for example NOR-001), the guardian name or the community." />
        </Card>
      ) : null}

      {groups.filter((group) => group.items.length).map((group) => (
        <Card key={group.key}>
          <CardHeader title={group.label} subtitle={`${group.items.length} match${group.items.length === 1 ? '' : 'es'}`} icon={group.icon} />
          <ul className="divide-y divide-ink-100">
            {group.items.map((item: any) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                {group.key === 'families' ? (
                  <>
                    <div className="min-w-0 flex-1">
                      <button type="button" className="text-left text-[14px] font-medium text-ink-800 hover:underline" onClick={() => navigate(`/families/${item.id}`)}>
                        {item.name}
                      </button>
                      <p className="text-[12px] text-ink-500">
                        <span className="font-mono">{item.code}</span> · {item.community || item.district || 'No location'}
                        {item.urgency ? ` · ${item.urgency} urgency` : ''}
                      </p>
                    </div>
                    <PhoneLink phone={item.phone} familyId={item.id} familyName={item.name} familyCode={item.code} />
                  </>
                ) : null}

                {group.key === 'tasks' ? (
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate('/tasks')}>
                    <span className="block text-[14px] font-medium text-ink-800">{item.title}</span>
                    <span className="block text-[12px] text-ink-500">
                      {item.status} {item.due_at ? `· due ${shortDate(item.due_at)}` : ''} {item.family_code ? `· ${item.family_code}` : ''}
                    </span>
                  </button>
                ) : null}

                {group.key === 'forms' ? (
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate(`/forms/${item.id}`)}>
                    <span className="block text-[14px] font-medium text-ink-800">{item.family_name}</span>
                    <span className="block text-[12px] text-ink-500">
                      <span className="font-mono">{item.family_code}</span> · updated {shortDate(item.updated_at)}
                    </span>
                  </button>
                ) : null}

                {group.key === 'events' ? (
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate(`/planner/${item.id}`)}>
                    <span className="block text-[14px] font-medium text-ink-800">{item.title}</span>
                    <span className="block text-[12px] text-ink-500">{shortDate(item.starts_at)} {item.location ? `· ${item.location}` : ''}</span>
                  </button>
                ) : null}

                {group.key === 'documents' ? (
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate('/documents')}>
                    <span className="block text-[14px] font-medium text-ink-800">{item.title}</span>
                    <span className="block text-[12px] text-ink-500">{item.category || 'General'}</span>
                  </button>
                ) : null}

                {group.key === 'media' ? (
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate(`/media?family=${item.family_id}`)}>
                    <span className="block text-[14px] font-medium text-ink-800">{item.subcategory || item.category}</span>
                    <span className="block text-[12px] text-ink-500">
                      <span className="font-mono">{item.family_code}</span> · {item.category}
                    </span>
                  </button>
                ) : null}

                {group.key === 'forms' && item.status ? (
                  <Badge tone={FORM_STATUS[item.status]?.tone || 'neutral'}>{FORM_STATUS[item.status]?.label || item.status}</Badge>
                ) : null}
                <Icon name="chevron-right" className="h-4 w-4 shrink-0 text-ink-300" />
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
