/**
 * FieldLink navigation model.
 * One list drives the desktop sidebar, the mobile bottom bar and the "More" launcher, so
 * a mini-app can never be reachable on one kind of device and missing on another.
 */
export type NavItem = {
  key: string;
  label: string;
  path: string;
  icon: string;
  group: 'main' | 'work' | 'communication' | 'files' | 'organisation' | 'administration';
  mobile?: 'primary' | 'more';
  badgeKey?: 'messages' | 'notifications' | 'tasks' | 'forms';
  description?: string;
  roles?: string[];
};

export const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', path: '/', icon: 'home', group: 'main', mobile: 'primary', description: "Today's work at a glance" },
  { key: 'families', label: 'Families', path: '/families', icon: 'users', group: 'work', mobile: 'primary', description: 'Family records and visits' },
  { key: 'forms', label: 'Forms', path: '/forms', icon: 'clipboard-list', group: 'work', mobile: 'more', badgeKey: 'forms', description: 'Family assessments with supervisor review' },
  { key: 'tasks', label: 'Tasks', path: '/tasks', icon: 'check-square', group: 'work', mobile: 'primary', badgeKey: 'tasks', description: 'Follow-ups and reminders' },
  { key: 'planner', label: 'Planner', path: '/planner', icon: 'calendar', group: 'work', mobile: 'more', description: 'Visits, meetings, events and calendar' },
  { key: 'messages', label: 'Messages', path: '/messages', icon: 'message-circle', group: 'communication', mobile: 'primary', badgeKey: 'messages', description: 'Talk to the team' },
  { key: 'notifications', label: 'Notifications', path: '/notifications', icon: 'bell', group: 'communication', mobile: 'more', badgeKey: 'notifications', description: 'Everything that needs your attention' },
  { key: 'documents', label: 'Documents', path: '/documents', icon: 'folder', group: 'files', mobile: 'more', description: 'Letters, reports and files' },
  { key: 'media', label: 'Media', path: '/media', icon: 'images', group: 'files', mobile: 'more', description: 'Family photographs and galleries' },
  { key: 'camera', label: 'Camera', path: '/camera', icon: 'camera', group: 'files', mobile: 'more', description: 'Required photograph checklist for a visit' },
  { key: 'team', label: 'Team', path: '/team', icon: 'user-check', group: 'organisation', description: 'Officers, volunteers and supervisors' },
  { key: 'reports', label: 'Reports', path: '/reports', icon: 'bar-chart', group: 'organisation', roles: ['admin', 'supervisor'], description: 'Programme summary' },
  { key: 'admin', label: 'Admin', path: '/admin', icon: 'shield', group: 'administration', roles: ['admin'], description: 'People, imports and activity' },
  { key: 'settings', label: 'Settings', path: '/settings', icon: 'settings', group: 'administration', mobile: 'more', description: 'Your account, devices and sync' },
];

export const NAV_GROUPS: Array<{ key: NavItem['group']; label: string | null }> = [
  { key: 'main', label: null },
  { key: 'work', label: 'My work' },
  { key: 'communication', label: 'Communication' },
  { key: 'files', label: 'Files' },
  { key: 'organisation', label: 'Organisation' },
  { key: 'administration', label: 'Administration' },
];

export function visibleNav(role?: string) {
  return NAV_ITEMS.filter((item) => !item.roles || !role || item.roles.includes(role));
}

export function mobilePrimary(role?: string) {
  return visibleNav(role).filter((item) => item.mobile === 'primary');
}

export function mobileMore(role?: string) {
  return visibleNav(role).filter((item) => item.mobile === 'more');
}

export function titleFor(name: string, segments: string[]) {
  const item = NAV_ITEMS.find((candidate) => candidate.path === `/${name}`);
  if (item) return item.label;
  const map: Record<string, string> = {
    '': 'Home',
    notifications: 'Notifications',
    media: 'Media',
    camera: 'Field Camera',
    documents: 'Documents',
    team: 'Team',
    reports: 'Reports',
    admin: 'Administration',
    settings: 'Settings',
    more: 'All mini-apps',
    search: 'Search',
  };
  return map[name] || 'FieldLink';
}
