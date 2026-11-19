import { describe, expect, it } from 'vitest';
import { ageAt, attachmentError, maxAttachmentBytes, needsFormerSchool, sectionsFor, validateApplication } from './form';
import { checklistFor } from './checklist';
import { validApplication } from './fixtures';

describe('registration form validation', () => {
  it('accepts JHS, trims names, calculates age, strips unknown/staff fields and SHS strand', () => {
    const { data, errors } = validateApplication({ ...validApplication, surname: ' Example ', status: 'Complete', strand: '12-STEM', age: '90' }, '2026-2027', '2026-10-01');
    expect(errors).toEqual({});
    expect(data.surname).toBe('Example'); expect(data.age).toBe('13'); expect(data.strand).toBe(''); expect(data.status).toBeUndefined();
  });
  it.each([['Grade 11', '11-ACADEMIC'], ['Grade 11', '11-TECHPRO'], ['Grade 12', '12-STEM'], ['Grade 12', '12-HUMSS'], ['Grade 12', '12-GAS'], ['Grade 12', '12-ABM'], ['Grade 12', '12-ICT']])('accepts SHS %s / %s', (gradeLevel, strand) => {
    expect(validateApplication({ ...validApplication, level: 'SHS', gradeLevel, strand }, '2026-2027').errors).toEqual({});
  });
  it('rejects incorrect level, grade, strand and year combinations', () => {
    expect(validateApplication({ ...validApplication, level: 'SHS', gradeLevel: 'Grade 11', strand: '12-STEM' }, '2027-2028').errors).toHaveProperty('strand');
    expect(validateApplication({ ...validApplication, gradeLevel: 'Grade 12' }, '2027-2028').errors).toHaveProperty('gradeLevel');
    expect(validateApplication(validApplication, '2027-2028').errors).toHaveProperty('schoolYear');
    expect(validateApplication({ ...validApplication, level: 'other' }, '2026-2027').errors).toHaveProperty('level');
  });
  it.each([
    ['Preschool', 'Nursery'], ['Preschool', 'Kindergarten'],
    ...['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'].map(grade => ['Elementary', grade]),
  ])('accepts %s / %s and discards an unrelated SHS strand', (level, gradeLevel) => {
    const { data, errors } = validateApplication({ ...validApplication, level, gradeLevel, strand: '12-STEM' }, '2026-2027');
    expect(errors).toEqual({});
    expect(data.strand).toBe('');
  });
  it.each([
    ['Preschool', 'Grade 1'], ['Elementary', 'Kindergarten'],
    ['Elementary', 'Grade 7'], ['JHS', 'Grade 6'], ['SHS', 'Grade 10'],
  ])('rejects a grade from another school level: %s / %s', (level, gradeLevel) => {
    expect(validateApplication({ ...validApplication, level, gradeLevel }, '2026-2027').errors).toHaveProperty('gradeLevel');
  });
  it('names required fields and validates optional contact details when supplied', () => {
    const errors = validateApplication({ ...validApplication, firstName: '', email: 'bad', parentEmail: 'bad', fatherContact: 'abc', contact: '1234' }, '2026-2027').errors;
    expect(Object.keys(errors)).toEqual(expect.arrayContaining(['firstName', 'email', 'parentEmail', 'fatherContact', 'contact']));
  });
  it.each(['contact', 'fatherContact', 'motherContact', 'guardianContact'])('requires one local 11-digit mobile number for %s', key => {
    for (const value of ['0917123456', '091712345678', '08171234567', '+639171234567', '09abcdefghi', '0917 1234567', '09171234567,09981234567']) {
      expect(validateApplication({ ...validApplication, [key]: value }, '2026-2027').errors).toHaveProperty(key);
    }
    expect(validateApplication({ ...validApplication, fatherFullName: 'Father Example', motherFullName: 'Mother Example', [key]: '09981234567' }, '2026-2027').errors).toEqual({});
  });
  it('accepts names with accents, initials, apostrophes and hyphens, and rejects numbers and markup', () => {
    for (const name of ['Ma. Niño', "O'Connor", 'Dela-Cruz', 'José', '李明', 'De la Peña III']) {
      expect(validateApplication({ ...validApplication, firstName: name }, '2026-2027').errors).toEqual({});
    }
    for (const name of ['123', 'Test99', '<script>', '---']) {
      expect(validateApplication({ ...validApplication, firstName: name }, '2026-2027').errors).toHaveProperty('firstName');
    }
  });
  it.each(sectionsFor({ level: 'SHS', gradeLevel: 'Grade 11' }).flatMap(section => section.fields).filter(field => !field.readOnly))('rejects over-limit and non-string values for $key', field => {
      const base = { ...validApplication, level: 'SHS', gradeLevel: 'Grade 11', strand: '11-ACADEMIC' };
      expect(validateApplication({ ...base, [field.key]: 'x'.repeat(field.maxLength! + 1) }, '2026-2027').errors).toHaveProperty(field.key);
      expect(validateApplication({ ...base, [field.key]: { value: 'forged' } }, '2026-2027').errors).toHaveProperty(field.key);
    });
  it('rejects malformed email domains, repeated dots, and overlong local parts', () => {
    for (const email of ['a..b@example.com', 'a@-example.com', 'a@example..com', 'a@exam_ple.com', `${'a'.repeat(65)}@example.com`]) {
      expect(validateApplication({ ...validApplication, email }, '2026-2027').errors).toHaveProperty('email');
    }
    expect(validateApplication({ ...validApplication, email: 'student+enrollment@example.com' }, '2026-2027').errors).toEqual({});
  });
  it('rejects invisible controls and symbol-only text, but allows multiline addresses', () => {
    expect(validateApplication({ ...validApplication, messenger: 'Example\u0000Guardian', religion: '---' }, '2026-2027').errors)
      .toMatchObject({ messenger: expect.any(String), religion: expect.any(String) });
    expect(validateApplication({ ...validApplication, address: '123 Main Street\nTaguig City' }, '2026-2027').errors).toEqual({});
  });
  it('rejects inherited object keys as grade choices without crashing', () => {
    expect(validateApplication({ ...validApplication, level: 'SHS', gradeLevel: 'constructor', strand: 'forged' }, '2026-2027').errors)
      .toMatchObject({ gradeLevel: expect.any(String), strand: expect.any(String) });
  });
  it('requires the schema-required fields and the full name of any supplied guardian', () => {
    const result = validateApplication({ ...validApplication, religion: '', messenger: '', fatherOccupation: 'Teacher' }, '2026-2027');
    expect(Object.keys(result.errors)).toEqual(expect.arrayContaining(['religion', 'messenger', 'fatherFullName']));
    expect(validateApplication({ ...validApplication, guardianFullName: '', guardianContact: '', previousAddress: '' }, '2026-2027').errors).toEqual({});
    // The former school is optional only when the checklist needs nothing from it (old students, pre-school).
    expect(validateApplication({ ...validApplication, studentStatus: 'Old', previousSchool: '', previousAddress: '' }, '2026-2027').errors).toEqual({});
    expect(validateApplication({ ...validApplication, previousSchool: '' }, '2026-2027').errors).toEqual({ previousSchool: 'Former school’s name is required.' });
  });
  it('handles birthdays, leap dates and future dates', () => {
    expect(ageAt('2010-10-02', '2026-10-01')).toBe('15');
    expect(ageAt('2010-10-01', '2026-10-01')).toBe('16');
    expect(ageAt('2013-02-29')).toBe('');
    expect(ageAt('2027-01-01', '2026-10-01')).toBe('');
  });
  it('collects only fields supported by the supplied schema plus derived age/year', () => {
    const keys = sectionsFor({ level: 'JHS' }).flatMap(s => s.fields.map(f => f.key));
    expect(keys).toHaveLength(29);
    expect(sectionsFor({ level: 'SHS' }).flatMap(s => s.fields)).toHaveLength(30);
    for (const key of ['siblings', 'fatherOfficeAddress', 'guardianRelation', 'previousGrade', 'adviser']) expect(keys).not.toContain(key);
  });
  it('limits file size, extension and MIME type', () => {
    expect(attachmentError({ size: maxAttachmentBytes, type: 'application/pdf', name: 'file.pdf' })).toBe('');
    expect(attachmentError({ size: maxAttachmentBytes + 1, type: 'application/pdf', name: 'file.pdf' })).toContain('4 MB');
    expect(attachmentError({ size: 1, type: 'image/png', name: 'file.exe' })).toContain('PDF');
    expect(attachmentError({ size: 0, type: 'application/pdf', name: 'file.pdf' })).toContain('empty');
  });
});

