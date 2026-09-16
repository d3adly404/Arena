/**
 * FieldLink — demonstration workspace.
 *
 * Creates an organisation that looks like a real one: officers, volunteers, supervisors,
 * families in the field, assessments in every stage of review, required photographs,
 * calls with outcomes, follow-up tasks, a planner with NGO events, conversations and
 * notifications.
 *
 *   npm run seed          (adds missing demonstration data)
 *   npm run seed --reset  (wipes the database and rebuilds it)
 */
import fs from 'node:fs';
import path from 'node:path';
import { db, run, all, get, nowIso, UPLOAD_DIR } from './db.js';
import { id, hashPassword } from './util.js';

const RESET = process.argv.includes('--reset');
const today = new Date();
const day = (offset, hour = 9, minute = 0) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
const iso = (offsetDays, hour = 9, minute = 0) => day(offsetDays, hour, minute);
const dateOnly = (offsetDays) => iso(offsetDays).slice(0, 10);

if (RESET) {
  for (const table of [
    'sync_mutations', 'audit_log', 'import_batches', 'notifications', 'documents', 'messages',
    'conversation_members', 'conversations', 'event_reminders', 'event_participants', 'events',
    'calls', 'tasks', 'media', 'form_comments', 'form_revisions', 'forms', 'family_notes',
    'family_members', 'families', 'sessions', 'users',
  ]) {
    db.exec(`DELETE FROM ${table}`);
  }
  for (const file of fs.readdirSync(UPLOAD_DIR)) {
    if (file.startsWith('demo-')) fs.unlinkSync(path.join(UPLOAD_DIR, file));
  }
}

function placeholderPhoto(filename, title, subtitle, tone = '#0f766e') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${tone}" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.95"/>
    </linearGradient>
  </defs>
  <rect width="960" height="640" fill="url(#g)"/>
  <g fill="#ffffff" opacity="0.14">
    <rect x="60" y="340" width="240" height="240" rx="10"/>
    <rect x="330" y="290" width="200" height="290" rx="10"/>
    <rect x="560" y="380" width="330" height="200" rx="10"/>
    <path d="M0 340 L260 200 L520 340 Z"/>
    <path d="M300 290 L470 180 L640 290 Z"/>
    <circle cx="820" cy="130" r="58"/>
  </g>
  <text x="60" y="110" font-family="Segoe UI, Roboto, Helvetica, Arial" font-size="42" font-weight="600" fill="#ffffff">${title}</text>
  <text x="60" y="164" font-family="Segoe UI, Roboto, Helvetica, Arial" font-size="26" fill="#e2e8f0">${subtitle}</text>
  <text x="60" y="612" font-family="Segoe UI, Roboto, Helvetica, Arial" font-size="20" fill="#cbd5e1">FieldLink demonstration photograph</text>
</svg>`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), svg);
  return { file: filename, mime: 'image/svg+xml', size: Buffer.byteLength(svg) };
}

/* --------------------------------------------------------------- accounts */

const USERS = [
  {
    id: 'u-admin', name: 'Amina Yusuf', email: 'admin@fieldlink.org', phone: '+233 24 000 1001',
    role: 'admin', job_title: 'Programme Director', site: 'Accra HQ', password: 'fieldlink', tone: '#3730a3',
  },
  {
    id: 'u-supervisor', name: 'Rashid Bello', email: 'supervisor@fieldlink.org', phone: '+233 24 000 1002',
    role: 'supervisor', job_title: 'Field Supervisor — Northern', site: 'Tamale', password: 'fieldlink', tone: '#0f766e',
  },
  {
    id: 'u-officer', name: 'Mohammed Abdulai', email: 'officer@fieldlink.org', phone: '+233 24 000 1003',
    role: 'officer', job_title: 'Field Officer', site: 'Tamale', password: 'fieldlink', tone: '#b45309',
  },
  {
    id: 'u-officer2', name: 'Fatima Nuhu', email: 'fatima@fieldlink.org', phone: '+233 24 000 1004',
    role: 'officer', job_title: 'Field Officer', site: 'Bolgatanga', password: 'fieldlink', tone: '#7c3aed',
  },
  {
    id: 'u-volunteer', name: 'Sadia Musah', email: 'volunteer@fieldlink.org', phone: '+233 24 000 1005',
    role: 'volunteer', job_title: 'Community Volunteer', site: 'Sakasaka', password: 'fieldlink', tone: '#be123c',
  },
];

for (const user of USERS) {
  if (get('SELECT id FROM users WHERE id = ?', [user.id])) continue;
  run(
    `INSERT INTO users (id, name, email, phone, role, job_title, site, password_hash, active, avatar_tone, created_at, updated_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [user.id, user.name, user.email, user.phone, user.role, user.job_title, user.site,
      hashPassword(user.password), user.tone, iso(-120), nowIso(), iso(0, 7, 30)],
  );
}

/* --------------------------------------------------------------- families */

