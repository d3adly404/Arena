/**
 * FieldLink — required media checklist templates.
 * Shared by the server (progress calculation, seeding) and the web client (Field Camera mini-app).
 *
 * Groups:
 *  - house      : photos of the dwelling / compound
 *  - people     : photos of the household
 *  - child_docs : one set per orphan child in the household
 *  - adult_docs : identity documents, only where required
 */

export const MEDIA_CHECKLIST = [
  {
    key: 'house',
    title: 'House',
    category: 'Housing',
    description: 'Photograph the home and the areas the family uses every day.',
    perChild: false,
    conditional: false,
    items: [
      { key: 'house_exterior', label: 'Exterior', subcategory: 'Exterior' },
      { key: 'house_front', label: 'Front View', subcategory: 'Front View' },
      { key: 'house_left', label: 'Left Side', subcategory: 'Left Side' },
      { key: 'house_right', label: 'Right Side', subcategory: 'Right Side' },
      { key: 'house_living', label: 'Living Room', subcategory: 'Living Room' },
      { key: 'house_kitchen', label: 'Kitchen / Cooking Area', subcategory: 'Kitchen / Cooking Area' },
      { key: 'house_bathroom', label: 'Bathroom', subcategory: 'Bathroom' },
      { key: 'house_porch', label: 'Porch', subcategory: 'Porch' },
      { key: 'house_other', label: 'Other Area', subcategory: 'Other Area' },
    ],
  },
  {
    key: 'people',
    title: 'People',
    category: 'People',
    description: 'Photographs of the household and the people we support.',
    perChild: false,
    conditional: false,
    items: [
      { key: 'people_household', label: 'Entire Household', subcategory: 'Entire Household' },
      { key: 'people_family', label: 'Family Photo', subcategory: 'Family Photo' },
      { key: 'people_volunteer', label: 'Family With Volunteer', subcategory: 'Family With Volunteer' },
      { key: 'people_guardian', label: 'Widow / Guardian', subcategory: 'Widow / Guardian' },
      { key: 'people_children', label: 'Orphans / Children', subcategory: 'Orphans / Children' },
    ],
  },
  {
    key: 'child_docs',
    title: 'Child Documents',
    category: 'Child Documents',
    description: 'Required for every orphan child in the household.',
    perChild: true,
    conditional: false,
    items: [
      { key: 'child_passport_photo', label: 'Passport Photograph', subcategory: 'Passport Photograph' },
      { key: 'child_birth_certificate', label: 'Birth Certificate', subcategory: 'Birth Certificate' },
      { key: 'child_health_insurance', label: 'Health Insurance Card', subcategory: 'Health Insurance Card' },
      { key: 'child_education_proof', label: 'Proof of Education', subcategory: 'Proof of Education' },
    ],
  },
  {
    key: 'adult_docs',
    title: 'Adult Documents',
    category: 'Adult Documents',
    description: 'Only needed where the programme requires identity documents.',
    perChild: false,
    conditional: true,
    items: [
      { key: 'adult_guardian_id', label: 'Widow / Guardian ID', subcategory: 'Widow / Guardian ID' },
      { key: 'adult_member_id', label: 'Household Member ID', subcategory: 'Household Member ID' },
      { key: 'adult_other', label: 'Other Relevant Document', subcategory: 'Other Relevant Document' },
    ],
  },
];

/**
 * Build the concrete checklist for one family.
 * Child document items are expanded once per orphan child.
 */
export function buildChecklist(family, members = []) {
  const orphans = members.filter((m) => m.is_orphan).sort((a, b) => (a.age || 99) - (b.age || 99));
  const groups = MEDIA_CHECKLIST.map((group) => {
    const instances = group.perChild ? (orphans.length ? orphans : []) : [null];
    const items = [];
    for (const child of instances) {
      for (const item of group.items) {
        items.push({
          key: child ? `${item.key}:${child.id}` : item.key,
          baseKey: item.key,
          label: child ? `${child.name} — ${item.label}` : item.label,
          subcategory: item.subcategory,
          category: group.category,
          groupKey: group.key,
          childId: child ? child.id : null,
          childName: child ? child.name : null,
          required: !group.conditional,
        });
      }
    }
    return { ...group, items, orphanCount: orphans.length };
  });
  return groups;
}

export function checklistProgress(groups) {
  const required = groups.flatMap((g) => g.items).filter((i) => i.required);
  return { required: required.length, total: groups.flatMap((g) => g.items).length };
}

export const MEDIA_CATEGORIES = MEDIA_CHECKLIST.map((g) => g.category).concat(['General']);

export const MEDIA_STATUS = {
  captured: { label: 'Captured', tone: 'good' },
  uploaded: { label: 'Uploaded', tone: 'good' },
  not_available: { label: 'Not Available', tone: 'warn' },
};
