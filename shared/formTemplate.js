/**
 * FieldLink — Family Assessment form template (Version 1).
 *
 * This is the digital version of the paper family assessment used by field officers on visits.
 * The 14 sections below map directly onto the family record, so anything captured in the form
 * flows back into the family profile, the media checklist and the supervisor review screen.
 *
 * Field types: text | textarea | tel | number | money | date | select | radio | multiselect |
 *              checkbox | gps | signature | repeat
 */

const YES_NO = ['Yes', 'No'];
const YES_NO_UNKNOWN = ['Yes', 'No', 'Not sure'];

export const FAMILY_ASSESSMENT = {
  key: 'family_assessment',
  version: 1,
  title: 'Family Assessment',
  description:
    'Household assessment for a supported family. Complete each section during the visit — your work is saved automatically.',
  sections: [
    {
      key: 'preliminary',
      title: 'Preliminary Information',
      short: 'Preliminary',
      icon: 'clipboard-list',
      description: 'Visit details and location. This is filled in before you speak with the family.',
      fields: [
        { key: 'visit_date', label: 'Date of visit', type: 'date', required: true },
        {
          key: 'visit_type',
          label: 'Visit type',
          type: 'select',
          required: true,
          options: ['Initial assessment', 'Follow-up visit', 'Verification', 'Emergency', 'Monitoring'],
        },
        { key: 'visit_reason', label: 'Purpose of visit', type: 'textarea', rows: 2 },
        { key: 'region', label: 'Region', type: 'text', required: true },
        { key: 'district', label: 'District', type: 'text', required: true },
        { key: 'community', label: 'Community / Village', type: 'text', required: true },
        { key: 'address_landmark', label: 'Nearest landmark', type: 'text', hint: 'Helps other officers find the home.' },
        { key: 'gps', label: 'GPS location', type: 'gps' },
        { key: 'referral_source', label: 'How was the family identified?', type: 'select', options: ['Community volunteer', 'Local leader', 'Existing family', 'Self-referral', 'Partner organisation', 'Other'] },
        { key: 'translator_needed', label: 'Translator needed?', type: 'radio', options: YES_NO },
        { key: 'language_spoken', label: 'Language used during visit', type: 'text' },
      ],
    },
    {
      key: 'family',
      title: 'Family Information',
      short: 'Family',
      icon: 'users',
      description: 'Household head and contact details.',
      fields: [
        { key: 'household_name', label: 'Household / family name', type: 'text', required: true },
        { key: 'head_name', label: 'Head of household', type: 'text', required: true },
        { key: 'head_relation', label: 'Relation to children', type: 'select', options: ['Mother', 'Father', 'Grandmother', 'Grandfather', 'Aunt', 'Uncle', 'Sibling', 'Other relative', 'Neighbour'] },
        { key: 'head_gender', label: 'Gender', type: 'radio', options: ['Female', 'Male'] },
        { key: 'head_age', label: 'Age', type: 'number' },
        { key: 'head_marital_status', label: 'Marital status', type: 'select', options: ['Widowed', 'Married', 'Divorced', 'Separated', 'Single'] },
        { key: 'head_id_type', label: 'ID type', type: 'select', options: ['Ghana Card', 'Voter ID', 'Passport', 'Birth Certificate', 'None'] },
        { key: 'head_id_number', label: 'ID number', type: 'text' },
        { key: 'phone_primary', label: 'Primary phone number', type: 'tel', required: true, hint: 'Saved numbers can be called directly from FieldLink.' },
        { key: 'phone_alternate', label: 'Alternate phone number', type: 'tel' },
        { key: 'best_time_to_call', label: 'Best time to call', type: 'select', options: ['Morning', 'Afternoon', 'Evening', 'Any time'] },
        { key: 'emergency_contact_name', label: 'Emergency contact name', type: 'text' },
        { key: 'emergency_contact_phone', label: 'Emergency contact phone', type: 'tel' },
        { key: 'household_size', label: 'Number of people in the household', type: 'number', required: true },
        { key: 'orphan_count', label: 'Number of orphan children', type: 'number' },
        { key: 'religion', label: 'Religion', type: 'text' },
        { key: 'ethnic_group', label: 'Ethnic group', type: 'text' },
      ],
    },
    {
      key: 'deceased',
      title: 'Deceased Information',
      short: 'Deceased',
      icon: 'file-heart',
      description: 'Details of the deceased parent or breadwinner.',
      fields: [
        { key: 'deceased_name', label: 'Name of deceased', type: 'text', required: true },
        { key: 'deceased_relation', label: 'Relation to family', type: 'select', options: ['Father', 'Mother', 'Both parents', 'Guardian', 'Other'] },
        { key: 'deceased_gender', label: 'Gender', type: 'radio', options: ['Female', 'Male'] },
        { key: 'deceased_dob', label: 'Date of birth', type: 'date' },
        { key: 'death_date', label: 'Date of death', type: 'date', required: true },
        { key: 'death_cause', label: 'Cause of death', type: 'text' },
        { key: 'death_certificate', label: 'Death certificate available?', type: 'radio', options: YES_NO_UNKNOWN },
        { key: 'breadwinner_occupation', label: 'Occupation before death', type: 'text' },
        { key: 'death_registered', label: 'Registered with local authorities?', type: 'radio', options: YES_NO_UNKNOWN },
        { key: 'burial_place', label: 'Burial place', type: 'text' },
        { key: 'intervention_date', label: 'Date family entered the programme', type: 'date' },
      ],
    },
    {
      key: 'guardian',
      title: 'Widow / Guardian Information',
      short: 'Guardian',
      icon: 'user-shield',
      description: 'The adult who cares for the children day to day.',
      fields: [
        { key: 'guardian_name', label: 'Guardian name', type: 'text', required: true },
        { key: 'guardian_relation', label: 'Relation to children', type: 'select', options: ['Mother', 'Father', 'Grandmother', 'Grandfather', 'Aunt', 'Uncle', 'Sibling', 'Other relative'] },
        { key: 'guardian_gender', label: 'Gender', type: 'radio', options: ['Female', 'Male'] },
        { key: 'guardian_dob', label: 'Date of birth', type: 'date' },
        { key: 'guardian_age', label: 'Age', type: 'number' },
        { key: 'guardian_id_type', label: 'ID type', type: 'select', options: ['Ghana Card', 'Voter ID', 'Passport', 'Birth Certificate', 'None'] },
        { key: 'guardian_id_number', label: 'ID number', type: 'text' },
        { key: 'guardian_phone', label: 'Phone number', type: 'tel', required: true },
        { key: 'guardian_education', label: 'Education level', type: 'select', options: ['None', 'Primary', 'JSS / Junior High', 'SSS / Senior High', 'Tertiary', 'Vocational'] },
        { key: 'guardian_literacy', label: 'Can read and write?', type: 'radio', options: ['Yes', 'No', 'Some'] },
        { key: 'guardian_occupation', label: 'Occupation', type: 'text' },
        { key: 'guardian_income', label: 'Monthly income (GHS)', type: 'money' },
        { key: 'guardian_health', label: 'Health status', type: 'select', options: ['Good', 'Fair', 'Chronic illness', 'Disabled', 'Critical' ] },
        { key: 'guardian_chronic', label: 'Chronic illness details', type: 'text' },
        { key: 'guardian_disability', label: 'Disability', type: 'text' },
        { key: 'legal_custody', label: 'Legal custody confirmed?', type: 'radio', options: YES_NO_UNKNOWN },
        { key: 'dependents_count', label: 'Number of dependents', type: 'number' },
      ],
    },
    {
      key: 'children',
      title: 'Children',
      short: 'Children',
      icon: 'baby',
      description: 'Add each child in the household. Orphan children need documents in the Field Camera.',
      fields: [
        {
          key: 'children_list',
          label: 'Children in the household',
          type: 'repeat',
          itemLabel: 'Child',
          min: 0,
          fields: [
            { key: 'name', label: 'Full name', type: 'text', required: true },
            { key: 'gender', label: 'Gender', type: 'radio', options: ['Female', 'Male'] },
            { key: 'dob', label: 'Date of birth', type: 'date' },
            { key: 'age', label: 'Age', type: 'number' },
            { key: 'relation_to_deceased', label: 'Relation to deceased', type: 'select', options: ['Son', 'Daughter', 'Nephew', 'Niece', 'Grandchild', 'Ward', 'Other'] },
            { key: 'orphan_status', label: 'Orphan status', type: 'select', options: ['Father deceased', 'Mother deceased', 'Both parents deceased', 'Not orphaned'] },
            { key: 'is_orphan', label: 'Supported as an orphan child?', type: 'radio', options: YES_NO },
            { key: 'school_name', label: 'School', type: 'text' },
            { key: 'class_level', label: 'Class / level', type: 'text' },
            { key: 'student_id', label: 'Student ID', type: 'text' },
            { key: 'school_attendance', label: 'Currently attending school?', type: 'radio', options: YES_NO },
            { key: 'fees_per_term', label: 'School fees per term (GHS)', type: 'money' },
            { key: 'birth_certificate', label: 'Birth certificate available?', type: 'radio', options: YES_NO_UNKNOWN },
            { key: 'health_insurance', label: 'Health insurance card?', type: 'radio', options: YES_NO_UNKNOWN },
            { key: 'health_status', label: 'Health status', type: 'select', options: ['Good', 'Fair', 'Chronic illness', 'Disabled', 'Needs medical review'] },
            { key: 'nutrition_status', label: 'Nutrition status', type: 'select', options: ['Normal', 'At risk', 'Malnourished'] },
            { key: 'sponsorship_status', label: 'Sponsorship status', type: 'select', options: ['Not sponsored', 'Sponsored', 'Pending'] },
            { key: 'child_notes', label: 'Notes', type: 'textarea', rows: 2 },
          ],
        },
      ],
    },
    {
      key: 'household',
      title: 'Household Members',
      short: 'Household',
      icon: 'home',
      description: 'Everyone who lives in the home, including adults.',
      fields: [
        {
          key: 'members_list',
          label: 'Household members',
          type: 'repeat',
          itemLabel: 'Member',
          min: 0,
          fields: [
            { key: 'name', label: 'Full name', type: 'text', required: true },
            { key: 'relation', label: 'Relation to head', type: 'select', options: ['Head', 'Spouse', 'Child', 'Parent', 'Sibling', 'Grandchild', 'Relative', 'Non-relative'] },
            { key: 'gender', label: 'Gender', type: 'radio', options: ['Female', 'Male'] },
            { key: 'age', label: 'Age', type: 'number' },
            { key: 'marital_status', label: 'Marital status', type: 'select', options: ['Single', 'Married', 'Widowed', 'Divorced', 'Separated'] },
            { key: 'occupation', label: 'Occupation', type: 'text' },
            { key: 'income_contribution', label: 'Monthly contribution (GHS)', type: 'money' },
            { key: 'education', label: 'Education level', type: 'text' },
            { key: 'health_status', label: 'Health status', type: 'select', options: ['Good', 'Fair', 'Chronic illness', 'Disabled'] },
            { key: 'is_dependent', label: 'Dependent on the household?', type: 'radio', options: YES_NO },
          ],
        },
      ],
    },
    {
      key: 'housing',
      title: 'Housing',
      short: 'Housing',
      icon: 'building',
      description: 'The home itself — this section links to the house photographs in the Field Camera.',
      fields: [
        { key: 'tenure', label: 'Tenure', type: 'select', required: true, options: ['Owned', 'Rented', 'Family property', 'Employer provided', 'Temporary shelter', 'Other'] },
        { key: 'dwelling_type', label: 'Type of dwelling', type: 'select', options: ['Single room', 'Compound house', 'Semi-detached', 'Detached house', 'Mud house', 'Tent / temporary'] },
        { key: 'rooms', label: 'Number of rooms', type: 'number' },
        { key: 'wall_material', label: 'Wall material', type: 'select', options: ['Cement blocks', 'Mud / earth', 'Wood', 'Metal sheets', 'Other'] },
        { key: 'roof_material', label: 'Roof material', type: 'select', options: ['Metal sheets', 'Thatch', 'Tiles', 'Concrete', 'Other'] },
        { key: 'floor_material', label: 'Floor material', type: 'select', options: ['Cement', 'Earth', 'Tiles', 'Wood'] },
        { key: 'water_source', label: 'Drinking water source', type: 'select', options: ['Piped into home', 'Public tap', 'Borehole', 'Well', 'River / stream', 'Vendor / tanker'] },
        { key: 'water_distance', label: 'Distance to water (minutes)', type: 'number' },
        { key: 'sanitation', label: 'Toilet facility', type: 'select', options: ['Flush toilet', 'VIP latrine', 'Pit latrine', 'Shared facility', 'Open defecation'] },
        { key: 'electricity', label: 'Electricity', type: 'select', options: ['Connected', 'No connection', 'Shared meter', 'Solar'] },
        { key: 'cooking_fuel', label: 'Cooking fuel', type: 'select', options: ['Firewood', 'Charcoal', 'Gas', 'Electricity', 'Other'] },
        { key: 'condition', label: 'Overall condition', type: 'radio', options: ['Good', 'Fair', 'Poor', 'Unsafe'] },
        { key: 'overcrowded', label: 'Overcrowded?', type: 'radio', options: YES_NO },
        { key: 'rent_amount', label: 'Monthly rent (GHS)', type: 'money' },
        { key: 'housing_notes', label: 'Housing notes', type: 'textarea', rows: 2 },
      ],
    },
    {
      key: 'financial',
      title: 'Financial Information',
      short: 'Financial',
      icon: 'wallet',
      description: 'Income and the household’s ability to meet basic needs.',
      fields: [
        { key: 'primary_income', label: 'Primary income source', type: 'select', required: true, options: ['Farming', 'Petty trading', 'Livestock', 'Daily labour', 'Salary', 'Remittances', 'Support from relatives', 'None'] },
        { key: 'secondary_income', label: 'Secondary income source', type: 'text' },
        { key: 'monthly_income', label: 'Total monthly income (GHS)', type: 'money', required: true },
        { key: 'income_stability', label: 'Income stability', type: 'radio', options: ['Stable', 'Seasonal', 'Irregular', 'None'] },
        { key: 'monthly_expenses', label: 'Total monthly expenses (GHS)', type: 'money' },
        { key: 'has_debt', label: 'Any debt?', type: 'radio', options: YES_NO },
        { key: 'debt_amount', label: 'Debt amount (GHS)', type: 'money' },
        { key: 'debt_detail', label: 'Debt details', type: 'text' },
        { key: 'savings', label: 'Savings (GHS)', type: 'money' },
        { key: 'mobile_money', label: 'Mobile money / bank account?', type: 'radio', options: YES_NO },
        { key: 'meets_basic_needs', label: 'Can the household meet basic needs?', type: 'radio', options: ['Easily', 'With difficulty', 'Not at all'] },
        { key: 'hardship_level', label: 'Financial hardship level', type: 'radio', options: ['Low', 'Moderate', 'High', 'Severe'] },
      ],
    },
    {
      key: 'assistance',
      title: 'Assistance',
      short: 'Assistance',
      icon: 'hand-heart',
      description: 'What the family receives today, and what is being requested.',
      fields: [
        { key: 'current_assistance', label: 'Assistance currently received', type: 'multiselect', options: ['None', 'Food support', 'School fees', 'Uniform / supplies', 'Health support', 'Cash transfer', 'Housing support', 'Livelihood support'] },
        { key: 'other_organisations', label: 'Other organisations supporting the family', type: 'text' },
        { key: 'previous_assistance', label: 'Previous assistance from this organisation', type: 'textarea', rows: 2 },
        { key: 'assistance_requested', label: 'Assistance requested', type: 'multiselect', options: ['Food', 'School fees', 'Uniform / supplies', 'Medical', 'Rent', 'Livelihood / business', 'Water', 'Shelter repair', 'Other'] },
        { key: 'assistance_priority', label: 'Most urgent request', type: 'text' },
        { key: 'monthly_support_need', label: 'Estimated monthly support needed (GHS)', type: 'money' },
        { key: 'assistance_notes', label: 'Assistance notes', type: 'textarea', rows: 2 },
      ],
    },
    {
      key: 'assets',
      title: 'Assets',
      short: 'Assets',
      icon: 'package',
      description: 'What the household owns.',
      fields: [
        { key: 'owns_land', label: 'Owns land?', type: 'radio', options: YES_NO },
        { key: 'land_size', label: 'Land size (acres)', type: 'number' },
        { key: 'owns_house', label: 'Owns the house?', type: 'radio', options: YES_NO },
        { key: 'owns_livestock', label: 'Owns livestock?', type: 'radio', options: YES_NO },
        { key: 'livestock_detail', label: 'Livestock detail', type: 'text', hint: 'For example: 3 goats, 5 chickens.' },
        { key: 'owns_vehicle', label: 'Owns vehicle / motorbike?', type: 'radio', options: YES_NO },
        { key: 'business_assets', label: 'Business or trading assets', type: 'text' },
        { key: 'farm_equipment', label: 'Farm / work equipment', type: 'text' },
        { key: 'asset_value', label: 'Estimated total asset value (GHS)', type: 'money' },
        { key: 'asset_condition', label: 'Asset condition', type: 'radio', options: ['Good', 'Fair', 'Poor'] },
        { key: 'assets_sold', label: 'Assets sold in the last year?', type: 'radio', options: YES_NO, hint: 'Often a sign of crisis.' },
      ],
    },
    {
      key: 'expenses',
      title: 'Expenses',
      short: 'Expenses',
      icon: 'receipt',
      description: 'Monthly spending in Ghana Cedis. Leave blank if unknown.',
      fields: [
        { key: 'expense_food', label: 'Food', type: 'money' },
        { key: 'expense_rent', label: 'Rent / housing', type: 'money' },
        { key: 'expense_utilities', label: 'Water / electricity', type: 'money' },
        { key: 'expense_education', label: 'Education', type: 'money' },
        { key: 'expense_health', label: 'Health / medical', type: 'money' },
        { key: 'expense_transport', label: 'Transport', type: 'money' },
        { key: 'expense_debt', label: 'Debt repayment', type: 'money' },
        { key: 'expense_fuel', label: 'Fuel / firewood / charcoal', type: 'money' },
        { key: 'expense_clothing', label: 'Clothing', type: 'money' },
        { key: 'expense_other', label: 'Other', type: 'money' },
        { key: 'expense_total', label: 'Total monthly expenses (GHS)', type: 'money', computed: 'expenses_sum' },
      ],
    },
    {
      key: 'needs',
      title: 'Needs Assessment',
      short: 'Needs',
      icon: 'target',
      description: 'Where the household is most at risk, and what should happen next.',
      fields: [
        { key: 'priority_needs', label: 'Priority needs (in order)', type: 'multiselect', options: ['Food security', 'Water', 'Shelter', 'Education', 'Healthcare', 'Income / livelihood', 'Protection', 'Sanitation', 'Psychosocial support'] },
        { key: 'food_security', label: 'Food security risk', type: 'radio', options: ['Low', 'Medium', 'High', 'Critical'] },
        { key: 'nutrition_risk', label: 'Nutrition risk', type: 'radio', options: ['Low', 'Medium', 'High', 'Critical'] },
        { key: 'health_risk', label: 'Health risk', type: 'radio', options: ['Low', 'Medium', 'High', 'Critical'] },
        { key: 'education_risk', label: 'Education risk', type: 'radio', options: ['Low', 'Medium', 'High', 'Critical'] },
        { key: 'protection_risk', label: 'Protection / safety risk', type: 'radio', options: ['Low', 'Medium', 'High', 'Critical'] },
        { key: 'water_sanitation_risk', label: 'Water and sanitation risk', type: 'radio', options: ['Low', 'Medium', 'High', 'Critical'] },
        { key: 'shelter_risk', label: 'Shelter risk', type: 'radio', options: ['Low', 'Medium', 'High', 'Critical'] },
        { key: 'urgency', label: 'Overall urgency', type: 'radio', required: true, options: ['Low', 'Medium', 'High', 'Critical'] },
        { key: 'recommendation', label: 'Recommendation', type: 'select', options: ['Approve support', 'Approve urgent support', 'Hold for review', 'Refer to partner', 'Close case'] },
        { key: 'referrals', label: 'Referrals made', type: 'text' },
        { key: 'needs_notes', label: 'Assessment summary', type: 'textarea', rows: 3 },
      ],
    },
    {
      key: 'declaration',
      title: 'Declaration',
      short: 'Declaration',
      icon: 'pen-line',
      description: 'Read this to the guardian, then record their agreement.',
      fields: [
        { key: 'declaration_text', label: 'Declaration', type: 'note', text: 'I confirm that the information recorded in this assessment is correct to the best of my knowledge. I agree that FieldLink-supported staff may record and store this information and the attached documents, and may use them to organise support for this household.' },
        { key: 'guardian_signature', label: 'Guardian signature (type full name)', type: 'signature', required: true },
        { key: 'signature_date', label: 'Date signed', type: 'date', required: true },
        { key: 'witness_name', label: 'Witness name', type: 'text' },
        { key: 'witness_signature', label: 'Witness signature (type full name)', type: 'signature' },
        { key: 'witness_date', label: 'Witness date', type: 'date' },
        { key: 'consent_photograph', label: 'Consent to photograph', type: 'radio', required: true, options: YES_NO },
        { key: 'consent_share', label: 'Consent to share information with partners', type: 'radio', options: YES_NO },
        { key: 'thumbprint', label: 'Thumbprint taken on paper copy?', type: 'radio', options: YES_NO },
      ],
    },
    {
      key: 'officer',
      title: 'Officer Assessment',
      short: 'Officer',
      icon: 'clipboard-check',
      description: 'Your professional assessment. Completed before submitting to your supervisor.',
      fields: [
        { key: 'officer_name', label: 'Officer name', type: 'text', required: true, defaultFrom: 'user.name' },
        { key: 'officer_position', label: 'Position', type: 'text' },
        { key: 'officer_region', label: 'Region / site', type: 'text' },
        { key: 'visit_observations', label: 'Visit observations', type: 'textarea', rows: 3, required: true },
        { key: 'verification_level', label: 'Verification level', type: 'radio', options: ['Fully verified', 'Partially verified', 'Needs verification'] },
        { key: 'vulnerability_score', label: 'Household vulnerability score (1–10)', type: 'number' },
        { key: 'officer_recommendation', label: 'Officer recommendation', type: 'select', options: ['Approve support', 'Approve urgent support', 'Hold for review', 'Refer to partner'] },
        { key: 'suggested_assistance', label: 'Suggested assistance', type: 'multiselect', options: ['Food package', 'School fees', 'Uniform / supplies', 'Medical support', 'Rent assistance', 'Livelihood grant', 'Housing repair'] },
        { key: 'follow_up_date', label: 'Follow-up date', type: 'date' },
        { key: 'officer_signature', label: 'Officer signature (type full name)', type: 'signature', required: true },
        { key: 'officer_date', label: 'Date completed', type: 'date', required: true },
      ],
    },
  ],
};

