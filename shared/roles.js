/**
 * FieldLink — roles and permissions.
 * Kept deliberately simple: four roles, one clear matrix. Enforced on the server,
 * mirrored in the interface so people only see the buttons they are allowed to use.
 */

export const ROLES = {
  admin: {
    label: 'Administrator',
    description: 'Manages the organisation, users, imports and all records.',
    rank: 4,
  },
  supervisor: {
    label: 'Supervisor',
    description: 'Reviews submitted forms, plans work and oversees officers and volunteers.',
    rank: 3,
  },
  officer: {
    label: 'Field Officer',
    description: 'Visits families, completes forms, takes photographs and records calls.',
    rank: 2,
  },
  volunteer: {
    label: 'Volunteer',
    description: 'Supports visits for assigned families and can send in assessments for review.',
    rank: 1,
  },
};

/**
 * capability -> roles allowed
 * An officer can only touch the families they are assigned to (checked separately).
 */
export const CAPABILITIES = {
  'family.view.all': ['admin', 'supervisor', 'officer'],
  'family.view.assigned': ['admin', 'supervisor', 'officer', 'volunteer'],
  'family.create': ['admin', 'supervisor', 'officer'],
  'family.edit': ['admin', 'supervisor', 'officer'],
  'family.delete': ['admin'],
  'form.create': ['admin', 'supervisor', 'officer', 'volunteer'],
  'form.edit': ['admin', 'supervisor', 'officer', 'volunteer'],
  'form.review': ['admin', 'supervisor'],
  'form.comment': ['admin', 'supervisor', 'officer', 'volunteer'],
  'media.upload': ['admin', 'supervisor', 'officer', 'volunteer'],
  'media.delete': ['admin', 'supervisor', 'officer'],
  'media.view.sensitive': ['admin', 'supervisor', 'officer'],
  'task.create': ['admin', 'supervisor', 'officer', 'volunteer'],
  'task.assign.others': ['admin', 'supervisor'],
  'event.create': ['admin', 'supervisor', 'officer'],
  'event.manage': ['admin', 'supervisor'],
  'message.send': ['admin', 'supervisor', 'officer', 'volunteer'],
  'document.upload': ['admin', 'supervisor', 'officer'],
  'document.delete': ['admin', 'supervisor'],
  'call.log': ['admin', 'supervisor', 'officer', 'volunteer'],
  'user.manage': ['admin'],
  'import.run': ['admin', 'supervisor'],
  'audit.view': ['admin'],
  'report.view': ['admin', 'supervisor'],
};

export function can(role, capability) {
  const allowed = CAPABILITIES[capability];
  if (!allowed) return false;
  return allowed.includes(role);
}

/** Family visibility: volunteers and officers only see families they are assigned to. */
export function canSeeAllFamilies(role) {
  return role === 'admin' || role === 'supervisor';
}
