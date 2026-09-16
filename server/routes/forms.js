/**
 * FieldLink — Forms mini-app (server side).
 *
 * The family assessment is broken into the 14 sections of the paper form. Drafts save
 * automatically, so an officer can lose signal, close the phone and continue later.
 * Submitted forms go to a supervisor for review, who can approve or request corrections.
 */
import { Router } from 'express';
import { all, get, run, nowIso } from '../db.js';
import { asyncRoute, bad, missing, forbidden, id, cleanText, toInt, parseJson } from '../util.js';
import { assertFamilyAccess, logAudit, notify, recordRevision, supervisorIds } from '../services.js';
import { can } from '../../shared/roles.js';
import { getTemplate, templateFields, formProgress, sectionProgress, FORM_STATUS } from '../../shared/formTemplate.js';

export const formsRouter = Router();

const AUTOSAVE_REVISION_MS = 10 * 60 * 1000;

function loadForm(formId) {
  const form = get('SELECT * FROM forms WHERE id = ? AND deleted_at IS NULL', [formId]);
  if (!form) throw missing('That form was not found.');
  return form;
}

function formAccess(req, form) {
  const family = assertFamilyAccess(req.user, form.family_id);
  return family;
}

function canEditForm(user, form) {
  if (!can(user.role, 'form.edit')) return false;
  if (user.role === 'admin' || user.role === 'supervisor') return true;
  return form.created_by === user.id || form.assigned_to === user.id;
}

/** A form is only editable while it is a draft or has been returned for corrections. */
function isEditableStatus(status) {
  return status === 'draft' || status === 'corrections';
}

export function validateForm(template, data) {
  const missingFields = [];
  for (const section of template.sections) {
    for (const field of section.fields) {
      if (field.type === 'repeat' || field.type === 'note') continue;
      if (!field.required) continue;
      const value = data?.[field.key];
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) {
        missingFields.push({ section: section.key, sectionTitle: section.title, key: field.key, label: field.label });
      }
    }
  }
  return missingFields;
}

