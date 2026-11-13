/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261113
 */
import { getStaffSupabaseClient } from "./supabase";

// The database verifies the caller's token and checks the current staff record.
export async function hasAdminAccess(): Promise<boolean> {
  const client = getStaffSupabaseClient();
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) return false;
  const { data, error } = await client.rpc("has_active_admin_access");
  if (error) throw error;
  return data === true;
}

// Admin Sign-in START
export async function signInAdmin(email: string, password: string): Promise<boolean> {
  const { auth } = getStaffSupabaseClient();
  const { data, error } = await auth.signInWithPassword({ email, password });
  if (error) {
    if (["invalid_credentials", "email_not_confirmed", "user_banned"].includes(error.code ?? "")) return false;
    throw error;
  }
  if (!data.session) return false;

  let accessError: unknown;
  try {
    if (await hasAdminAccess()) return true;
  } catch (error) {
    accessError = error;
  }
  // A valid Supabase login by itself does not grant access to the staff portal.
  const { error: signOutError } = await auth.signOut({ scope: "local" });
  if (accessError) throw accessError;
  if (signOutError) throw signOutError;
  return false;
}
// Admin Sign-in END