const FAMILIES = [
  {
    id: 'f-nor-001', code: 'NOR-001', name: 'Aminah Household', head_name: 'Ibrahim Aminah', guardian_name: 'Hawawu Aminah',
    phone: '+233 20 123 4567', alternate_phone: '+233 55 987 6543', region: 'Northern', district: 'Tamale Metro',
    community: 'Sakasaka', address: 'Near the blue mosque, second lane', urgency: 'High', status: 'active',
    lead_officer_id: 'u-officer', monthly_income: 420, summary: 'Father passed away in 2024. Guardian trades in tomatoes at the market.',
    gps_lat: 9.4008, gps_lng: -0.8393, last_visit_at: iso(-12, 11), registered_at: dateOnly(-320),
    members: [
      { name: 'Hawawu Aminah', relation: 'Mother', gender: 'Female', age: 38, is_orphan: 0, health_status: 'Fair', notes: 'Guardian — widowed in 2024.' },
      { name: 'Abdul Aminah', relation: 'Son', gender: 'Male', age: 14, is_orphan: 1, orphan_status: 'Father deceased', school: 'Sakasaka Junior High', class_level: 'JHS 2', health_status: 'Good' },
      { name: 'Zainab Aminah', relation: 'Daughter', gender: 'Female', age: 11, is_orphan: 1, orphan_status: 'Father deceased', school: 'Sakasaka Primary', class_level: 'Primary 5', health_status: 'Good' },
      { name: 'Yakubu Aminah', relation: 'Son', gender: 'Male', age: 8, is_orphan: 1, orphan_status: 'Father deceased', school: 'Sakasaka Primary', class_level: 'Primary 2', health_status: 'At risk' },
      { name: 'Ramatu Ibrahim', relation: 'Grandmother', gender: 'Female', age: 67, is_orphan: 0, health_status: 'Chronic illness' },
    ],
  },
  {
    id: 'f-nor-002', code: 'NOR-002', name: 'Yakubu Household', head_name: 'Fati Yakubu', guardian_name: 'Fati Yakubu',
    phone: '+233 24 556 7788', region: 'Northern', district: 'Savelugu', community: 'Nanton',
    urgency: 'Critical', status: 'active', lead_officer_id: 'u-officer', monthly_income: 180,
    summary: 'Both parents deceased. Grandmother cares for four children with no regular income.',
    gps_lat: 9.6176, gps_lng: -0.8261, last_visit_at: iso(-48, 10), registered_at: dateOnly(-260),
    members: [
      { name: 'Fati Yakubu', relation: 'Grandmother', gender: 'Female', age: 71, is_orphan: 0, health_status: 'Chronic illness' },
      { name: 'Sulemana Yakubu', relation: 'Grandchild', gender: 'Male', age: 16, is_orphan: 1, orphan_status: 'Both parents deceased', school: 'Nanton Senior High', class_level: 'SHS 1', health_status: 'Good' },
      { name: 'Mariam Yakubu', relation: 'Grandchild', gender: 'Female', age: 13, is_orphan: 1, orphan_status: 'Both parents deceased', school: 'Nanton Junior High', class_level: 'JHS 1', health_status: 'Fair' },
      { name: 'Iddrisu Yakubu', relation: 'Grandchild', gender: 'Male', age: 10, is_orphan: 1, orphan_status: 'Both parents deceased', school: 'Nanton Primary', class_level: 'Primary 4', health_status: 'At risk' },
      { name: 'Hafsa Yakubu', relation: 'Grandchild', gender: 'Female', age: 6, is_orphan: 1, orphan_status: 'Both parents deceased', health_status: 'Good' },
    ],
  },
  {
    id: 'f-nor-003', code: 'NOR-003', name: 'Abdallah Household', head_name: 'Sulemana Abdallah', guardian_name: 'Sulemana Abdallah',
    phone: '+233 27 334 9911', region: 'Northern', district: 'Tamale Metro', community: 'Kalpohin',
    urgency: 'Medium', status: 'active', lead_officer_id: 'u-officer', monthly_income: 650,
    summary: 'Widower with three children. Works as a night security guard.',
    last_visit_at: iso(-5, 15), registered_at: dateOnly(-180),
    members: [
      { name: 'Sulemana Abdallah', relation: 'Father', gender: 'Male', age: 45, is_orphan: 0, health_status: 'Good' },
      { name: 'Khadija Abdallah', relation: 'Daughter', gender: 'Female', age: 12, is_orphan: 1, orphan_status: 'Mother deceased', school: 'Kalpohin Primary', class_level: 'Primary 6', health_status: 'Good' },
      { name: 'Nasiru Abdallah', relation: 'Son', gender: 'Male', age: 9, is_orphan: 1, orphan_status: 'Mother deceased', school: 'Kalpohin Primary', class_level: 'Primary 3', health_status: 'Good' },
    ],
  },
  {
    id: 'f-upe-001', code: 'UPE-001', name: 'Awinaba Household', head_name: 'Akolgo Awinaba', guardian_name: 'Akolgo Awinaba',
    phone: '+233 26 778 2200', region: 'Upper East', district: 'Bolgatanga Municipal', community: 'Zuarungu',
    urgency: 'High', status: 'active', lead_officer_id: 'u-officer2', monthly_income: 300,
    summary: 'Mother deceased during childbirth. Father farms millet and groundnuts.',
    last_visit_at: iso(-20, 10), registered_at: dateOnly(-150),
    members: [
      { name: 'Akolgo Awinaba', relation: 'Father', gender: 'Male', age: 41, is_orphan: 0, health_status: 'Fair' },
      { name: 'Atinga Awinaba', relation: 'Daughter', gender: 'Female', age: 9, is_orphan: 1, orphan_status: 'Mother deceased', school: 'Zuarungu Primary', class_level: 'Primary 3', health_status: 'Good' },
      { name: 'Ayine Awinaba', relation: 'Son', gender: 'Male', age: 4, is_orphan: 1, orphan_status: 'Mother deceased', health_status: 'At risk' },
      { name: 'Asaana Awinaba', relation: 'Daughter', gender: 'Female', age: 2, is_orphan: 1, orphan_status: 'Mother deceased', health_status: 'Good' },
    ],
  },
  {
    id: 'f-upe-002', code: 'UPE-002', name: 'Akurugu Household', head_name: 'Ayamga Akurugu', guardian_name: 'Ayamga Akurugu',
    phone: '+233 20 998 4412', region: 'Upper East', district: 'Bongo', community: 'Vea',
    urgency: 'Medium', status: 'active', lead_officer_id: 'u-officer2', monthly_income: 240,
    summary: 'Widow with three children; keeps two goats and a small poultry.',
    last_visit_at: iso(-34, 9), registered_at: dateOnly(-95),
    members: [
      { name: 'Ayamga Akurugu', relation: 'Mother', gender: 'Female', age: 36, is_orphan: 0, health_status: 'Good' },
      { name: 'Adua Akurugu', relation: 'Daughter', gender: 'Female', age: 13, is_orphan: 1, orphan_status: 'Father deceased', school: 'Vea Junior High', class_level: 'JHS 1', health_status: 'Good' },
      { name: 'Atampoka Akurugu', relation: 'Son', gender: 'Male', age: 7, is_orphan: 1, orphan_status: 'Father deceased', school: 'Vea Primary', class_level: 'Primary 1', health_status: 'Good' },
    ],
  },
  {
    id: 'f-gar-001', code: 'GAR-001', name: 'Ansah Household', head_name: 'Grace Ansah', guardian_name: 'Grace Ansah',
    phone: '+233 54 220 1188', region: 'Greater Accra', district: 'Ga East', community: 'Dome',
    urgency: 'Low', status: 'active', lead_officer_id: 'u-officer2', monthly_income: 900,
    summary: 'Widow employed as a cleaner. Children in school and stable.',
    last_visit_at: iso(-9, 16), registered_at: dateOnly(-60),
    members: [
      { name: 'Grace Ansah', relation: 'Mother', gender: 'Female', age: 44, is_orphan: 0, health_status: 'Good' },
      { name: 'Kwame Ansah', relation: 'Son', gender: 'Male', age: 15, is_orphan: 1, orphan_status: 'Father deceased', school: 'Dome Senior High', class_level: 'SHS 2', health_status: 'Good' },
      { name: 'Akosua Ansah', relation: 'Daughter', gender: 'Female', age: 10, is_orphan: 1, orphan_status: 'Father deceased', school: 'Dome Primary', class_level: 'Primary 4', health_status: 'Good' },
    ],
  },
  {
    id: 'f-nor-004', code: 'NOR-004', name: 'Mahama Household', head_name: 'Abiba Mahama', guardian_name: 'Abiba Mahama',
    phone: '+233 24 101 7788', region: 'Northern', district: 'Yendi', community: 'Kpatinga',
    urgency: 'High', status: 'active', lead_officer_id: 'u-officer', monthly_income: 260,
    summary: 'Grandmother caring for three grandchildren after the mother died in 2023.',
    last_visit_at: iso(-70, 11), registered_at: dateOnly(-210),
    members: [
      { name: 'Abiba Mahama', relation: 'Grandmother', gender: 'Female', age: 64, is_orphan: 0, health_status: 'Fair' },
      { name: 'Alhassan Mahama', relation: 'Grandchild', gender: 'Male', age: 11, is_orphan: 1, orphan_status: 'Mother deceased', school: 'Kpatinga Primary', class_level: 'Primary 5', health_status: 'Good' },
      { name: 'Safia Mahama', relation: 'Grandchild', gender: 'Female', age: 8, is_orphan: 1, orphan_status: 'Mother deceased', school: 'Kpatinga Primary', class_level: 'Primary 2', health_status: 'Fair' },
      { name: 'Fuseina Mahama', relation: 'Grandchild', gender: 'Female', age: 5, is_orphan: 1, orphan_status: 'Mother deceased', health_status: 'At risk' },
    ],
  },
  {
    id: 'f-nor-005', code: 'NOR-005', name: 'Issah Household', head_name: 'Mohammed Issah', guardian_name: 'Mohammed Issah',
    phone: '+233 20 556 3322', region: 'Northern', district: 'Tamale Metro', community: 'Sagnarigu',
    urgency: 'Medium', status: 'pending', lead_officer_id: 'u-officer', monthly_income: 380,
    summary: 'Newly identified household. Assessment visit being scheduled.',
    registered_at: dateOnly(-8), last_visit_at: null,
    members: [
      { name: 'Mohammed Issah', relation: 'Father', gender: 'Male', age: 52, is_orphan: 0, health_status: 'Poor' },
      { name: 'Rukaya Issah', relation: 'Daughter', gender: 'Female', age: 9, is_orphan: 1, orphan_status: 'Mother deceased', school: 'Sagnarigu Primary', class_level: 'Primary 3', health_status: 'Good' },
    ],
  },
];

