import type { ContentVisibility, PublicationStatus } from "@/lib/content/model";
import type { CmsImage } from "./images";

export const contentTypes = ["announcement", "event", "page"] as const;
export type ContentType = typeof contentTypes[number];
export type ItemType = ContentType | "resource";

export const itemLabels: Record<ItemType, string> = {
  announcement: "Announcement",
  event: "Event",
  page: "Page",
  resource: "PDF resource",
};

export interface CmsItem {
  id: string;
  type: ItemType;
  title: string;
  status: PublicationStatus;
  slug: string;
  body: string;
  eventDate: string;
  category: string;
  visibility: ContentVisibility;
  fileName: string;
  fileSize: number;
  /** Where the PDF is in the resource-files bucket (database workspace only). */
  storagePath?: string;
  createdBy: string;
  updatedBy: string;
  updatedAt: string;
  deletedAt?: string;
  publishedAt?: string | null;
  images?: CmsImage[];
}

export const demoAdmin = "Demo Administrator";
export const storageKey = "sncs-cms-preview-v1";

export function blankItem(type: ItemType): CmsItem {
  return {
    id: "", type, status: "draft", title: "", slug: "", body: "", eventDate: "",
    category: "", visibility: "public", fileName: "", fileSize: 0,
    createdBy: demoAdmin, updatedBy: demoAdmin, updatedAt: "",
  };
}

function fixture(id: string, type: ItemType, title: string, status: PublicationStatus, day: number, fields: Partial<CmsItem> = {}): CmsItem {
  return {
    ...blankItem(type), id, title, slug: slugify(title), status,
    body: "Families can contact the school office for more information.",
    updatedAt: new Date(Date.UTC(2026, 10, day, 3)).toISOString(), ...fields,
  };
}

export const sampleItems = [
  fixture("c1", "announcement", "Enrollment advisory for incoming students", "draft", 16, {
    body: "## Before you apply\nPlease review the requirements and prepare your documents before visiting the Registrar.\n\n- Bring your latest report card.\n- Check the [admissions page](/admissions) for the full list.",
  }),
  fixture("c2", "event", "Advent recollection and school Mass", "draft", 15, {
    eventDate: "2026-12-04", body: "Students and families are invited to join our Advent recollection and school Mass.",
  }),
  fixture("c3", "page", "Mission, vision and core values", "draft", 14, {
    body: "## Our mission\nSto. Niño Catholic School fosters academic growth and formation grounded in the Catholic faith.",
  }),
  fixture("c4", "announcement", "Parent–teacher conference reminder", "draft", 12),
  fixture("c5", "event", "Campus open house", "draft", 10, { eventDate: "2026-12-12" }),
  fixture("c6", "page", "School services and office hours", "archived", 8),
  fixture("r1", "resource", "Grade 7 TLC application form", "published", 14, {
    category: "Admission Forms", fileName: "grade-7-tlc-application.pdf", fileSize: 431276,
  }),
  fixture("r2", "resource", "Scholar transfer application form", "draft", 13, {
    category: "Admission Forms", fileName: "tlc-scholar-transfer-form.pdf", fileSize: 272640,
  }),
  fixture("r3", "resource", "School enrollment checklist", "published", 11, {
    category: "School Forms", visibility: "private", fileName: "enrollment-checklist.pdf", fileSize: 186412,
  }),
];

export function slugify(title: string): string {
  return title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function formatCmsDate(value: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export function safePreviewLink(value: string): string | undefined {
  if (/^\/(?![/\\])[^\\\s]*$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    return undefined;
  }
}
