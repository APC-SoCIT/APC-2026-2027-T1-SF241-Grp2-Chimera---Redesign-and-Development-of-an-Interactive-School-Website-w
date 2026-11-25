// The content workspace runs in the browser only (never in the prerendered pages).
// VITE_CMS_PREVIEW=true shows it on a deployed site; local development always shows it.
// Database mode (VITE_CMS_DATABASE=true) turns it on as well.
const databaseRequested = import.meta.env.VITE_CMS_DATABASE === "true";

// With VITE_CMS_DATABASE=true and the site's Supabase keys, the workspace saves to the school
// database (cms_content, resources and the storage buckets) and the public pages show what is
// published there. Turn it on only after migration 202611260001_pb01_cms_database.sql is applied.
// Otherwise it is a preview that keeps changes in this browser.
export const cmsDatabaseEnabled = !import.meta.env.SSR && databaseRequested
  && /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(String(import.meta.env.VITE_SUPABASE_URL ?? ""))
  && String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").startsWith("sb_publishable_");

export const cmsPreviewEnabled = !import.meta.env.SSR
  && (import.meta.env.DEV || import.meta.env.VITE_CMS_PREVIEW === "true" || databaseRequested);