for (const family of FAMILIES) {
  if (get('SELECT id FROM families WHERE id = ?', [family.id])) continue;
  const memberIds = [];
  run(
    `INSERT INTO families (id, code, name, head_name, guardian_name, phone, alternate_phone, region, district, community, address,
       gps_lat, gps_lng, status, orphan_count, member_count, monthly_income, urgency, registered_at, last_visit_at, lead_officer_id,
       created_by, summary, consent_photo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [family.id, family.code, family.name, family.head_name, family.guardian_name, family.phone, family.alternate_phone || null,
      family.region, family.district, family.community, family.address || null, family.gps_lat || null, family.gps_lng || null,
      family.status, family.members.filter((m) => m.is_orphan).length, family.members.length, family.monthly_income,
      family.urgency, family.registered_at, family.last_visit_at, family.lead_officer_id, family.lead_officer_id,
      family.summary, iso(-90), family.last_visit_at || iso(-8)],
  );
  for (const member of family.members) {
    const memberId = id();
    memberIds.push(memberId);
    run(
      `INSERT INTO family_members (id, family_id, name, relation, gender, age, is_orphan, orphan_status, school, class_level, health_status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [memberId, family.id, member.name, member.relation, member.gender, member.age, member.is_orphan ? 1 : 0,
        member.orphan_status || null, member.school || null, member.class_level || null, member.health_status || null,
        member.notes || null, iso(-60), iso(-20)],
    );
  }
}

/* -------------------------------------------------------------- assessments */

const ASSESSMENT_SEED = {
  'f-nor-001': {
    status: 'corrections', officer: 'u-officer', reviewer: 'u-supervisor', submitted: iso(-12, 17),
    progress: 92, seedExtra: { visit_type: 'Follow-up visit', visit_reason: 'Verify school attendance and check on the roof damaged in the rains.' },
    corrections: 'Please confirm the guardian’s phone number on page 2 — the number recorded does not reach her. Also add the kitchen photograph.',
    changeNote: 'Corrections requested on the guardian phone number',
  },
  'f-nor-002': {
    status: 'submitted', officer: 'u-officer', submitted: iso(-1, 18), progress: 100,
    seedExtra: { visit_type: 'Initial assessment', visit_reason: 'New referral from the community volunteer.' },
    changeNote: 'Submitted for review',
  },
  'f-nor-003': {
    status: 'approved', officer: 'u-officer', reviewer: 'u-supervisor', submitted: iso(-18, 16), reviewed: iso(-16, 10), progress: 100,
    seedExtra: { visit_type: 'Monitoring', visit_reason: 'Routine follow-up on school fees support.' },
    reviewNote: 'Approved. School fees support can continue for one more term.',
    changeNote: 'Approved',
  },
  'f-nor-004': {
    status: 'draft', officer: 'u-officer', progress: 38,
    seedExtra: { visit_type: 'Follow-up visit', visit_reason: 'Household has not been visited for over two months.' },
    changeNote: 'Draft saved',
  },
  'f-upe-001': {
    status: 'submitted', officer: 'u-officer2', submitted: iso(-3, 15), progress: 100,
    seedExtra: { visit_type: 'Initial assessment', visit_reason: 'Mother deceased, father needs support for three children.' },
    changeNote: 'Submitted for review',
  },
  'f-upe-002': {
    status: 'approved', officer: 'u-officer2', reviewer: 'u-supervisor', submitted: iso(-30, 14), reviewed: iso(-28, 11), progress: 100,
    seedExtra: { visit_type: 'Verification', visit_reason: 'Verify livestock assets before the livelihood grant.' },
    reviewNote: 'Verified. Livelihood grant approved.',
    changeNote: 'Approved',
  },
  'f-gar-001': {
    status: 'draft', officer: 'u-officer2', progress: 64,
    seedExtra: { visit_type: 'Monitoring', visit_reason: 'Mid-year monitoring visit.' },
    changeNote: 'Draft saved',
  },
  'f-nor-005': {
    status: 'draft', officer: 'u-officer', progress: 12,
    seedExtra: { visit_type: 'Initial assessment', visit_reason: 'Newly identified household — first visit not yet completed.' },
    changeNote: 'Assessment started',
  },
};

