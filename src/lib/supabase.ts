/*
 * Author: gemillan321 | Email: miles.gemillan77@gmail.com
 * Created Date: 20261002
 * Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Modified Date: 20261113
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let publicClient: SupabaseClient | undefined;
let staffClient: SupabaseClient | undefined;

function browserConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof url !== "string" || !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)
    || typeof key !== "string" || !key.startsWith("sb_publishable_")) {
    throw new Error("Supabase browser configuration is unavailable.");
  }
  return { url, key };
}

export function getPublicSupabaseClient(): SupabaseClient {
  if (publicClient) return publicClient;
  const { url, key } = browserConfig();
  publicClient = createClient(url, key, {
    auth: {
      storageKey: "sncs-public-resources",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return publicClient;
}

export function getStaffSupabaseClient(): SupabaseClient {
  if (staffClient) return staffClient;
  const { url, key } = browserConfig();
  staffClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return staffClient;
}