/** Push everything captured in the assessment back into the family record. */
export function syncFamilyFromForm(familyId, data, user) {
  const now = nowIso();
  const pick = (keys, fallback) => keys.map((k) => data?.[k]).find((v) => v !== undefined && v !== null && v !== '') ?? fallback ?? null;

  const sets = [];
  const params = [];
  const assign = (column, value) => { sets.push(`${column} = ?`); params.push(value); };

  const head = pick(['head_name']);
  if (head) assign('head_name', cleanText(head, 160));
  const householdName = pick(['household_name']);
  const guardian = pick(['guardian_name']);
  if (guardian) assign('guardian_name', cleanText(guardian, 160));
  const phone = pick(['phone_primary', 'guardian_phone']);
  if (phone) assign('phone', cleanText(phone, 40));
  const alt = pick(['phone_alternate']);
  if (alt) assign('alternate_phone', cleanText(alt, 40));
  const region = pick(['region']);
  if (region) assign('region', cleanText(region, 80));
  const district = pick(['district']);
  if (district) assign('district', cleanText(district, 80));
  const community = pick(['community']);
  if (community) assign('community', cleanText(community, 120));
  const landmark = pick(['address_landmark']);
  if (landmark) assign('address', cleanText(landmark, 240));
  const gps = data?.gps;
  if (gps && typeof gps === 'object' && gps.lat) {
    assign('gps_lat', Number(gps.lat));
    assign('gps_lng', Number(gps.lng));
  }
  const householdSize = pick(['household_size']);
  if (householdSize) assign('member_count', toInt(householdSize, null));
  const urgency = pick(['urgency']);
  if (urgency) assign('urgency', cleanText(urgency, 20));
  const income = pick(['monthly_income']);
  if (income !== null && income !== undefined && income !== '') assign('monthly_income', Number(income) || null);
  const visitDate = pick(['visit_date']);
  if (visitDate) assign('last_visit_at', new Date(`${visitDate}T12:00:00Z`).toISOString());
  const consent = pick(['consent_photograph']);
  if (consent) assign('consent_photo', consent === 'Yes' ? 1 : 0);
  if (householdName && !get('SELECT name FROM families WHERE id = ?', [familyId])?.name) assign('name', cleanText(householdName, 160));

  if (sets.length) {
    sets.push('updated_at = ?');
    params.push(now, familyId);
    run(`UPDATE families SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  // Household members: keep the family_members table in step with the assessment.
  const children = Array.isArray(data?.children_list) ? data.children_list : [];
  const members = Array.isArray(data?.members_list) ? data.members_list : [];
  const people = [
    ...children.filter((c) => c?.name).map((c) => ({
      name: c.name, relation: c.relation_to_deceased || 'Child', gender: c.gender || null, dob: c.dob || null,
      age: toInt(c.age, null), is_orphan: String(c.is_orphan || '').toLowerCase() === 'yes' || /deceased/i.test(c.orphan_status || ''),
      orphan_status: c.orphan_status || null, school: c.school_name || null, class_level: c.class_level || null,
      health_status: c.health_status || null, notes: c.child_notes || null,
    })),
    ...members.filter((m) => m?.name).map((m) => ({
      name: m.name, relation: m.relation || null, gender: m.gender || null, dob: null, age: toInt(m.age, null),
      is_orphan: 0, orphan_status: null, school: m.education || null, class_level: null,
      health_status: m.health_status || null, notes: null,
    })),
  ];

  for (const person of people) {
    const existing = get('SELECT * FROM family_members WHERE family_id = ? AND lower(name) = ?', [familyId, String(person.name).toLowerCase()]);
    if (existing) {
      run(
        `UPDATE family_members SET relation = COALESCE(?, relation), gender = COALESCE(?, gender), dob = COALESCE(?, dob),
           age = COALESCE(?, age), is_orphan = ?, orphan_status = COALESCE(?, orphan_status), school = COALESCE(?, school),
           class_level = COALESCE(?, class_level), health_status = COALESCE(?, health_status), notes = COALESCE(?, notes), updated_at = ?
         WHERE id = ?`,
        [person.relation, person.gender, person.dob, person.age, person.is_orphan ? 1 : 0, person.orphan_status, person.school,
          person.class_level, person.health_status, person.notes, now, existing.id],
      );
    } else {
      run(
        `INSERT INTO family_members (id, family_id, name, relation, gender, dob, age, is_orphan, orphan_status, school, class_level, health_status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id(), familyId, cleanText(person.name, 160), person.relation, person.gender, person.dob, person.age,
          person.is_orphan ? 1 : 0, person.orphan_status, person.school, person.class_level, person.health_status, person.notes, now, now],
      );
    }
  }

  const counts = get(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN is_orphan = 1 THEN 1 ELSE 0 END) AS orphans
     FROM family_members WHERE family_id = ? AND deleted_at IS NULL`,
    [familyId],
  );
  if (counts && counts.total) {
    run('UPDATE families SET member_count = ?, orphan_count = ? WHERE id = ?', [counts.total, counts.orphans || 0, familyId]);
  }
  logAudit(user, 'form.sync_family', 'family', familyId, 'Family record updated from assessment', user?.email);
}

function snapshotIfNeeded(form, user, note) {
  const last = get('SELECT * FROM form_revisions WHERE form_id = ? ORDER BY revision DESC LIMIT 1', [form.id]);
  const stale = !last || Date.now() - new Date(last.created_at).getTime() > AUTOSAVE_REVISION_MS;
  const differentAuthor = last && last.author_id !== user.id;
  if (stale || differentAuthor) {
    run('UPDATE forms SET revision = revision + 1 WHERE id = ?', [form.id]);
    const updated = get('SELECT * FROM forms WHERE id = ?', [form.id]);
    recordRevision(updated, note || 'Draft saved', user.id);
  }
}

/* ------------------------------------------------------------------ routes */

formsRouter.get('/templates', asyncRoute((req, res) => {
  const template = getTemplate(req.query.key || 'family_assessment');
  res.json({ template, statuses: FORM_STATUS });
}));

formsRouter.get('/', asyncRoute((req, res) => {
  const { scope, family_id: familyId, status } = req.query;
  const where = ['f.deleted_at IS NULL'];
  const params = [];
  if (familyId) { assertFamilyAccess(req.user, familyId); where.push('f.family_id = ?'); params.push(familyId); }
  if (status && status !== 'all') { where.push('f.status = ?'); params.push(status); }
  if (scope === 'mine') {
    where.push('(f.created_by = ? OR f.assigned_to = ?)');
    params.push(req.user.id, req.user.id);
  }
  if (scope === 'review') {
    if (!can(req.user.role, 'form.review')) throw forbidden('Only supervisors and administrators review assessments.');
    where.push("f.status IN ('submitted','under_review')");
  }
  if (!can(req.user.role, 'family.view.all') && req.user.role === 'volunteer') {
    where.push('(f.created_by = ? OR f.assigned_to = ?)');
    params.push(req.user.id, req.user.id);
  }

  const rows = all(
    `SELECT f.*, fa.code AS family_code, fa.name AS family_name, fa.community, fa.urgency AS family_urgency,
            cu.name AS created_by_name, au.name AS assigned_to_name, ru.name AS reviewer_name,
            (SELECT COUNT(*) FROM form_comments fc WHERE fc.form_id = f.id AND fc.deleted_at IS NULL) AS comment_count,
            (SELECT COUNT(*) FROM form_comments fc WHERE fc.form_id = f.id AND fc.deleted_at IS NULL AND fc.resolved = 0) AS open_comment_count
     FROM forms f
     JOIN families fa ON fa.id = f.family_id
     LEFT JOIN users cu ON cu.id = f.created_by
     LEFT JOIN users au ON au.id = f.assigned_to
     LEFT JOIN users ru ON ru.id = f.reviewer_id
     WHERE ${where.join(' AND ')}
     ORDER BY CASE f.status WHEN 'corrections' THEN 0 WHEN 'submitted' THEN 1 WHEN 'under_review' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END, f.updated_at DESC
     LIMIT 300`,
    params,
  );

  const counts = {
    drafts: rows.filter((r) => r.status === 'draft').length,
    waiting_review: rows.filter((r) => r.status === 'submitted' || r.status === 'under_review').length,
    corrections: rows.filter((r) => r.status === 'corrections').length,
    approved: rows.filter((r) => r.status === 'approved').length,
  };
  res.json({ forms: rows.map((r) => ({ ...r, data: parseJson(r.data, {}) })), counts });
}));

formsRouter.post('/', asyncRoute((req, res) => {
  if (!can(req.user.role, 'form.create')) throw forbidden();
  const familyId = cleanText(req.body?.family_id, 64);
  if (!familyId) throw bad('Choose the family this assessment is for.');
  const family = assertFamilyAccess(req.user, familyId);
  const templateKey = cleanText(req.body?.template_key, 60) || 'family_assessment';
  const template = getTemplate(templateKey);
  const now = nowIso();
  const formId = id();

  const seed = {};
  for (const field of templateFields(template)) {
    if (field.defaultFrom === 'user.name' && !field.repeatOf) seed[field.key] = req.user.name;
  }
  seed.visit_date = now.slice(0, 10);
  seed.region = family.region || '';
  seed.district = family.district || '';
  seed.community = family.community || '';
  seed.household_name = family.name || '';
  seed.head_name = family.head_name || '';
  seed.guardian_name = family.guardian_name || '';
  seed.guardian_phone = family.phone || '';
  seed.phone_primary = family.phone || '';
  seed.officer_name = req.user.name;
  seed.officer_position = req.user.job_title || '';
  seed.registration_code = family.code;

  const members = all('SELECT * FROM family_members WHERE family_id = ? AND deleted_at IS NULL', [familyId]);
  if (members.length) {
    seed.children_list = members.filter((m) => m.is_orphan).map((m) => ({
      name: m.name, gender: m.gender, dob: m.dob, age: m.age, is_orphan: 'Yes', orphan_status: m.orphan_status,
      school_name: m.school, class_level: m.class_level, health_status: m.health_status,
    }));
    seed.members_list = members.filter((m) => !m.is_orphan).map((m) => ({
      name: m.name, relation: m.relation, gender: m.gender, age: m.age, health_status: m.health_status,
    }));
  }

  run(
    `INSERT INTO forms (id, family_id, template_key, template_version, status, data, progress, current_section, assigned_to, created_by, revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'draft', ?, 0, ?, ?, ?, 1, ?, ?)`,
    [formId, familyId, templateKey, template.version, JSON.stringify(seed), template.sections[0].key, req.user.id, req.user.id, now, now],
  );
  recordRevision(get('SELECT * FROM forms WHERE id = ?', [formId]), 'Assessment started', req.user.id);
  logAudit(req.user, 'form.create', 'form', formId, `${family.code} — ${template.title}`, req.device);
  notify(family.lead_officer_id === req.user.id ? null : family.lead_officer_id, {
    title: 'Assessment started',
    body: `${req.user.name} started a ${template.title} for ${family.name}.`,
    kind: 'form', entityType: 'form', entityId: formId, link: `/forms/${formId}`, actorId: req.user.id,
  });
  res.status(201).json({ form: get('SELECT * FROM forms WHERE id = ?', [formId]) });
}));

formsRouter.get('/:formId', asyncRoute((req, res) => {
  const form = loadForm(req.params.formId);
  const family = formAccess(req, form);
  const template = getTemplate(form.template_key);
  const data = parseJson(form.data, {});
  const revisions = all(
    `SELECT r.*, u.name AS author_name FROM form_revisions r LEFT JOIN users u ON u.id = r.author_id
     WHERE r.form_id = ? ORDER BY r.revision DESC`,
    [form.id],
  );
  const comments = all(
    `SELECT c.*, u.name AS author_name, u.role AS author_role FROM form_comments c LEFT JOIN users u ON u.id = c.author_id
     WHERE c.form_id = ? AND c.deleted_at IS NULL ORDER BY c.created_at ASC`,
    [form.id],
  );
  const members = all('SELECT * FROM family_members WHERE family_id = ? AND deleted_at IS NULL', [form.family_id]);
  const media = all(
    `SELECT id, checklist_key, category, subcategory, status, captured_at, child_id FROM media
     WHERE family_id = ? AND deleted_at IS NULL ORDER BY captured_at DESC`,
    [form.family_id],
  );
  const sections = template.sections.map((section) => ({
    key: section.key,
    title: section.title,
    short: section.short,
    description: section.description,
    progress: sectionProgress(section, data),
    comments: comments.filter((c) => c.section_key === section.key),
  }));
  res.json({
    form: { ...form, data },
    template,
    family: { id: family.id, code: family.code, name: family.name, community: family.community, region: family.region, urgency: family.urgency, phone: family.phone, guardian_name: family.guardian_name, head_name: family.head_name, lead_officer_id: family.lead_officer_id },
    members,
    media,
    sections,
    revisions: revisions.map((r) => ({ ...r, data: parseJson(r.data, {}) })),
    comments,
    progress: formProgress(template, data),
    can_edit: canEditForm(req.user, form) && isEditableStatus(form.status),
    can_review: can(req.user.role, 'form.review'),
    missing_required: validateForm(template, data),
  });
}));

formsRouter.patch('/:formId', asyncRoute((req, res) => {
  const form = loadForm(req.params.formId);
  formAccess(req, form);
  if (!canEditForm(req.user, form)) throw forbidden('This assessment was already submitted. Ask your supervisor to return it to you.');
  if (!isEditableStatus(form.status) && req.user.role !== 'admin') {
    throw forbidden('This assessment has been submitted for review. Ask your supervisor to return it to you.');
  }
  if (form.status === 'approved' || form.status === 'rejected') throw forbidden('An approved assessment can no longer be edited.');
  const template = getTemplate(form.template_key);
  const data = { ...parseJson(form.data, {}), ...(req.body?.data || {}) };

  // "Not recorded yet" — the officer can clear a field, so undefined means "leave it".
  for (const [key, value] of Object.entries(req.body?.data || {})) {
    if (value === undefined) delete data[key];
  }

  const progress = formProgress(template, data);
  const status = form.status === 'corrections' ? 'corrections' : form.status;
  run(
    'UPDATE forms SET data = ?, progress = ?, current_section = ?, status = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(data), progress.percent, cleanText(req.body?.current_section, 60) || form.current_section, status, nowIso(), form.id],
  );
  const updated = get('SELECT * FROM forms WHERE id = ?', [form.id]);
  snapshotIfNeeded(updated, req.user, cleanText(req.body?.change_note, 200) || 'Draft saved');
  res.json({ form: get('SELECT * FROM forms WHERE id = ?', [form.id]), progress, saved_at: nowIso() });
}));

formsRouter.post('/:formId/submit', asyncRoute((req, res) => {
  const form = loadForm(req.params.formId);
  const family = formAccess(req, form);
  if (!canEditForm(req.user, form)) throw forbidden();
  const template = getTemplate(form.template_key);
  const data = { ...parseJson(form.data, {}), ...(req.body?.data || {}) };
  const missingFields = validateForm(template, data);
  if (missingFields.length) {
    return res.status(422).json({
      error: `There are ${missingFields.length} required ${missingFields.length === 1 ? 'answer' : 'answers'} still missing.`,
      missing_required: missingFields,
    });
  }
  const now = nowIso();
  run(
    `UPDATE forms SET data = ?, status = 'submitted', progress = 100, submitted_at = ?, reviewer_id = NULL, updated_at = ?, revision = revision + 1
     WHERE id = ?`,
    [JSON.stringify(data), now, now, form.id],
  );
  const updated = get('SELECT * FROM forms WHERE id = ?', [form.id]);
  recordRevision(updated, cleanText(req.body?.note, 300) || 'Submitted for review', req.user.id);
  syncFamilyFromForm(form.family_id, data, req.user);

  for (const supervisor of supervisorIds()) {
    notify(supervisor, {
      title: 'Assessment waiting for review',
      body: `${req.user.name} submitted the assessment for ${family.name}.`,
      kind: 'form', entityType: 'form', entityId: form.id, link: `/forms/${form.id}`, actorId: req.user.id,
    });
  }
  logAudit(req.user, 'form.submit', 'form', form.id, family.code, req.device);
  res.json({ form: get('SELECT * FROM forms WHERE id = ?', [form.id]) });
}));

formsRouter.post('/:formId/review', asyncRoute((req, res) => {
  const form = loadForm(req.params.formId);
  const family = formAccess(req, form);
  if (!can(req.user.role, 'form.review')) throw forbidden('Only supervisors and administrators can review assessments.');
  const action = cleanText(req.body?.action, 30);
  const note = cleanText(req.body?.note, 4000);
  const sectionKey = cleanText(req.body?.section_key, 60);
  if (!['approve', 'reject', 'request_corrections', 'start_review'].includes(action)) throw bad('Choose what to do with this assessment.');
  if (!['submitted', 'under_review'].includes(form.status)) {
    throw bad('This assessment has not been submitted for review yet.');
  }
  if (action === 'request_corrections' && !note) throw bad('Describe the correction needed so the officer knows what to change.');

  const now = nowIso();
  const statusMap = { approve: 'approved', reject: 'rejected', request_corrections: 'corrections', start_review: 'under_review' };
  const status = statusMap[action];
  run(
    'UPDATE forms SET status = ?, reviewer_id = ?, reviewed_at = ?, review_note = ?, updated_at = ?, revision = revision + 1 WHERE id = ?',
    [status, req.user.id, now, note, now, form.id],
  );
  const updated = get('SELECT * FROM forms WHERE id = ?', [form.id]);
  const summary = { approve: 'Approved', reject: 'Not approved', request_corrections: 'Corrections requested', start_review: 'Review started' }[action];
  recordRevision(updated, note ? `${summary}: ${note}` : summary, req.user.id);

  if (sectionKey) {
    run(
      `INSERT INTO form_comments (id, form_id, section_key, author_id, body, kind, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'correction', ?, ?)`,
      [id(), form.id, sectionKey, req.user.id, note, now, now],
    );
  }

  const officerId = form.assigned_to || form.created_by;
  if (action === 'request_corrections') {
    notify(officerId, {
      title: 'Corrections requested',
      body: `${req.user.name} asked for changes on ${family.name}: ${note?.slice(0, 160)}`,
      kind: 'form', entityType: 'form', entityId: form.id, link: `/forms/${form.id}`, actorId: req.user.id,
    });
    const taskId = id();
    run(
      `INSERT INTO tasks (id, title, detail, family_id, assignee_id, created_by, due_at, priority, category, status, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'high', 'form_review', 'open', 'form_review', ?, ?)`,
      [taskId, `Correct assessment for ${family.name}`, note, family.id, officerId, req.user.id,
        new Date(Date.now() + 2 * 86400000).toISOString(), now, now],
    );
    return res.json({ form: get('SELECT * FROM forms WHERE id = ?', [form.id]), task_id: taskId });
  }

  notify(officerId, {
    title: action === 'approve' ? 'Assessment approved' : action === 'reject' ? 'Assessment not approved' : 'Your assessment is being reviewed',
    body: note ? `${req.user.name}: ${note.slice(0, 160)}` : `${req.user.name} updated ${family.name}.`,
    kind: 'form', entityType: 'form', entityId: form.id, link: `/forms/${form.id}`, actorId: req.user.id,
  });
  logAudit(req.user, `form.${action}`, 'form', form.id, family.code, req.device);
  res.json({ form: get('SELECT * FROM forms WHERE id = ?', [form.id]) });
}));

formsRouter.post('/:formId/comments', asyncRoute((req, res) => {
  const form = loadForm(req.params.formId);
  const family = formAccess(req, form);
  if (!can(req.user.role, 'form.comment')) throw forbidden();
  const body = cleanText(req.body?.body, 4000);
  if (!body) throw bad('Please write a comment first.');
  const commentId = id();
  const now = nowIso();
  run(
    `INSERT INTO form_comments (id, form_id, section_key, author_id, body, kind, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [commentId, form.id, cleanText(req.body?.section_key, 60), req.user.id, body, cleanText(req.body?.kind, 30) || 'comment', now, now],
  );

  const recipients = new Set([form.created_by, form.assigned_to]);
  if (!recipients.has(req.user.id) || req.user.role === 'officer' || req.user.role === 'volunteer') {
    for (const supervisor of supervisorIds()) recipients.add(supervisor);
  }
  recipients.delete(req.user.id);
  for (const recipient of recipients) {
    notify(recipient, {
      title: 'New comment on assessment',
      body: `${req.user.name} on ${family.name}: ${body.slice(0, 160)}`,
      kind: 'comment', entityType: 'form', entityId: form.id, link: `/forms/${form.id}`, actorId: req.user.id,
    });
  }
  res.status(201).json({
    comment: get('SELECT c.*, u.name AS author_name, u.role AS author_role FROM form_comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.id = ?', [commentId]),
  });
}));

formsRouter.patch('/comments/:commentId', asyncRoute((req, res) => {
  const comment = get('SELECT * FROM form_comments WHERE id = ? AND deleted_at IS NULL', [req.params.commentId]);
  if (!comment) throw missing('That comment was not found.');
  const form = loadForm(comment.form_id);
  formAccess(req, form);
  if (comment.author_id !== req.user.id && !can(req.user.role, 'form.review')) throw forbidden();
  if (req.body?.resolved !== undefined) {
    run('UPDATE form_comments SET resolved = ?, updated_at = ? WHERE id = ?', [req.body.resolved ? 1 : 0, nowIso(), comment.id]);
  }
  if (req.body?.body) {
    run('UPDATE form_comments SET body = ?, updated_at = ? WHERE id = ?', [cleanText(req.body.body, 4000), nowIso(), comment.id]);
  }
  res.json({ comment: get('SELECT * FROM form_comments WHERE id = ?', [comment.id]) });
}));

formsRouter.post('/:formId/continue', asyncRoute((req, res) => {
  const form = loadForm(req.params.formId);
  formAccess(req, form);
  res.json({ form, resume_hint: `Continue ${getTemplate(form.template_key).title}` });
}));

export { FORM_STATUS };
