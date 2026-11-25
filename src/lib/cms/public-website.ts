import { computed, shallowRef } from "vue";
import { getPublicAnnouncements, getPublicEvents } from "@/lib/content/content";
import type { Announcement, SchoolEvent } from "@/lib/content/model";
import { getPublicSupabaseClient } from "@/lib/supabase";
import { cmsDatabaseEnabled, cmsPreviewEnabled } from "./config";
import { contentItem, summaryOf, type ContentRow } from "./database";
import { useCmsLibrary } from "./store";
import type { CmsItem } from "./preview";
import { sourceAnnouncements, sourceEvents } from "./website-items";
import { imageForDisplay, type CmsImageAssets } from "./images";

function isVisible(item: CmsItem) {
  return item.status === "published" && item.visibility === "public" && !item.deletedAt;
}

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

// Published content from the school database, loaded once per visit. Until it arrives (and in
// the prerendered pages) visitors see the built-in content, so pages never start empty.
const databaseContent = shallowRef<{ items: CmsItem[]; assets: CmsImageAssets } | null>(null);
let request: Promise<void> | undefined;

function loadPublishedContent() {
  request ??= (async () => {
    try {
      const { data, error } = await getPublicSupabaseClient().rpc("cms_public_content");
      if (error || !Array.isArray(data)) throw error;
      const mapped = (data as ContentRow[]).map((row) => contentItem({ ...row, status: "published" }));
      databaseContent.value = { items: mapped.map((entry) => entry.item), assets: Object.assign({}, ...mapped.map((entry) => entry.assets)) };
    } catch {
      request = undefined; // Keep the built-in content; try again on the next page.
    }
  })();
}

export function usePublicWebsite() {
  if (cmsDatabaseEnabled) loadPublishedContent();
  const library = !cmsDatabaseEnabled && cmsPreviewEnabled ? useCmsLibrary() : undefined;
  const source = computed(() => cmsDatabaseEnabled ? databaseContent.value
    : library ? { items: library.value.items, assets: library.value.imageAssets } : null);
  const published = computed(() => source.value?.items.filter(isVisible) ?? []);
  const assets = computed(() => source.value?.assets ?? {});
  return {
    announcements: computed(() => source.value
      ? published.value.filter((item) => item.type === "announcement")
        .map((item) => toAnnouncement(item, assets.value)).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      : getPublicAnnouncements()),
    events: computed(() => source.value
      ? published.value.filter((item) => item.type === "event" && item.eventDate).map((item) => toEvent(item, assets.value))
      : getPublicEvents()),
    pages: computed(() => published.value.filter((item) => item.type === "page").map((item) => ({
      ...item, gallery: uploadedImages(item, assets.value),
    }))),
  };
}
