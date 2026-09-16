/**
 * FieldLink — the workspace router.
 * Every mini-app lives inside one shell: HOME · FAMILIES · FORMS · TASKS · PLANNER ·
 * MESSAGES · MEDIA/CAMERA · DOCUMENTS · NOTIFICATIONS · ADMIN.
 */
import React, { useEffect } from 'react';
import { AppProvider, useApp } from './lib/store';
import { useHashRoute } from './lib/hooks';
import { get } from './lib/api';
import { Layout } from './components/Layout';
import { AuthScreen } from './components/AuthScreen';
import { CallProvider } from './components/CallDialog';
import { ConfirmHost, ToastHost } from './components/Feedback';
import { HomeScreen } from './screens/Home';
import { FamiliesScreen } from './screens/Families';
import { FamilyDetailScreen } from './screens/FamilyDetail';
import { FormsScreen } from './screens/Forms';
import { FormScreen } from './screens/FormScreen';
import { TasksScreen } from './screens/Tasks';
import { PlannerScreen } from './screens/Planner';
import { EventScreen } from './screens/EventScreen';
import { MessagesScreen } from './screens/Messages';
import { NotificationsScreen } from './screens/Notifications';
import { DocumentsScreen } from './screens/Documents';
import { MediaScreen } from './screens/Media';
import { CameraScreen } from './screens/Camera';
import { TeamScreen } from './screens/Team';
import { ReportsScreen } from './screens/Reports';
import { AdminScreen } from './screens/Admin';
import { SettingsScreen } from './screens/Settings';
import { MoreScreen } from './screens/More';
import { SearchScreen } from './screens/Search';
import { Icon } from './components/Icon';

type Route = { name: string; segments: string[]; query: Record<string, string> };

const TITLES: Record<string, { title: string; subtitle?: string }> = {
  home: { title: 'Home', subtitle: 'Your work today, wherever you are' },
  families: { title: 'Families', subtitle: 'Every household the organisation supports' },
  forms: { title: 'Forms', subtitle: 'Family assessments, drafts and supervisor review' },
  tasks: { title: 'Tasks', subtitle: 'Follow-ups, reminders and everything promised' },
  planner: { title: 'Planner', subtitle: 'Visits, meetings, distributions and deadlines' },
  messages: { title: 'Messages', subtitle: 'Conversations with your team' },
  notifications: { title: 'Notifications', subtitle: 'What needs your attention' },
  documents: { title: 'Documents', subtitle: 'Letters, reports and records' },
  media: { title: 'Media', subtitle: 'Family photographs and documents captured in the field' },
  camera: { title: 'Field Camera', subtitle: 'Required photographs for a family visit' },
  team: { title: 'Team', subtitle: 'Officers, volunteers and supervisors' },
  reports: { title: 'Reports', subtitle: 'Programme summary' },
  admin: { title: 'Administration', subtitle: 'People, records, imports and activity' },
  settings: { title: 'Settings', subtitle: 'Your account, devices and sync' },
  more: { title: 'All mini-apps', subtitle: 'Everything in the FieldLink workspace' },
  search: { title: 'Search', subtitle: 'Families, tasks, documents and events' },
};

function Screen({ route }: { route: Route }) {
  const { user } = useApp();
  const [first, second] = route.segments;
  switch (route.name) {
    case 'families':
      return second ? <FamilyDetailScreen familyId={second} query={route.query} /> : <FamiliesScreen query={route.query} />;
    case 'forms':
      return second ? <FormScreen formId={second} query={route.query} /> : <FormsScreen query={route.query} />;
    case 'planner':
      return second ? <EventScreen eventId={second} /> : <PlannerScreen query={route.query} />;
    case 'messages':
      return <MessagesScreen conversationId={second} query={route.query} />;
    case 'tasks':
      return <TasksScreen query={route.query} />;
    case 'notifications':
      return <NotificationsScreen />;
    case 'documents':
      return <DocumentsScreen query={route.query} />;
    case 'media':
      return <MediaScreen query={route.query} />;
    case 'camera':
      return <CameraScreen query={route.query} />;
    case 'team':
      return <TeamScreen />;
    case 'reports':
      return user?.role === 'officer' || user?.role === 'volunteer' ? <HomeScreen /> : <ReportsScreen />;
    case 'admin':
      return user?.role === 'admin' ? <AdminScreen /> : <HomeScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'more':
      return <MoreScreen />;
    case 'search':
      return <SearchScreen query={route.query} />;
    default:
      return <HomeScreen />;
  }
}

function BadgeSync() {
  const { user, sync } = useApp();
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      try {
        const status = await get<any>('/api/sync/status');
        if (cancelled) return;
        sessionStorage.setItem('badge:notifications', String(status.pending_for_you?.notifications || 0));
        sessionStorage.setItem('badge:tasks', String(status.pending_for_you?.tasks || 0));
        sessionStorage.setItem('badge:forms', String((status.pending_for_you?.forms_to_review || 0) + (status.pending_for_you?.corrections || 0)));
        sessionStorage.setItem('badge:messages', String(0));
      } catch {
        /* the badge simply keeps its previous value while offline */
      }
    };
    load();
    const timer = window.setInterval(load, 45000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user, sync.revision, sync.refreshKey]);
  return null;
}

function Workspace() {
  const route = useHashRoute();
  const { user, loading } = useApp();
  const meta = TITLES[route.name] || { title: 'FieldLink' };

  if (loading && !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink-100">
        <div className="flex flex-col items-center gap-3 text-ink-500">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-700 text-white">
            <Icon name="life-buoy" className="h-6 w-6" />
          </span>
          <p className="text-sm">Opening your FieldLink workspace…</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  return (
    <>
      <BadgeSync />
      <Layout title={meta.title} subtitle={route.name === 'families' && route.segments[1] ? undefined : meta.subtitle} currentName={route.name}>
        <Screen route={route} />
      </Layout>
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <CallProvider>
        <Workspace />
        <ToastHost />
        <ConfirmHost />
      </CallProvider>
    </AppProvider>
  );
}
