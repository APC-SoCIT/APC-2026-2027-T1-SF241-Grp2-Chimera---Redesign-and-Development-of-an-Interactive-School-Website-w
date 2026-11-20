export type Field = {
  key: string;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'date' | 'number' | 'select' | 'textarea';
  required?: boolean;
  options?: string[];
  hint?: string;
  maxLength?: number;
  pattern?: string;
  validationMessage?: string;
  inputMode?: 'numeric';
  readOnly?: boolean;
};
export type Section = { title: string; description: string; fields: Field[] };
export type Application = Record<string, string>;
export type FieldErrors = Record<string, string>;
export const schoolLevels: Record<string, { label: string; department: string; grades: string[] }> = {
  Preschool: { label: 'Pre-school', department: 'preschool', grades: ['Nursery', 'Kindergarten'] },
  Elementary: { label: 'Elementary', department: 'grade_school', grades: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'] },
  JHS: { label: 'Junior High School', department: 'jhs', grades: ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'] },
  SHS: { label: 'Senior High School', department: 'shs', grades: ['Grade 11', 'Grade 12'] },
};
export const paymentModes = ['Full Payment/Cash', 'Monthly', 'Quarterly', 'Semi-Annual'];
export const strands: Record<string, string[]> = {
  'Grade 11': ['11-ACADEMIC', '11-TECHPRO'],
  'Grade 12': ['12-STEM', '12-HUMSS', '12-GAS', '12-ABM', '12-ICT'],
};
const nameRules = {
  maxLength: 100, pattern: "(?=.*\\p{L})[\\p{L}\\p{M} .’'\\-]+",
  validationMessage: 'Use letters, spaces, periods, apostrophes, or hyphens for names.',
};
const contactRules = {
  maxLength: 11, pattern: '09[0-9]{9}', inputMode: 'numeric' as const,
  hint: 'Enter one 11-digit mobile number starting with 09, e.g. 09171234567.',
  validationMessage: 'Enter exactly 11 digits starting with 09, with no spaces or punctuation.',
};
const parentFields = (prefix: string, mother = false): Field[] => [
  { ...nameRules, maxLength: 150, key: `${prefix}FullName`, label: mother ? 'Full maiden name' : 'Full name', hint: 'Required if you provide an occupation or contact number below.' },
  { key: `${prefix}Occupation`, label: 'Occupation', maxLength: 150 },
  { ...contactRules, key: `${prefix}Contact`, label: 'Contact number', type: 'tel' },
];
/**
 * The former school's name is needed whenever the checklist asks for documents from it
 * (report card, good moral, recommendation, ESC). Old students already study at SNCS,
 * and preschool applicants may not have attended school yet.
 */
export function needsFormerSchool(data: Application): boolean {
  return Boolean(data.studentStatus) && data.studentStatus !== 'Old' && data.level !== 'Preschool';
}
export function sectionsFor(data: Application): Section[] {
  const sections: Section[] = [
    { title: 'Enrollment details', description: 'Choose the level and grade you are applying for.', fields: [
      { key: 'level', label: 'School level', type: 'select', required: true, options: Object.keys(schoolLevels) },
      { key: 'schoolYear', label: 'School year', required: true, readOnly: true, hint: 'Set by the current enrollment period.' },
      { key: 'studentStatus', label: 'Student status', type: 'select', required: true, options: ['New', 'Old', 'Returnee'],
        hint: 'New: first time at SNCS, including transferees from another school. Old: currently studying at SNCS. Returnee: studied at SNCS before and is coming back.' },
      { key: 'gradeLevel', label: 'Grade level', type: 'select', required: true, options: Object.hasOwn(schoolLevels, data.level) ? schoolLevels[data.level].grades : [] },
      ...(data.level === 'SHS' ? [{ key: 'strand', label: 'Strand', type: 'select' as const, required: true, options: Object.hasOwn(strands, data.gradeLevel) ? strands[data.gradeLevel] : [] }] : []),
      { key: 'paymentMode', label: 'Mode of payment', type: 'select', required: true, options: paymentModes, hint: 'Preference only. No payment is collected online.' },
    ] },
    { title: 'Student information', description: 'Enter the student’s details as they appear in school records.', fields: [
      { ...nameRules, key: 'surname', label: 'Surname', required: true },
      { ...nameRules, key: 'firstName', label: 'First name', required: true },
      { ...nameRules, key: 'middleName', label: 'Middle name' },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'parentEmail', label: 'Parent’s email address', type: 'email' },
      { key: 'messenger', label: 'Parent/guardian’s active Messenger account', required: true },
      { key: 'birthday', label: 'Birthday', type: 'date', required: true, maxLength: 10 },
      { key: 'age', label: 'Age', type: 'number', readOnly: true, hint: 'Calculated from the birthday.' },
      { key: 'gender', label: 'Gender', type: 'select', required: true, options: ['Male', 'Female'] },
      { key: 'address', label: 'Complete address', type: 'textarea', required: true },
      { key: 'birthplace', label: 'Place of birth', required: true },
      { key: 'religion', label: 'Religion', required: true, maxLength: 100 },
      { ...contactRules, key: 'contact', label: 'Contact number', type: 'tel', required: true },
    ] },
    { title: 'Father’s information', description: 'Fill in the details that apply to your family.', fields: parentFields('father') },
    { title: 'Mother’s information', description: 'Use the mother’s full maiden name, if applicable.', fields: parentFields('mother', true) },
    { title: 'Guardian’s information', description: 'Provide guardian details if applicable.', fields: parentFields('guardian') },
    { title: 'Last school attended', description: 'Enter the details of the student’s previous school.', fields: [
      { key: 'previousSchool', label: 'Former school’s name', required: needsFormerSchool(data),
        hint: needsFormerSchool(data) ? 'Required: the report card and other requirements come from this school.'
          : data.studentStatus === 'Old' ? 'Not needed for students already studying at SNCS.'
            : data.level === 'Preschool' ? 'Leave blank if the child has not attended school yet.'
              : 'Required for new students and returnees above pre-school.' },
      { key: 'previousAddress', label: 'Former school’s complete address', type: 'textarea' },
    ] },
  ];
  return sections.map(section => ({ ...section, fields: section.fields.map(field => ({
    ...field, maxLength: field.maxLength ?? (field.type === 'textarea' ? 1000 : 254),
  })) }));
}
// The school and API use the same date even when hosted in another time zone.
export function todayInManila(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function ageAt(birthday: string, today = todayInManila()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || Number.isNaN(Date.parse(birthday)) || new Date(birthday).toISOString().slice(0, 10) !== birthday || birthday > today) return '';
  const age = Number(today.slice(0, 4)) - Number(birthday.slice(0, 4)) - (today.slice(5) < birthday.slice(5) ? 1 : 0);
  return String(age);
}
function validEmail(value: string): boolean {
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  const labels = domain.split('.');
  return local.length <= 64 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
    && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..')
    && labels.length >= 2 && labels.every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))
    && /^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{2,59})$/.test(labels.at(-1) ?? '');
}
export function validateApplication(input: unknown, schoolYear: string, today = todayInManila()): { data: Application; errors: FieldErrors } {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const text = (key: string) => typeof raw[key] === 'string' ? (raw[key] as string).trim() : '';
  const context: Application = { level: text('level'), gradeLevel: text('gradeLevel'), studentStatus: text('studentStatus') };
  const data: Application = {};
  const errors: FieldErrors = {};
  for (const field of sectionsFor(context).flatMap(section => section.fields)) {
    const rawValue = raw[field.key];
    if (field.key === 'age') continue; // Always derived from the validated birthday.
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    data[field.key] = value;
    const hasControls = Array.from(value).some(character => {
      const code = character.charCodeAt(0);
      return code === 127 || (code < 32 && !(field.type === 'textarea' && [9, 10, 13].includes(code)));
    });
    if (rawValue !== undefined && rawValue !== null && typeof rawValue !== 'string') errors[field.key] = `${field.label} must be text.`;
    else if (field.required && !value) errors[field.key] = `${field.label} is required.`;
    else if (value.length > field.maxLength!) errors[field.key] = `${field.label} must be ${field.maxLength} characters or fewer.`;
    else if (hasControls) errors[field.key] = `${field.label} contains invalid characters.`;
    else if (value && field.options && !field.options.includes(value)) errors[field.key] = `Choose a valid ${field.label.toLowerCase()}.`;
    else if (value && field.pattern && !new RegExp(`^(?:${field.pattern})$`, 'u').test(value)) errors[field.key] = `${field.label}: ${field.validationMessage}`;
    else if (value && field.type === 'email' && !validEmail(value)) errors[field.key] = `Enter a valid ${field.label.toLowerCase()}.`;
    else if (value && !['select', 'email', 'tel', 'date'].includes(field.type ?? 'text') && !/[\p{L}\p{N}]/u.test(value)) errors[field.key] = `${field.label} must contain letters or numbers.`;
  }
  if (data.schoolYear !== schoolYear) errors.schoolYear = 'The school year does not match the current enrollment period. Reload the page.';
  const age = ageAt(data.birthday, today);
  if (age === '' || Number(age) > 120) errors.birthday = 'Enter a valid birthday that is not in the future.';
  data.age = age;
  for (const relationship of ['father', 'mother', 'guardian']) {
    if ((data[`${relationship}Occupation`] || data[`${relationship}Contact`]) && !data[`${relationship}FullName`]) {
      errors[`${relationship}FullName`] = `${relationship[0].toUpperCase()}${relationship.slice(1)}’s full name is required when other details are supplied.`;
    }
  }
  if (data.level !== 'SHS') data.strand = '';
  return { data, errors };
}
// Leave room for multipart fields beneath Vercel's 4.5 MB request limit.
export const maxAttachmentBytes = 4 * 1024 * 1024;
export function attachmentError(file: { size: number; type: string; name: string }): string {
  if (!file.size) return 'Supporting document is empty.';
  if (file.size > maxAttachmentBytes) return 'Supporting document must be 4 MB or smaller.';
  const extensions: Record<string, RegExp> = { 'application/pdf': /\.pdf$/i, 'image/jpeg': /\.jpe?g$/i, 'image/png': /\.png$/i };
  if (!extensions[file.type]?.test(file.name)) return 'Supporting document must be a PDF, JPG, or PNG file.';
  return '';
}
