import { computed } from "vue";
import { getPublicAnnouncements, getPublicEvents } from "@/lib/content/content";
import type { Announcement, SchoolEvent } from "@/lib/content/model";
import { cmsPreviewEnabled } from "./config";
import { useCmsLibrary } from "./store";
import type { CmsItem } from "./preview";
import { sourceAnnouncements, sourceEvents } from "./website-items";

function isVisible(item: CmsItem) {
  return item.status === "published" && item.visibility === "public" && !item.deletedAt;
}

function previewSummary(body: string) {
  const line = body.split("\n").find((entry) => entry.trim() && !entry.startsWith("## ")) ?? "";
  return line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^[-#]+\s*|\*/g, "").trim();
}

function toAnnouncement(item: CmsItem): Announcement {
  const source = sourceAnnouncements.find((entry) => entry.id === item.id);
  const unchangedBody = source?.body.join("\n\n") === item.body;
  return {
    ...item,
    category: source?.category ?? "School Advisory",
    publishedAt: item.publishedAt ?? source?.publishedAt ?? null,
    summary: unchangedBody ? source.summary : previewSummary(item.body),
    body: unchangedBody ? source.body : [],
    formattedBody: unchangedBody ? undefined : item.body,
    image: source?.image,
    sourceUrl: source?.sourceUrl,
  };
}

function toEvent(item: CmsItem): SchoolEvent {
  const source = sourceEvents.find((entry) => entry.id === item.id);
  return {
    ...item,
    publishedAt: item.publishedAt ?? source?.publishedAt ?? null,
    startDate: item.eventDate,
    endDate: item.eventDate === source?.startDate ? source.endDate : item.eventDate,
    location: source?.location ?? null,
    summary: previewSummary(item.body),
    formattedBody: item.body === source?.summary ? undefined : item.body,
    sourceUrl: source?.sourceUrl,
  };
}

export function usePublicWebsite() {
  const library = cmsPreviewEnabled ? useCmsLibrary() : undefined;
  const published = computed(() => library?.value.items.filter(isVisible) ?? []);
  return {
    announcements: computed(() => library
      ? published.value.filter((item) => item.type === "announcement")
        .map(toAnnouncement).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      : getPublicAnnouncements()),
    events: computed(() => library
      ? published.value.filter((item) => item.type === "event" && item.eventDate).map(toEvent)
      : getPublicEvents()),
    pages: computed(() => published.value.filter((item) => item.type === "page")),
  };
}
