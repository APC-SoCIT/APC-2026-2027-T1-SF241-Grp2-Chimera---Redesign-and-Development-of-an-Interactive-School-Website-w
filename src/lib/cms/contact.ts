/*
 * Author: Gian Mandac
 * Created Date: 20261126
 * Where the school's contact details are kept:
 * - database: site_content ('contact') through cms_public_site_content, cms_get_site_content and
 *   cms_save_site_content, shared by every Admin and visitor;
 * - browser: this browser's storage, for the local preview without database keys.
 * Visitors see the built-in details until the saved copy arrives, or if it cannot be loaded.
 */
import { computed, shallowRef, type ComputedRef } from "vue";
import { contactDetailsProblems, defaultContactDetails, readContactDetails, tidyContactDetails, type ContactDetails } from "@/lib/content/contact";
import { getPublicSupabaseClient, getStaffSupabaseClient } from "@/lib/supabase";
import { cmsDatabaseEnabled, cmsPreviewEnabled } from "./config";
import { CmsError } from "./database";

export interface EditableContactDetails {
  details: ContactDetails;
  /** The saved version this copy came from; null before the first save. */
  updatedAt: string | null;
  updatedBy: string;
}

const browserKey = "sncs-cms-contact-details";
const saved = shallowRef<ContactDetails | null>(null);
let request: Promise<void> | undefined;

function readBrowserCopy(): EditableContactDetails | null {
  try {
    const stored = JSON.parse(localStorage.getItem(browserKey) ?? "null") as Partial<EditableContactDetails> | null;
    const details = readContactDetails(stored?.details);
    return details ? { details, updatedAt: stored?.updatedAt ?? null, updatedBy: stored?.updatedBy ?? "" } : null;
  } catch {
    return null;
  }
}

function loadSavedDetails() {
  request ??= (async () => {
    // After the page has been drawn, so the first paint matches the prerendered page.
    await Promise.resolve();
    if (!cmsDatabaseEnabled) {
      saved.value = readBrowserCopy()?.details ?? null;
      return;
    }
    try {
      const { data, error } = await getPublicSupabaseClient().rpc("cms_public_site_content");
      if (error || !Array.isArray(data)) throw error;
      const row = (data as { key: string; content: unknown }[]).find((entry) => entry.key === "contact");
      saved.value = row ? readContactDetails(row.content) : null;
    } catch {
      request = undefined; // Keep the built-in details; try again on the next page.
    }
  })();
}

/** The contact details visitors see: the Admin-edited copy when available, otherwise the built-in one. */
export function usePublicContactDetails(): ComputedRef<ContactDetails> {
  if (cmsDatabaseEnabled || cmsPreviewEnabled) loadSavedDetails();
  return computed(() => saved.value ?? defaultContactDetails);
}

/** Admins: the current details to edit, with who saved them last. */
export async function loadContactForEditing(): Promise<EditableContactDetails> {
  if (!cmsDatabaseEnabled) {
    return readBrowserCopy() ?? { details: defaultContactDetails, updatedAt: null, updatedBy: "SNCS website" };
  }
  const { data, error } = await getStaffSupabaseClient().rpc("cms_get_site_content", { p_key: "contact" });
  if (error) throw new CmsError(error.message || "The contact details could not be loaded.");
  const row = (Array.isArray(data) ? data[0] : null) as { content: unknown; updatedAt: string; updatedByName: string | null } | null;
  if (!row) return { details: defaultContactDetails, updatedAt: null, updatedBy: "SNCS website" };
  return { details: readContactDetails(row.content) ?? defaultContactDetails, updatedAt: row.updatedAt, updatedBy: row.updatedByName || "SNCS website" };
}

/**
 * Admins: saves the details if they pass every check and nobody else saved in the meantime.
 * Returns the newly saved copy.
 */
export async function saveContactDetails(details: ContactDetails, edited: EditableContactDetails, actor: string): Promise<EditableContactDetails> {
  const next = tidyContactDetails(details);
  if (Object.keys(contactDetailsProblems(next)).length) throw new CmsError("Review the highlighted fields before saving.");
  if (!cmsDatabaseEnabled) {
    if ((readBrowserCopy()?.updatedAt ?? null) !== edited.updatedAt) throw new CmsError("These details changed in another tab. Reload to see the changes.");
    const copy = { details: next, updatedAt: new Date().toISOString(), updatedBy: actor };
    try {
      localStorage.setItem(browserKey, JSON.stringify(copy));
    } catch {
      throw new CmsError("Browser storage is unavailable.");
    }
    saved.value = next;
    return copy;
  }
  const { data, error } = await getStaffSupabaseClient().rpc("cms_save_site_content", {
    p_key: "contact", p_content: next, p_expected_updated_at: edited.updatedAt,
  });
  if (error) throw new CmsError(error.message || "The contact details could not be saved.");
  saved.value = next;
  return { details: next, updatedAt: String(data), updatedBy: actor };
}
