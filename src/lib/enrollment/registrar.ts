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

/**
 * Trigger Outbound Status Email: the backend sends it through Gmail and reads the
 * recipient and status from the database with the Registrar's own session.
 * Modified by: Gian Mandac (Date: 20261127): moved from the edge function to /api/staff/status-email.
 */
export async function sendStatusEmail(reference: string) {
  const { data: { session } } = await getStaffSupabaseClient().auth.getSession();
  if (!session) throw new RegistrarError("access", "Sign in again to send the email.");
  const response = await fetch("/api/staff/status-email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ reference_no: reference }),
  });
  if (!response.ok) throw new RegistrarError("unavailable", "The status email could not be sent.");
}

export type StatusCount = { count: number; more: boolean; oldest?: string };

/**
 * Live status counts for the Registrar dashboard. Uses the same role-checked search,
 * one call per status; a page holds 25 rows, so larger totals are shown as "25+".
 */
export async function countApplicationsByStatus(): Promise<Record<ApplicationStatus, StatusCount>> {
  const statuses = Object.keys(applicationStatuses) as ApplicationStatus[];
  const results = await Promise.all(statuses.map((status) =>
    searchApplications({ query: "", status, from: "", to: "" }, 0)));
  return Object.fromEntries(statuses.map((status, index) => {
    const { rows, hasMore } = results[index];
    // Rows are newest first, so the last row is the oldest on this page.
    return [status, { count: rows.length, more: hasMore, oldest: rows.at(-1)?.submitted_at }];
  })) as Record<ApplicationStatus, StatusCount>;
}
