import { computed, shallowRef } from "vue";
import { getPublicAnnouncements, getPublicEvents } from "@/lib/content/content";
import type { Announcement, SchoolEvent } from "@/lib/content/model";
import { isPubliclyVisible } from "@/lib/content/selectors";
import { getPublicSupabaseClient } from "@/lib/supabase";
import { cmsDatabaseEnabled, cmsPreviewEnabled } from "./config";
import { contentItem, summaryOf, type ContentRow } from "./database";
import { useCmsLibrary } from "./store";
import type { CmsItem } from "./preview";
import { sourceAnnouncements, sourceEvents } from "./website-items";
import { imageForDisplay, type CmsImageAssets } from "./images";

const previewSummary = summaryOf;
// The built-in copy of a school notice (category, photo, end date, link to the school's site),
// matched by id in the browser preview and by page identifier in the database.
const sourceFor = <T extends { id: string; slug: string }>(list: T[], item: CmsItem) =>
  list.find((entry) => entry.id === item.id) ?? list.find((entry) => entry.slug === item.slug);

function uploadedImages(item: CmsItem, assets: CmsImageAssets) {
  return (item.images ?? []).flatMap((image) => imageForDisplay(image, assets[image.id]) ?? []);
}

function toAnnouncement(item: CmsItem, assets: CmsImageAssets): Announcement {
  const source = sourceFor(sourceAnnouncements, item);
  const unchangedBody = source?.body.join("\n\n") === item.body;
  const gallery = uploadedImages(item, assets);
  return {
    ...item,
    category: source?.category ?? "School Advisory",
    publishedAt: item.publishedAt ?? source?.publishedAt ?? null,
    summary: unchangedBody ? source.summary : previewSummary(item.body),
    body: unchangedBody ? source.body : [],
    formattedBody: unchangedBody ? undefined : item.body,
    image: gallery[0] ?? source?.image,
    gallery,
    sourceUrl: source?.sourceUrl,
  };
}

function toEvent(item: CmsItem, assets: CmsImageAssets): SchoolEvent {
  const source = sourceFor(sourceEvents, item);
  return {
    ...item,
    publishedAt: item.publishedAt ?? source?.publishedAt ?? null,
    startDate: item.eventDate,
    endDate: item.eventDate === source?.startDate ? source.endDate : item.eventDate,
    location: source?.location ?? null,
    summary: previewSummary(item.body),
    formattedBody: item.body === source?.summary ? undefined : item.body,
    gallery: uploadedImages(item, assets),
    sourceUrl: source?.sourceUrl,
  };
}

// Public pages and search share this one CMS data source. In database mode, do not fall
// back to built-in notices: an Admin may have unpublished or made those notices private.
// Prerendered pages in database mode show a loading state until the browser fetches content.
const databaseMode = cmsDatabaseEnabled || import.meta.env.VITE_CMS_DATABASE === "true";
const databaseContent = shallowRef<{ items: CmsItem[]; assets: CmsImageAssets } | null>(null);
const databaseLoading = shallowRef(databaseMode && import.meta.env.SSR);
const databaseError = shallowRef("");
let request: Promise<void> | undefined;

export function refreshPublishedContent(): Promise<void> {
  if (!databaseMode || import.meta.env.SSR) return Promise.resolve();
  if (!cmsDatabaseEnabled) {
    databaseError.value = "School updates could not be loaded. Please try again.";
    return Promise.resolve();
  }
  if (request) return request;
  databaseLoading.value = true;
  databaseError.value = "";
  // Keep the last verified results in place while checking for publication changes.
  const pending = (async () => {
    try {
      const { data, error } = await getPublicSupabaseClient().rpc("cms_public_content");
      if (error || !Array.isArray(data)) throw new Error("Published content unavailable");
      const mapped = (data as ContentRow[]).map(contentItem);
      databaseContent.value = { items: mapped.map((entry) => entry.item), assets: Object.assign({}, ...mapped.map((entry) => entry.assets)) };
    } catch {
      databaseContent.value = null;
      databaseError.value = "School updates could not be loaded. Please try again.";
    } finally {
      databaseLoading.value = false;
    }
  })();
  request = pending;
  void pending.then(() => { if (request === pending) request = undefined; });
  return pending;
}

export function usePublicWebsite() {
  if (databaseMode) void refreshPublishedContent();
  const library = !databaseMode && cmsPreviewEnabled ? useCmsLibrary() : undefined;
  const source = computed(() => databaseMode ? databaseContent.value
    : library ? { items: library.value.items, assets: library.value.imageAssets } : null);
  const published = computed(() => source.value?.items.filter(isPubliclyVisible) ?? []);
  const assets = computed(() => source.value?.assets ?? {});
  return {
    loading: computed(() => databaseLoading.value),
    initialLoading: computed(() => databaseLoading.value && databaseContent.value === null),
    error: computed(() => databaseMode ? databaseError.value : ""),
    refresh: refreshPublishedContent,
    announcements: computed(() => databaseMode || source.value
      ? published.value.filter((item) => item.type === "announcement")
        .map((item) => toAnnouncement(item, assets.value)).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      : getPublicAnnouncements()),
    events: computed(() => databaseMode || source.value
      ? published.value.filter((item) => item.type === "event" && item.eventDate).map((item) => toEvent(item, assets.value))
      : getPublicEvents()),
    pages: computed(() => published.value.filter((item) => item.type === "page").map((item) => ({
      ...item, gallery: uploadedImages(item, assets.value),
    }))),
  };
}