export const FORM_TEMPLATES = { family_assessment: FAMILY_ASSESSMENT };

export function getTemplate(key) {
  return FORM_TEMPLATES[key] || FAMILY_ASSESSMENT;
}

/** Flatten every field definition (including repeat children) for lookups and validation. */
export function templateFields(template = FAMILY_ASSESSMENT) {
  const out = [];
  for (const section of template.sections) {
    for (const field of section.fields) {
      out.push({ ...field, sectionKey: section.key, sectionTitle: section.title });
      if (field.type === 'repeat' && field.fields) {
        for (const sub of field.fields) {
          out.push({ ...sub, sectionKey: section.key, sectionTitle: section.title, repeatOf: field.key });
        }
      }
    }
  }
  return out;
}

export const FORM_STATUS = {
  draft: { label: 'Draft', tone: 'neutral', hint: 'Saved on this device and on the server. Not sent for review yet.' },
  submitted: { label: 'Submitted', tone: 'info', hint: 'Waiting for supervisor review.' },
  under_review: { label: 'Under review', tone: 'info', hint: 'Your supervisor is reviewing this assessment.' },
  corrections: { label: 'Corrections requested', tone: 'warn', hint: 'Your supervisor asked for changes. Open the notes to see what is needed.' },
  approved: { label: 'Approved', tone: 'good', hint: 'Reviewed and approved.' },
  rejected: { label: 'Not approved', tone: 'danger', hint: 'Reviewed and not approved.' },
};

/** Overall completion of a form draft. */
export function formProgress(template, data = {}) {
  const fields = templateFields(template).filter((f) => !f.repeatOf && f.type !== 'repeat');
  const repeats = templateFields(template).filter((f) => f.type === 'repeat');
  let filled = 0;
  let total = fields.length;
  for (const f of fields) if (isAnswered(data[f.key])) filled += 1;
  for (const r of repeats) {
    const list = Array.isArray(data[r.key]) ? data[r.key] : [];
    total += list.length ? 1 : 0;
    filled += list.length ? 1 : 0;
  }
  return { filled, total, percent: total ? Math.round((filled / total) * 100) : 0 };
}

export function isAnswered(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return true;
  return true;
}

export function sectionProgress(section, data = {}) {
  const fields = section.fields.filter((f) => f.type !== 'repeat');
  const filled = fields.filter((f) => isAnswered(data[f.key])).length;
  const repeats = section.fields.filter((f) => f.type === 'repeat');
  const filledRepeats = repeats.filter((r) => Array.isArray(data[r.key]) && data[r.key].length).length;
  const total = fields.length + repeats.length;
  const done = filled + filledRepeats;
  return { filled: done, total, complete: total > 0 && done >= total };
}
