/*
 * Author: Gian Mandac
 * Created Date: 20261116
 * Registrar portal data access for Manage Enrollment Application. Every call goes
 * through a role-checked database function; the browser never reads the tables.
 */
import { getStaffSupabaseClient } from "@/lib/supabase";

export const applicationStatuses = {
  pending: "Pending",
  for_review: "For Review",
  complete: "Complete",
  incomplete: "Incomplete",
} as const;
export type ApplicationStatus = keyof typeof applicationStatuses;
/** Statuses a Registrar can set; Pending is the submission state only. */
export const processingStatuses = ["for_review", "complete", "incomplete"] as const;
export type ProcessingStatus = (typeof processingStatuses)[number];

export const searchPageSize = 25;

export type ApplicationSummary = {
  reference_no: string;
  first_name: string;
  surname: string;
  grade_level: string;
  status: ApplicationStatus;
  submitted_at: string;
};

export type ApplicationFilters = { query: string; status: ApplicationStatus | ""; from: string; to: string };

export type Guardian = { relationship: "father" | "mother" | "guardian"; full_name: string; occupation: string | null; contact_number: string | null };
export type ApplicationDocument = { id: number; document_type: string; uploaded_at: string };

export type ApplicationDetail = {
  id: number;
  reference_no: string;
  school_year: string;
  department: "preschool" | "grade_school" | "jhs" | "shs";
  applicant_type: "new" | "old" | "returnee";
  grade_level: string;
  strand: string | null;
  mode_of_payment: string;
  surname: string;
  first_name: string;
  middle_name: string | null;
  birth_date: string;
  gender: string;
  place_of_birth: string;
  religion: string;
  complete_address: string;
  contact_numbers: string;
  email: string;
  parent_email: string | null;
  guardian_messenger: string;
  last_school_name: string | null;
  last_school_address: string | null;
  status: ApplicationStatus;
  registrar_remarks: string | null;
  privacy_consent_at: string;
  submitted_at: string;
  guardians: Guardian[];
  documents: ApplicationDocument[];
  requirement_checks: Record<string, boolean>;
};

export class RegistrarError extends Error {
  constructor(public readonly kind: "access" | "not-found" | "invalid" | "unavailable", message: string) {
    super(message);
  }
}

function toRegistrarError(error: { code?: string; message?: string }): RegistrarError {
  if (error.code === "42501") return new RegistrarError("access", "Registrar access is required. Sign in again with a Registrar account.");
  if (error.code === "P0002") return new RegistrarError("not-found", "Application not found.");
  if (error.code === "22023") return new RegistrarError("invalid", error.message || "Check the entered values.");
  return new RegistrarError("unavailable", "The enrollment service is unavailable. Try again.");
}

export async function searchApplications(filters: ApplicationFilters, offset: number) {
  const { data, error } = await getStaffSupabaseClient().rpc("search_registrar_applications", {
    p_query: filters.query.trim() || null,
    p_status: filters.status || null,
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_offset: offset,
  });
  if (error) throw toRegistrarError(error);
  const rows = (data ?? []) as ApplicationSummary[];
  return { rows: rows.slice(0, searchPageSize), hasMore: rows.length > searchPageSize };
}

export async function getApplication(reference: string): Promise<ApplicationDetail> {
  const { data, error } = await getStaffSupabaseClient().rpc("get_registrar_application", { p_reference: reference });
  if (error) throw toRegistrarError(error);
  if (!data) throw new RegistrarError("not-found", "Application not found.");
  return data as ApplicationDetail;
}

export async function setRequirement(reference: string, requirement: string, received: boolean) {
  const { error } = await getStaffSupabaseClient().rpc("set_application_requirement", {
    p_reference: reference, p_requirement: requirement, p_received: received,
  });
  if (error) throw toRegistrarError(error);
}

export async function updateStatus(reference: string, status: ProcessingStatus, remarks: string) {
  const { data, error } = await getStaffSupabaseClient().rpc("update_application_status", {
    p_reference: reference, p_status: status, p_remarks: remarks,
  });
  if (error) throw toRegistrarError(error);
  return data as { status: ApplicationStatus; registrar_remarks: string | null; changed: boolean };
}

/** Trigger Outbound Status Email: the edge function reads the recipient and status from the database. */
export async function sendStatusEmail(reference: string) {
  const { error } = await getStaffSupabaseClient().functions.invoke("send-application-status-email", {
    body: { reference_no: reference },
  });
  if (error) throw new RegistrarError("unavailable", "The status email could not be sent.");
}