function baseAssessmentData(family, extra) {
  const orphans = family.members.filter((m) => m.is_orphan);
  return {
    visit_date: dateOnly(-2),
    visit_type: extra.visit_type,
    visit_reason: extra.visit_reason,
    region: family.region,
    district: family.district,
    community: family.community,
    address_landmark: family.address || '',
    gps: family.gps_lat ? { lat: family.gps_lat, lng: family.gps_lng } : null,
    referral_source: 'Community volunteer',
    translator_needed: 'No',
    language_spoken: family.region === 'Upper East' ? 'Gurune' : 'Dagbani',
    household_name: family.name,
    head_name: family.head_name,
    head_relation: 'Mother',
    head_gender: 'Female',
    head_age: 38,
    head_marital_status: 'Widowed',
    phone_primary: family.phone,
    phone_alternate: family.alternate_phone || '',
    best_time_to_call: 'Evening',
    household_size: String(family.members.length),
    orphan_count: String(orphans.length),
    deceased_name: 'Ibrahim Aminah',
    deceased_relation: 'Father',
    death_date: dateOnly(-700),
    death_cause: 'Illness',
    death_certificate: 'Not sure',
    breadwinner_occupation: 'Farmer',
    guardian_name: family.guardian_name,
    guardian_relation: 'Mother',
    guardian_gender: 'Female',
    guardian_age: 38,
    guardian_phone: family.phone,
    guardian_education: 'None',
    guardian_literacy: 'No',
    guardian_occupation: 'Petty trading',
    guardian_income: String(family.monthly_income),
    guardian_health: 'Fair',
    legal_custody: 'Yes',
    dependents_count: String(family.members.length),
    children_list: orphans.map((m) => ({
      name: m.name, gender: m.gender, age: m.age, orphan_status: m.orphan_status, is_orphan: 'Yes',
      school_name: m.school || '', class_level: m.class_level || '', school_attendance: 'Yes',
      birth_certificate: 'Yes', health_insurance: 'Yes', health_status: m.health_status || 'Good',
      nutrition_status: 'Normal', sponsorship_status: 'Not sponsored',
    })),
    members_list: family.members.filter((m) => !m.is_orphan).map((m) => ({
      name: m.name, relation: m.relation, gender: m.gender, age: m.age, marital_status: 'Widowed',
      occupation: 'Petty trading', is_dependent: 'Yes', health_status: m.health_status || 'Fair',
    })),
    tenure: 'Family property',
    dwelling_type: 'Compound house',
    rooms: '3',
    wall_material: 'Mud / earth',
    roof_material: 'Metal sheets',
    floor_material: 'Earth',
    water_source: 'Public tap',
    water_distance: '8',
    sanitation: 'Pit latrine',
    electricity: 'Connected',
    cooking_fuel: 'Firewood',
    condition: 'Fair',
    overcrowded: 'Yes',
    primary_income: 'Petty trading',
    monthly_income: String(family.monthly_income),
    income_stability: 'Irregular',
    monthly_expenses: '390',
    has_debt: 'Yes',
    debt_amount: '150',
    savings: '0',
    mobile_money: 'Yes',
    meets_basic_needs: 'With difficulty',
    hardship_level: 'High',
    current_assistance: ['Food support', 'School fees'],
    assistance_requested: ['Food', 'School fees', 'Medical'],
    assistance_priority: 'School fees for the next term',
    monthly_support_need: '350',
    owns_land: 'No',
    owns_house: 'Yes',
    owns_livestock: 'Yes',
    livestock_detail: '2 goats, 4 chickens',
    asset_value: '600',
    asset_condition: 'Fair',
    expense_food: '180',
    expense_rent: '0',
    expense_utilities: '40',
    expense_education: '60',
    expense_health: '50',
    expense_transport: '30',
    expense_other: '30',
    priority_needs: ['Food security', 'Education', 'Healthcare'],
    food_security: 'High',
    nutrition_risk: 'Medium',
    health_risk: 'High',
    education_risk: 'High',
    protection_risk: 'Low',
    water_sanitation_risk: 'Medium',
    shelter_risk: 'Medium',
    urgency: family.urgency,
    recommendation: family.urgency === 'Critical' ? 'Approve urgent support' : 'Approve support',
    guardian_signature: family.guardian_name,
    signature_date: dateOnly(-2),
    witness_name: 'Sadia Musah',
    witness_signature: 'Sadia Musah',
    consent_photograph: 'Yes',
    consent_share: 'Yes',
    officer_name: USERS.find((u) => u.id === family.lead_officer_id)?.name,
    officer_position: 'Field Officer',
    officer_region: family.region,
    visit_observations: 'Household is coping but the roof leaks during heavy rain. Two children need school shoes.',
    verification_level: 'Fully verified',
    vulnerability_score: family.urgency === 'Critical' ? '9' : family.urgency === 'High' ? '7' : '5',
    officer_recommendation: family.urgency === 'Critical' ? 'Approve urgent support' : 'Approve support',
    suggested_assistance: ['Food package', 'School fees'],
    follow_up_date: dateOnly(14),
    officer_signature: USERS.find((u) => u.id === family.lead_officer_id)?.name,
    officer_date: dateOnly(-1),
  };
}

function trimmedData(data, progress) {
  if (progress >= 100) return data;
  const keys = Object.keys(data);
  const keep = Math.max(4, Math.round((keys.length * progress) / 100));
  return Object.fromEntries(keys.slice(0, keep).map((k) => [k, data[k]]));
}

for (const family of FAMILIES) {
  const config = ASSESSMENT_SEED[family.id];
  if (!config) continue;
  const existing = get('SELECT id FROM forms WHERE family_id = ? AND deleted_at IS NULL', [family.id]);
  if (existing) continue;

  const data = trimmedData(baseAssessmentData(family, config.seedExtra), config.progress);
  const formId = `form-${family.code.toLowerCase()}`;
  const createdAt = iso(-14, 9);
  run(
    `INSERT INTO forms (id, family_id, template_key, template_version, status, data, progress, current_section, assigned_to, created_by,
       reviewer_id, submitted_at, reviewed_at, review_note, revision, created_at, updated_at)
     VALUES (?, ?, 'family_assessment', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [formId, family.id, config.status, JSON.stringify(data), config.progress,
      config.status === 'draft' ? 'housing' : 'officer', config.officer, config.officer,
      config.reviewer || null, config.submitted || null, config.reviewed || null, config.reviewNote || null,
      config.status === 'draft' ? 3 : 5, createdAt, config.submitted || config.reviewed || iso(-4, 12)],
  );

  const revisionSteps = [
    { revision: 1, status: 'draft', note: 'Assessment started', at: createdAt, author: config.officer },
    { revision: 2, status: 'draft', note: 'Draft saved — preliminary information, family information', at: iso(-13, 16), author: config.officer },
    { revision: 3, status: 'draft', note: 'Draft saved — household, housing, finances', at: iso(-12, 10), author: config.officer },
  ];
  if (config.status !== 'draft') revisionSteps.push({ revision: 4, status: 'draft', note: 'Draft saved — declaration and officer assessment', at: config.submitted || iso(-2, 15), author: config.officer });
  if (config.status !== 'draft') revisionSteps.push({ revision: 5, status: config.status === 'corrections' ? 'submitted' : config.status, note: config.changeNote, at: config.submitted || iso(-2, 17), author: config.officer });
  if (config.status === 'approved') revisionSteps.push({ revision: 6, status: 'approved', note: config.reviewNote, at: config.reviewed, author: config.reviewer });
  if (config.status === 'corrections') revisionSteps.push({ revision: 6, status: 'corrections', note: config.corrections, at: iso(-2, 9), author: config.reviewer });

  for (const step of revisionSteps) {
    run(
      `INSERT INTO form_revisions (id, form_id, revision, status, data, change_note, author_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id(), formId, step.revision, step.status, JSON.stringify(data), step.note, step.author, step.at],
    );
  }

  if (config.status === 'corrections') {
    run(
      `INSERT INTO form_comments (id, form_id, section_key, author_id, body, kind, resolved, created_at, updated_at)
       VALUES (?, ?, 'family', ?, ?, 'correction', 0, ?, ?)`,
      [id(), formId, 'u-supervisor', 'The guardian phone number recorded here does not reach her. Please confirm the number and update the section.', iso(-2, 9), iso(-2, 9)],
    );
    run(
      `INSERT INTO form_comments (id, form_id, section_key, author_id, body, kind, resolved, created_at, updated_at)
       VALUES (?, ?, 'housing', ?, ?, 'correction', 0, ?, ?)`,
      [id(), formId, 'u-supervisor', 'Please add the kitchen photograph and one exterior photograph of the roof.', iso(-2, 9, 5), iso(-2, 9, 5)],
    );
  }
  if (config.status === 'approved') {
    run(
      `INSERT INTO form_comments (id, form_id, section_key, author_id, body, kind, resolved, created_at, updated_at)
       VALUES (?, ?, 'needs', ?, ?, 'comment', 1, ?, ?)`,
      [id(), formId, 'u-supervisor', 'Good detail on the needs assessment. Approved for this term.', config.reviewed, config.reviewed],
    );
  }
}

