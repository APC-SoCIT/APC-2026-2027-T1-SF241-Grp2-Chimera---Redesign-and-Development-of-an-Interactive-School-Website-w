/*
 * Author: Gian Mandac
 * Created Date: 20261116
 * View Dynamic Requirement Checklist: the requirements an applicant must present onsite,
 * derived from the same SNCS admission rules shown on the public Admissions page
 * (src/lib/content/admissions.ts). Keys are stored in application_requirement_checks.
 * Shared by the Registrar portal (src/lib/enrollment/requirements.ts) and the status
 * email edge function, so the checklist on screen, on paper and in the email match.
 * Keep this file free of imports so both Vite and Deno can load it.
 */

export type Requirement = { key: string; label: string; optional?: boolean };
export type ApplicantProfile = { department: string; applicant_type: string; grade_level: string };

const commonRequirements: Requirement[] = [
  { key: "psa-birth-certificate", label: "PSA birth certificate (two photocopies)" },
  { key: "id-photos", label: "Three recent colored 2 × 2 ID photos" },
  { key: "report-card", label: "Report card with LRN (original and two photocopies, signed by the principal)" },
  { key: "baptismal-certificate", label: "Baptismal certificate, or certificate of dedication for non-Catholic applicants" },
  { key: "marriage-certificate", label: "Parents’ marriage certificate", optional: true },
  { key: "folders-envelope", label: "Two long folders and one long brown envelope" },
];
const entranceExam: Requirement = { key: "entrance-exam", label: "Entrance examination" };
const goodMoral: Requirement = { key: "good-moral", label: "Certificate of good moral character" };
const recommendation: Requirement = { key: "recommendation-form", label: "Recommendation form in a sealed envelope" };
const escCertificate: Requirement = { key: "esc-certificate", label: "ESC certificate from the previous school (ESC grantees only)", optional: true };
const ncaeResult: Requirement = { key: "ncae-result", label: "NCAE result, if available", optional: true };

/** Grade number for Grade 1–12, or null for Nursery and Kindergarten. */
export function gradeNumber(gradeLevel: string): number | null {
  const match = /(\d{1,2})\s*$/.exec(gradeLevel.trim());
  return match ? Number(match[1]) : null;
}

export function requirementsFor(applicant: ApplicantProfile): Requirement[] {
  // Returning (old) students only resubmit their report card.
  if (applicant.applicant_type === "old") {
    return [{ key: "report-card", label: "Report card submitted to the Admission Office" }];
  }

  const grade = gradeNumber(applicant.grade_level);
  if (applicant.department === "preschool" || grade === null) {
    const kindergarten = /kinder/i.test(applicant.grade_level);
    return [
      ...(kindergarten ? [entranceExam] : []),
      ...commonRequirements.map((item) => item.key === "report-card"
        ? { ...item, label: "Report card with LRN, if the applicant has attended school", optional: true }
        : item),
    ];
  }

  const items = [entranceExam, ...commonRequirements];
  const entryGrade = grade === 1 || grade === 7 || grade === 11;
  if (applicant.applicant_type === "new" && entryGrade) {
    if (grade === 7) items.push(goodMoral, recommendation);
    if (grade === 11) items.push(goodMoral, recommendation, escCertificate, ncaeResult);
    return items;
  }

  // Transferees and returnees entering any other grade.
  if (grade >= 4) items.push(goodMoral, recommendation);
  if (grade >= 8) items.push(escCertificate);
  return items;
}

export type ChecklistSummary = { received: number; required: number; complete: boolean };

export function summarizeChecklist(requirements: Requirement[], checks: Record<string, boolean>): ChecklistSummary {
  const required = requirements.filter((item) => !item.optional);
  const received = required.filter((item) => checks[item.key] === true).length;
  return { received, required: required.length, complete: received === required.length };
}

export function splitChecklist(requirements: Requirement[], checks: Record<string, boolean>) {
  return {
    received: requirements.filter((item) => checks[item.key] === true),
    missing: requirements.filter((item) => checks[item.key] !== true && !item.optional),
  };
}
