import { getPublicAnnouncements, getPublicEvents } from "@/lib/content/content";
import { blankItem } from "./preview";

export const sourceAnnouncements = getPublicAnnouncements();
export const sourceEvents = getPublicEvents();

export const websiteItems = [
  ...sourceAnnouncements.map((item) => ({
    ...blankItem("announcement"), ...item, body: item.body.join("\n\n"),
    createdBy: "SNCS website", updatedBy: "SNCS website",
  })),
  ...sourceEvents.map((item) => ({
    ...blankItem("event"), ...item, body: item.summary, eventDate: item.startDate,
    createdBy: "SNCS website", updatedBy: "SNCS website",
  })),
];