/* ------------------------------------------------------------------ photos */

function orphanIds(familyId) {
  return all('SELECT id, name FROM family_members WHERE family_id = ? AND is_orphan = 1 ORDER BY age DESC', [familyId]);
}

const PHOTO_PLAN = [
  { family: 'f-nor-001', items: [
    ['house_exterior', 'Housing', 'Exterior'],
    ['house_front', 'Housing', 'Front View'],
    ['house_living', 'Housing', 'Living Room'],
    ['house_kitchen', 'Housing', 'Kitchen / Cooking Area'],
    ['house_bathroom', 'Housing', 'Bathroom'],
    ['people_household', 'People', 'Entire Household'],
    ['people_guardian', 'People', 'Widow / Guardian'],
    ['people_volunteer', 'People', 'Family With Volunteer'],
  ], missing: [['adult_guardian_id', 'Adult Documents', 'Widow / Guardian ID', 'Guardian says the card is with her brother in Kumasi.']] },
  { family: 'f-nor-002', items: [
    ['house_exterior', 'Housing', 'Exterior'],
    ['house_front', 'Housing', 'Front View'],
    ['house_left', 'Housing', 'Left Side'],
    ['house_right', 'Housing', 'Right Side'],
    ['house_living', 'Housing', 'Living Room'],
    ['house_kitchen', 'Housing', 'Kitchen / Cooking Area'],
    ['house_bathroom', 'Housing', 'Bathroom'],
    ['house_porch', 'Housing', 'Porch'],
    ['house_other', 'Housing', 'Other Area'],
    ['people_household', 'People', 'Entire Household'],
    ['people_family', 'People', 'Family Photo'],
    ['people_volunteer', 'People', 'Family With Volunteer'],
    ['people_guardian', 'People', 'Widow / Guardian'],
    ['people_children', 'People', 'Orphans / Children'],
  ], childDocs: true },
  { family: 'f-nor-003', items: [
    ['house_exterior', 'Housing', 'Exterior'],
    ['house_front', 'Housing', 'Front View'],
    ['house_kitchen', 'Housing', 'Kitchen / Cooking Area'],
    ['people_household', 'People', 'Entire Household'],
  ], childDocs: 'partial' },
  { family: 'f-nor-004', items: [
    ['house_exterior', 'Housing', 'Exterior'],
    ['people_household', 'People', 'Entire Household'],
  ] },
];

let photoCount = 0;
for (const plan of PHOTO_PLAN) {
  const family = FAMILIES.find((f) => f.id === plan.family);
  const existing = get('SELECT COUNT(*) AS n FROM media WHERE family_id = ?', [plan.family]);
  if (existing?.n) continue;
  for (const [key, category, subcategory] of plan.items) {
    const tone = ['#0f766e', '#334155', '#7c3aed', '#b45309', '#3f6212'][photoCount % 5];
    const filename = `demo-${family.code.toLowerCase()}-${key}.svg`;
    const { file, mime, size } = placeholderPhoto(filename, `${family.code} · ${subcategory}`, `${family.community}, ${family.region}`);
    run(
      `INSERT INTO media (id, family_id, checklist_key, group_key, category, subcategory, status, kind, file_path, mime, size,
         note, source, captured_by, captured_at, gps_lat, gps_lng, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'captured', 'photo', ?, ?, ?, ?, 'camera', ?, ?, ?, ?, ?, ?)`,
      [id(), family.id, key, category.toLowerCase().includes('doc') ? 'adult_docs' : category.toLowerCase(),
        category, subcategory, file, mime, size,
        `Captured during the ${family.community} visit.`, family.lead_officer_id, iso(-12, 11, photoCount % 50),
        family.gps_lat || null, family.gps_lng || null, iso(-12, 11), iso(-12, 11)],
    );
    photoCount += 1;
  }
  if (plan.missing) {
    for (const [key, category, subcategory, note] of plan.missing) {
      run(
        `INSERT INTO media (id, family_id, checklist_key, group_key, category, subcategory, status, kind, note, source, captured_by, captured_at, created_at, updated_at)
         VALUES (?, ?, ?, 'adult_docs', ?, ?, 'not_available', 'photo', ?, 'not_available', ?, ?, ?, ?)`,
        [id(), family.id, key, category, subcategory, note, family.lead_officer_id, iso(-12, 12), iso(-12, 12), iso(-12, 12)],
      );
    }
  }
  if (plan.childDocs) {
    for (const child of orphanIds(family.id)) {
      const docs = [
        ['child_passport_photo', 'Passport Photograph'],
        ['child_birth_certificate', 'Birth Certificate'],
        ['child_health_insurance', 'Health Insurance Card'],
        ['child_education_proof', 'Proof of Education'],
      ];
      for (const [suffix, label] of docs) {
        const filename = `demo-${family.code.toLowerCase()}-${suffix}-${child.id.slice(0, 6)}.svg`;
        const { file, mime, size } = placeholderPhoto(filename, `${child.name}`, `${label} · ${family.code}`, '#3730a3');
        run(
          `INSERT INTO media (id, family_id, checklist_key, group_key, category, subcategory, child_id, status, kind, file_path, mime, size,
             source, captured_by, captured_at, created_at, updated_at)
           VALUES (?, ?, ?, 'child_docs', 'Child Documents', ?, ?, 'uploaded', 'photo', ?, ?, ?, 'camera', ?, ?, ?, ?)`,
          [id(), family.id, `${suffix}:${child.id}`, label, child.id, file, mime, size, family.lead_officer_id, iso(-11, 14), iso(-11, 14), iso(-11, 14)],
        );
      }
    }
  }
  if (plan.childDocs === 'partial') {
    const children = orphanIds(family.id);
    if (children[0]) {
      const child = children[0];
      const filename = `demo-${family.code.toLowerCase()}-child-passport-${child.id.slice(0, 6)}.svg`;
      const { file, mime, size } = placeholderPhoto(filename, child.name, `Passport Photograph · ${family.code}`, '#0f766e');
      run(
        `INSERT INTO media (id, family_id, checklist_key, group_key, category, subcategory, child_id, status, kind, file_path, mime, size,
           source, captured_by, captured_at, created_at, updated_at)
         VALUES (?, ?, ?, 'child_docs', 'Child Documents', 'Passport Photograph', ?, 'captured', 'photo', ?, ?, ?, 'camera', ?, ?, ?, ?)`,
        [id(), family.id, `child_passport_photo:${child.id}`, child.id, file, mime, size, family.lead_officer_id, iso(-5, 15), iso(-5, 15), iso(-5, 15)],
      );
    }
  }
}

/* ------------------------------------------------------------------- calls */