describe('former school and the applicant checklist', () => {
  const base = { ...validApplication };
  it('requires the former school whenever the checklist needs documents from it', () => {
    expect(needsFormerSchool({ level: 'JHS', studentStatus: 'New' })).toBe(true);
    expect(needsFormerSchool({ level: 'Elementary', studentStatus: 'Returnee' })).toBe(true);
    expect(needsFormerSchool({ level: 'JHS', studentStatus: 'Old' })).toBe(false);
    expect(needsFormerSchool({ level: 'Preschool', studentStatus: 'New' })).toBe(false);
    expect(validateApplication({ ...base, previousSchool: '' }, '2026-2027', '2026-11-19').errors.previousSchool).toBeTruthy();
    expect(validateApplication({ ...base, studentStatus: 'Old', previousSchool: '' }, '2026-2027', '2026-11-19').errors.previousSchool).toBeUndefined();
    expect(validateApplication({ ...base, level: 'Preschool', gradeLevel: 'Nursery', previousSchool: '' }, '2026-2027', '2026-11-19').errors.previousSchool).toBeUndefined();
  });

  it('builds the same checklist the Registrar sees from the form answers', () => {
    const items = checklistFor(base);
    expect(items.map((item) => item.key)).toEqual(['entrance-exam', 'psa-birth-certificate', 'id-photos', 'report-card', 'baptismal-certificate',
      'marriage-certificate', 'folders-envelope', 'good-moral', 'recommendation-form']);
    expect(items.find((item) => item.key === 'baptismal-certificate')?.label).toBe('Baptismal certificate');
    expect(checklistFor({ ...base, studentStatus: 'Old' }).map((item) => item.key)).toEqual(['report-card']);
    expect(checklistFor({ ...base, gradeLevel: '' })).toEqual([]);
  });
});

