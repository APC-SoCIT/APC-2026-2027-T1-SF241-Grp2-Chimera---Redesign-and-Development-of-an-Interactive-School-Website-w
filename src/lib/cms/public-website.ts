import { computed } from "vue";
import { getPublicAnnouncements, getPublicEvents } from "@/lib/content/content";
import type { Announcement, SchoolEvent } from "@/lib/content/model";
import { cmsPreviewEnabled } from "./config";
import { useCmsLibrary } from "./store";
import type { CmsItem } from "./preview";
import { sourceAnnouncements, sourceEvents } from "./website-items";
import { imageForDisplay, type CmsImageAssets } from "./images";

function isVisible(item: CmsItem) {
  return item.status === "published" && item.visibility === "public" && !item.deletedAt;
}

function previewSummary(body: string) {
  const line = body.split("\n").find((entry) => entry.trim() && !entry.startsWith("## ")) ?? "";
  return line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^[-#]+\s*|\*/g, "").trim();
}

function uploadedImages(item: CmsItem, assets: CmsImageAssets) {
  return (item.images ?? []).flatMap((image) => imageForDisplay(image, assets[image.id]) ?? []);
}

function toAnnouncement(item: CmsItem, assets: CmsImageAssets): Announcement {
  const source = sourceAnnouncements.find((entry) => entry.id === item.id);
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
  const source = sourceEvents.find((entry) => entry.id === item.id);
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

export function usePublicWebsite() {
  const library = cmsPreviewEnabled ? useCmsLibrary() : undefined;
  const published = computed(() => library?.value.items.filter(isVisible) ?? []);
  const assets = computed(() => library?.value.imageAssets ?? {});
  return {
    announcements: computed(() => library
      ? published.value.filter((item) => item.type === "announcement")
        .map((item) => toAnnouncement(item, assets.value)).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      : getPublicAnnouncements()),
    events: computed(() => library
      ? published.value.filter((item) => item.type === "event" && item.eventDate).map((item) => toEvent(item, assets.value))
      : getPublicEvents()),
    pages: computed(() => published.value.filter((item) => item.type === "page").map((item) => ({
      ...item, gallery: uploadedImages(item, assets.value),
    }))),
  };
}
