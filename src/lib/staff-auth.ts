/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261113
 * Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Modified Date: 20261114
 */
import { getStaffSupabaseClient } from "./supabase";

export type StaffRole = "admin" | "registrar" | "teacher";
export type StaffAccess = StaffRole | "password-change";
export const staffDashboard = {
  admin: "admin-dashboard",
  registrar: "registrar-dashboard",
  teacher: "teacher-dashboard",
} as const satisfies Record<StaffRole, string>;

// The database verifies the caller's token and checks the current staff record.
export async function getStaffPortalRole(): Promise<StaffAccess | null> {
  const client = getStaffSupabaseClient();
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.expires_at || session.expires_at * 1000 <= Date.now()) return null;
  const { data, error } = await client.rpc("get_staff_portal_role");
  if (error) throw error;
  return data === "admin" || data === "registrar" || data === "teacher" || data === "password-change" ? data : null;
}

// Staff Sign-in START
export async function signInStaff(email: string, password: string): Promise<StaffAccess | null> {
  const { auth } = getStaffSupabaseClient();
  const { data, error } = await auth.signInWithPassword({ email, password });
  if (error) {
    if (["invalid_credentials", "email_not_confirmed", "user_banned"].includes(error.code ?? "")) return null;
    throw error;
  }
  if (!data.session) return null;

  let accessError: unknown;
  try {
    const role = await getStaffPortalRole();
    if (role) return role;
  } catch (error) {
    accessError = error;
  }
  // A valid Supabase login by itself does not grant access to the staff portal.
  const { error: signOutError } = await auth.signOut({ scope: "local" });
  if (accessError) throw accessError;
  if (signOutError) throw signOutError;
  return null;
}
// Staff Sign-in END