const CALLS = [
  { family: 'f-nor-001', status: 'answered', note: 'Guardian asked us to call again on Thursday after the market. She will bring the ID card.', offset: -2, hour: 17 },
  { family: 'f-nor-002', status: 'no_answer', note: 'Two attempts, no answer. Grandmother may be at the farm during the day.', offset: -1, hour: 11 },
  { family: 'f-nor-003', status: 'answered', note: 'Confirmed school fees were received. Children are attending regularly.', offset: -5, hour: 16 },
  { family: 'f-nor-004', status: 'call_later', note: 'Network was poor. Try again in the evening.', offset: -3, hour: 19 },
  { family: 'f-upe-001', status: 'wrong_number', note: 'Number belongs to a kiosk in Bolgatanga, not the family. Ask the volunteer for the new number.', offset: -4, hour: 10 },
  { family: 'f-nor-005', status: 'unavailable', note: 'Number is switched off. The volunteer will visit the compound instead.', offset: -1, hour: 15 },
];

for (const call of CALLS) {
  const exists = get('SELECT id FROM calls WHERE family_id = ? AND called_at = ?', [call.family, iso(call.offset, call.hour)]);
  if (exists) continue;
  const family = FAMILIES.find((f) => f.id === call.family);
  run(
    `INSERT INTO calls (id, family_id, contact_name, phone, officer_id, status, note, duration_seconds, called_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id(), call.family, family.guardian_name, family.phone, family.lead_officer_id, call.status, call.note,
      call.status === 'answered' ? 132 : 0, iso(call.offset, call.hour), iso(call.offset, call.hour), iso(call.offset, call.hour)],
  );
}

/* ------------------------------------------------------------------- notes */

for (const family of FAMILIES.slice(0, 5)) {
  const exists = get('SELECT id FROM family_notes WHERE family_id = ?', [family.id]);
  if (exists) continue;
  run(
    'INSERT INTO family_notes (id, family_id, author_id, body, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id(), family.id, family.lead_officer_id, `Visit completed. House is ${family.urgency === 'Critical' ? 'in urgent need of food support' : 'stable for now'}. Follow-up arranged with the community volunteer.`, 'visit', iso(-12, 13), iso(-12, 13)],
  );
}

/* ------------------------------------------------------------------- tasks */

const TASKS = [
  { title: 'Call Hawawu Aminah again tomorrow', detail: 'She asked us to call after the market and will have the ID card ready.', family: 'f-nor-001', assignee: 'u-officer', due: iso(1, 17), priority: 'high', category: 'call', source: 'call_follow_up' },
  { title: 'Correct assessment for Aminah Household', detail: 'Confirm the guardian phone number and add the kitchen photograph.', family: 'f-nor-001', assignee: 'u-officer', due: iso(2, 12), priority: 'high', category: 'form_review', source: 'form_review' },
  { title: 'Photograph kitchen and roof for NOR-001', detail: 'Required photographs still missing on the checklist.', family: 'f-nor-001', assignee: 'u-officer', due: iso(0, 16), priority: 'normal', category: 'media', source: 'visit' },
  { title: 'Deliver school shoes for Nanton children', detail: 'Two pairs, sizes 38 and 34. Collect from the Tamale store.', family: 'f-nor-002', assignee: 'u-officer', due: iso(3, 10), priority: 'normal', category: 'distribution', source: 'manual' },
  { title: 'Visit Sagnarigu household for first assessment', detail: 'Newly identified family. Bring the consent form and camera.', family: 'f-nor-005', assignee: 'u-officer', due: iso(4, 9), priority: 'high', category: 'visit', source: 'manual' },
  { title: 'Verify birth certificates for Vea household', detail: 'Check the two certificates against the school records.', family: 'f-upe-002', assignee: 'u-officer2', due: iso(-1, 12), priority: 'high', category: 'documents', source: 'manual' },
  { title: 'Submit monthly field report', detail: 'Northern and Upper East regions, September.', family: null, assignee: 'u-supervisor', due: iso(5, 17), priority: 'high', category: 'reporting', source: 'manual' },
  { title: 'Review submitted assessments', detail: 'Three assessments are waiting for supervisor review.', family: null, assignee: 'u-supervisor', due: iso(0, 12), priority: 'high', category: 'form_review', source: 'form_review' },
  { title: 'Prepare Qurbani distribution list', detail: 'Confirm the 120 families before the meat distribution.', family: null, assignee: 'u-supervisor', due: iso(6, 10), priority: 'normal', category: 'event', source: 'event' },
  { title: 'Order 40 food packages', detail: 'Rice, oil, beans and salt for the next distribution.', family: null, assignee: 'u-admin', due: iso(2, 15), priority: 'normal', category: 'distribution', source: 'manual' },
  { title: 'Send school fees for Kwame Ansah', detail: 'Term fees paid directly to the school bursar.', family: 'f-gar-001', assignee: 'u-officer2', due: iso(-2, 10), priority: 'normal', category: 'finance', source: 'manual', status: 'done', completed: iso(-2, 15) },
  { title: 'Update volunteer contact list', detail: 'Three volunteers changed their phone numbers.', family: null, assignee: 'u-admin', due: iso(-3, 12), priority: 'low', category: 'administration', source: 'manual', status: 'done', completed: iso(-3, 14) },
];

for (const task of TASKS) {
  const exists = get('SELECT id FROM tasks WHERE title = ?', [task.title]);
  if (exists) continue;
  const dueAt = task.due;
  run(
    `INSERT INTO tasks (id, title, detail, family_id, assignee_id, created_by, due_at, remind_at, priority, category, status, completed_at, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id(), task.title, task.detail, task.family, task.assignee, task.family ? 'u-officer' : 'u-supervisor', dueAt,
      dueAt ? new Date(new Date(dueAt).getTime() - 3600000).toISOString() : null, task.priority, task.category,
      task.status || 'open', task.completed || null, task.source, iso(-6, 9), task.completed || iso(-1, 9)],
  );
}

/* ------------------------------------------------------------------ events */

const EVENTS = [
  {
    id: 'ev-qurbani', title: 'Qurbani Distribution 2026', type: 'ngo_program', location: 'Tamale Central Mosque grounds',
    description: 'Meat distribution for 120 supported households across the Northern Region. Volunteers arrive at 07:00 for the briefing.',
    starts: iso(9, 8), ends: iso(9, 15), lead: 'u-supervisor', target: 120,
    participants: ['u-officer', 'u-officer2', 'u-volunteer', 'u-admin'],
    tasks: ['Prepare Qurbani distribution list', 'Order 40 food packages'],
    reminders: [{ offset: 1440, user: 'u-officer' }, { offset: 60, user: 'u-supervisor' }, { offset: 4320, user: 'u-officer2' }],
  },
  {
    id: 'ev-meeting', title: 'Weekly field team meeting', type: 'meeting', location: 'FieldLink office, Tamale',
    description: 'Plan the week, review new cases and clear outstanding corrections.',
    starts: iso(1, 9), ends: iso(1, 10, 30), lead: 'u-supervisor', target: 6,
    participants: ['u-officer', 'u-officer2', 'u-volunteer'],
    tasks: ['Review submitted assessments'],
    reminders: [{ offset: 60, user: 'u-officer' }, { offset: 60, user: 'u-supervisor' }],
  },
  {
    id: 'ev-visit', title: 'Field visit — Sagnarigu household', type: 'field_visit', location: 'Sagnarigu, Tamale',
    description: 'First assessment visit for the newly identified family (NOR-005).', family: 'f-nor-005',
    starts: iso(4, 10), ends: iso(4, 12), lead: 'u-officer', target: 1,
    participants: ['u-volunteer'],
    reminders: [{ offset: 60, user: 'u-officer' }],
  },
  {
    id: 'ev-training', title: 'Volunteer safeguarding training', type: 'training', location: 'Bolgatanga community hall',
    description: 'Child protection basics, consent, and how to record a visit in FieldLink.',
    starts: iso(12, 9), ends: iso(12, 16), lead: 'u-admin', target: 25,
    participants: ['u-officer2', 'u-volunteer', 'u-supervisor'],
    reminders: [{ offset: 4320, user: 'u-supervisor' }, { offset: 1440, user: 'u-volunteer' }],
  },
  {
    id: 'ev-deadline', title: 'Monthly report deadline', type: 'deadline', location: 'FieldLink workspace',
    description: 'Field reports for all regions are due. Submit through the Forms mini-app.',
    starts: iso(6, 17), lead: 'u-supervisor',
    participants: ['u-admin', 'u-officer', 'u-officer2'],
    tasks: ['Submit monthly field report'],
    reminders: [{ offset: 1440, user: 'u-supervisor' }],
  },
  {
    id: 'ev-eid', title: 'Eid celebration with families', type: 'celebration', location: 'Sakasaka community centre',
    description: 'Celebration with supported families — food, gifts for the children and photographs.',
    starts: iso(21, 10), lead: 'u-officer', target: 60,
    participants: ['u-supervisor', 'u-volunteer'],
    reminders: [{ offset: 1440, user: 'u-officer' }],
  },
  {
    id: 'ev-iftar', title: 'Ramadan Iftar programme', type: 'religious_event', location: 'Kalpohin mosque',
    description: 'Iftar meals for 80 people, organised with the local committee.',
    starts: iso(-24, 18), ends: iso(-24, 20), lead: 'u-officer', target: 80,
    participants: ['u-supervisor', 'u-volunteer', 'u-admin'],
    reminders: [],
  },
];

for (const event of EVENTS) {
  if (get('SELECT id FROM events WHERE id = ?', [event.id])) continue;
  run(
    `INSERT INTO events (id, title, type, description, status, location, starts_at, ends_at, all_day, family_id, created_by, lead_id, participant_target, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    [event.id, event.title, event.type, event.description, new Date(event.starts) > new Date() ? 'planned' : 'completed',
      event.location, event.starts, event.ends || null, event.family || null, event.lead, event.lead, event.target || null, iso(-20, 9), iso(-3, 9)],
  );
  for (const userId of event.participants || []) {
    run(
      `INSERT INTO event_participants (id, event_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'participant', ?, ?, ?)`,
      [id(), event.id, userId, new Date(event.starts) > new Date() ? 'invited' : 'attended', iso(-20, 9), iso(-3, 9)],
    );
  }
  for (const reminder of event.reminders || []) {
    run(
      `INSERT INTO event_reminders (id, event_id, user_id, offset_minutes, remind_at, sent_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id(), event.id, reminder.user, reminder.offset, new Date(new Date(event.starts).getTime() - reminder.offset * 60000).toISOString(),
        new Date(new Date(event.starts).getTime() - reminder.offset * 60000) < new Date() ? iso(-1, 8) : null, event.lead, iso(-20, 9), iso(-20, 9)],
    );
  }
}

// Attach the two seeded tasks to the Qurbani event so the event workspace has content.
for (const title of ['Prepare Qurbani distribution list', 'Order 40 food packages']) {
  run('UPDATE tasks SET event_id = ? WHERE title = ? AND event_id IS NULL', ['ev-qurbani', title]);
}
run("UPDATE tasks SET event_id = ? WHERE title = ? AND event_id IS NULL", ['ev-deadline', 'Submit monthly field report']);

/* ----------------------------------------------------------- conversations */

function ensureConversation(conversation) {
  const existing = get('SELECT id FROM conversations WHERE id = ?', [conversation.id]);
  if (existing) return;
  run(
    `INSERT INTO conversations (id, kind, title, family_id, task_id, event_id, created_by, last_message_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [conversation.id, conversation.kind, conversation.title || null, conversation.family || null, conversation.task || null,
      conversation.event || null, conversation.created_by, conversation.messages.at(-1)?.at || iso(-5, 9), iso(-30, 9), conversation.messages.at(-1)?.at || iso(-5, 9)],
  );
  for (const userId of conversation.members) {
    run('INSERT INTO conversation_members (id, conversation_id, user_id, last_read_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id(), conversation.id, userId, conversation.read?.[userId] ?? null, iso(-30, 9), conversation.read?.[userId] ?? iso(-30, 9)]);
  }
  for (const message of conversation.messages) {
    run(
      `INSERT INTO messages (id, conversation_id, sender_id, body, kind, created_at, updated_at) VALUES (?, ?, ?, ?, 'text', ?, ?)`,
      [id(), conversation.id, message.from, message.body, message.at, message.at],
    );
  }
}

ensureConversation({
  id: 'conv-officer-supervisor', kind: 'direct', created_by: 'u-officer', members: ['u-officer', 'u-supervisor'],
  read: { 'u-officer': iso(-1, 18), 'u-supervisor': iso(-1, 19) },
  messages: [
    { from: 'u-supervisor', body: 'Good morning Mohammed. Did you manage to see the Nanton household yesterday?', at: iso(-1, 8, 15) },
    { from: 'u-officer', body: 'Yes, I visited in the morning. The grandmother is looking after four children. I will submit the assessment today.', at: iso(-1, 8, 40) },
    { from: 'u-supervisor', body: 'Thank you. Please add the kitchen and roof photographs — the checklist says they are still missing.', at: iso(-1, 9, 5) },
    { from: 'u-officer', body: 'Noted. I am going back on Friday with the camera.', at: iso(-1, 9, 12) },
  ],
});

ensureConversation({
  id: 'conv-field-team', kind: 'group', title: 'Field team — Northern Region', created_by: 'u-supervisor',
  members: ['u-supervisor', 'u-officer', 'u-officer2', 'u-volunteer'],
  read: { 'u-officer': iso(-2, 20), 'u-supervisor': iso(-1, 20), 'u-officer2': iso(-3, 18) },
  messages: [
    { from: 'u-supervisor', body: 'Team, the Qurbani distribution is on the 25th. Volunteers should arrive by 07:00 for the briefing.', at: iso(-3, 10) },
    { from: 'u-officer2', body: 'Understood. I will bring the registration list from Bolgatanga.', at: iso(-3, 10, 25) },
    { from: 'u-volunteer', body: 'Sakasaka families have been informed. I will help with the queue on the day.', at: iso(-3, 12, 10) },
    { from: 'u-supervisor', body: 'Excellent. Please also finish the outstanding corrections before Friday.', at: iso(-1, 9, 30) },
  ],
});

ensureConversation({
  id: 'conv-family-nor001', kind: 'group', title: 'Family: Aminah Household (NOR-001)', family: 'f-nor-001', created_by: 'u-officer',
  members: ['u-officer', 'u-supervisor'],
  read: { 'u-officer': iso(-2, 17) },
  messages: [
    { from: 'u-officer', body: 'Uploaded the housing photographs for NOR-001. The guardian ID is still with a relative in Kumasi.', at: iso(-2, 16, 40) },
    { from: 'u-supervisor', body: 'Thank you. Mark it as not available for now and note the reason on the checklist.', at: iso(-2, 17, 5) },
  ],
});

/* --------------------------------------------------------------- documents */

const DOCUMENTS = [
  { family: 'f-nor-001', title: 'Guardian ID — Hawawu Aminah (scan pending)', category: 'Identification', notes: 'Awaiting the identity card from the brother in Kumasi.' },
  { family: 'f-nor-002', title: 'School enrolment letters — Nanton', category: 'Education', notes: 'Letters from the head teacher confirming enrolment of three children.' },
  { family: null, event: 'ev-qurbani', title: 'Qurbani distribution plan.csv', category: 'Distribution', notes: '120 households, four distribution points.' },
  { family: 'f-upe-001', title: 'Medical referral — Atinga Awinaba', category: 'Health', notes: 'Referral letter from Zuarungu health centre.' },
];

for (const document of DOCUMENTS) {
  const exists = get('SELECT id FROM documents WHERE title = ?', [document.title]);
  if (exists) continue;
  const filename = `demo-${document.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.txt`;
  const body = `${document.title}\n\n${document.notes}\nRecorded in FieldLink.\n`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), body);
  run(
    `INSERT INTO documents (id, family_id, event_id, title, category, kind, file_path, mime, size, notes, visibility, uploaded_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'document', ?, 'text/plain', ?, ?, 'internal', ?, ?, ?)`,
    [id(), document.family, document.event || null, document.title, document.category, filename, Buffer.byteLength(body),
      document.notes, document.family ? 'u-officer' : 'u-supervisor', iso(-7, 11), iso(-7, 11)],
  );
}

/* ----------------------------------------------------------- notifications */

function seedNotification(userId, notification) {
  const exists = get('SELECT id FROM notifications WHERE user_id = ? AND title = ?', [userId, notification.title]);
  if (exists) return;
  run(
    `INSERT INTO notifications (id, user_id, title, body, kind, entity_type, entity_id, link, actor_id, read_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id(), userId, notification.title, notification.body, notification.kind || 'info', notification.entityType || null,
      notification.entityId || null, notification.link || null, notification.actorId || null, notification.read ? iso(-1, 9) : null,
      notification.at || iso(-1, 9), notification.at || iso(-1, 9)],
  );
}

seedNotification('u-officer', {
  title: 'Corrections requested', body: 'Rashid Bello asked for changes on Aminah Household: confirm the guardian phone number.',
  kind: 'form', entityType: 'form', entityId: 'form-nor-001', link: '/forms/form-nor-001', actorId: 'u-supervisor', at: iso(-2, 9),
});
seedNotification('u-officer', {
  title: 'Reminder: Weekly field team meeting', body: 'Meeting at FieldLink office, Tamale — tomorrow at 09:00.',
  kind: 'reminder', entityType: 'event', entityId: 'ev-meeting', link: '/planner/ev-meeting', at: iso(0, 7, 30),
});
seedNotification('u-officer', {
  title: 'New task assigned to you', body: 'Rashid Bello: Deliver school shoes for Nanton children — due in three days.',
  kind: 'task', entityType: 'task', link: '/tasks', actorId: 'u-supervisor', at: iso(-1, 10), read: true,
});
seedNotification('u-supervisor', {
  title: 'Assessment waiting for review', body: 'Mohammed Abdulai submitted the assessment for Yakubu Household.',
  kind: 'form', entityType: 'form', link: '/forms', actorId: 'u-officer', at: iso(-1, 18),
});
seedNotification('u-supervisor', {
  title: 'Assessment waiting for review', body: 'Fatima Nuhu submitted the assessment for Awinaba Household.',
  kind: 'form', entityType: 'form', link: '/forms', actorId: 'u-officer2', at: iso(-3, 15),
});
seedNotification('u-admin', {
  title: 'Monthly report deadline', body: 'Field reports for all regions are due in six days.',
  kind: 'reminder', entityType: 'event', entityId: 'ev-deadline', link: '/planner/ev-deadline', at: iso(-1, 8),
});
seedNotification('u-officer2', {
  title: 'Task overdue', body: 'Verify birth certificates for Vea household was due yesterday.',
  kind: 'task', entityType: 'task', link: '/tasks', at: iso(0, 6), read: true,
});

/* -------------------------------------------------------------- audit trail */

if (!get('SELECT id FROM audit_log LIMIT 1')) {
  const entries = [
    ['u-officer', 'family.call', 'family', 'f-nor-001', 'Answered +233 20 123 4567', iso(-2, 17)],
    ['u-officer', 'form.submit', 'form', 'form-nor-002', 'NOR-002', iso(-1, 18)],
    ['u-supervisor', 'form.request_corrections', 'form', 'form-nor-001', 'NOR-001', iso(-2, 9)],
    ['u-officer', 'media.upload', 'family', 'f-nor-002', '14 file(s) — Housing', iso(-12, 11)],
    ['u-admin', 'user.create', 'user', 'u-volunteer', 'Sadia Musah (volunteer)', iso(-40, 9)],
    ['u-officer2', 'family.import', 'family', null, '6 created, 0 skipped', iso(-60, 9)],
  ];
  for (const [userId, action, entityType, entityId, detail, at] of entries) {
    run(
      'INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, detail, device, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id(), userId, action, entityType, entityId, detail, 'FieldLink web', at],
    );
  }
}

const counts = {
  users: get('SELECT COUNT(*) AS n FROM users')?.n,
  families: get('SELECT COUNT(*) AS n FROM families WHERE deleted_at IS NULL')?.n,
  members: get('SELECT COUNT(*) AS n FROM family_members WHERE deleted_at IS NULL')?.n,
  forms: get('SELECT COUNT(*) AS n FROM forms WHERE deleted_at IS NULL')?.n,
  media: get('SELECT COUNT(*) AS n FROM media WHERE deleted_at IS NULL')?.n,
  tasks: get('SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL')?.n,
  events: get('SELECT COUNT(*) AS n FROM events WHERE deleted_at IS NULL')?.n,
  messages: get('SELECT COUNT(*) AS n FROM messages')?.n,
  documents: get('SELECT COUNT(*) AS n FROM documents WHERE deleted_at IS NULL')?.n,
};

console.log('[fieldlink] demonstration workspace ready');
console.table(counts);
console.log('\nSign in with any of these accounts (password: fieldlink)');
console.log('  officer@fieldlink.org     Mohammed Abdulai — Field Officer');
console.log('  supervisor@fieldlink.org  Rashid Bello — Supervisor');
console.log('  admin@fieldlink.org       Amina Yusuf — Administrator');
console.log('  volunteer@fieldlink.org   Sadia Musah — Volunteer');
