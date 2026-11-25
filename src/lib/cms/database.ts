/*
 * Author: Gian Mandac
 * Created Date: 20261126
 * Content workspace <-> school database (PB-01).
 * Website content lives in cms_content, PDFs in resources; files go to the public
 * content-images and resource-files buckets. Every change goes through the cms_* functions
 * (migration 202611260001_pb01_cms_database.sql), which check Admin access and write the audit log.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicationStatus } from "@/lib/content/model";
import { slugify, type CmsItem, type ContentType } from "./preview";
import type { CmsImage, CmsImageAsset, CmsImageAssets } from "./images";

/** An image as stored in cms_content.images: its description plus where the file is. */
export interface StoredImage extends CmsImage {
  src: string;
  width: number;
  height: number;
  path?: string;
}

export interface ContentRow {
  contentId: number | string;
  contentType: ContentType;
  title: string;
  slug: string;
  summary?: string | null;
  body: string;
  images?: unknown;
  eventStartsAt: string | null;
  status?: PublicationStatus;
  publishedAt: string | null;
  updatedAt: string;
  deletedAt?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
}

export interface ResourceRow {
  resourceId: number | string;
  title: string;
  category: string;
  storagePath: string;
  fileSizeBytes: number;
  status: PublicationStatus;
  visibility: "public" | "private";
  updatedAt: string;
  deletedAt: string | null;
  uploadedByName: string | null;
}

export type ItemKind = "content" | "resource";

export class CmsError extends Error {}

const contentPrefix = "content-";
const resourcePrefix = "resource-";

/** Which table and row a workspace item came from, or null for an item not saved yet. */
export function databaseRef(item: Pick<CmsItem, "id">): { kind: ItemKind; id: number } | null {
  const match = /^(content|resource)-([1-9]\d*)$/.exec(item.id);
  return match ? { kind: match[1] as ItemKind, id: Number(match[2]) } : null;
}

const manilaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });

/** The event's day in the school's time zone, as the editor's date field expects (YYYY-MM-DD). */
export function eventDay(startsAt: string | null): string {
  return startsAt ? manilaDay.format(new Date(startsAt)) : "";
}

/** Events start at midnight, Philippine time, on the chosen day. */
export function eventStartsAt(day: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00+08:00` : null;
}

/** First plain line of the body, used as the summary on cards. */
export function summaryOf(body: string): string {
  const line = body.split("\n").find((entry) => entry.trim() && !entry.startsWith("## ")) ?? "";
  return line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^[-#]+\s*|\*/g, "").trim().slice(0, 500);
}

function storedImages(value: unknown): StoredImage[] {
  if (!Array.isArray(value)) return [];
  return value.filter((image): image is StoredImage => Boolean(image) && typeof image === "object"
    && typeof image.id === "string" && typeof image.src === "string"
    && typeof image.width === "number" && typeof image.height === "number");
}

export function contentItem(row: ContentRow): { item: CmsItem; assets: CmsImageAssets } {
  const images = storedImages(row.images);
  const assets: CmsImageAssets = Object.fromEntries(images.map((image) => [image.id, { src: image.src, width: image.width, height: image.height }]));
  return {
    assets,
    item: {
      id: contentPrefix + row.contentId,
      type: row.contentType,
      title: row.title,
      status: row.status ?? "published",
      slug: row.slug,
      body: row.body,
      eventDate: eventDay(row.eventStartsAt),
      category: "",
      visibility: "public",
      fileName: "",
      fileSize: 0,
      createdBy: row.createdByName || "SNCS website",
      updatedBy: row.updatedByName || row.createdByName || "SNCS website",
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt ?? undefined,
      publishedAt: row.publishedAt,
      images: images.map(({ id, name, alt, caption }) => ({ id, name, alt, ...(caption ? { caption } : {}) })),
    },
  };
}

export function resourceItem(row: ResourceRow): CmsItem {
  return {
    id: resourcePrefix + row.resourceId,
    type: "resource",
    title: row.title,
    status: row.status,
    slug: "",
    body: "",
    eventDate: "",
    category: row.category,
    visibility: row.visibility,
    fileName: row.storagePath.split("/").pop() ?? row.storagePath,
    fileSize: row.fileSizeBytes,
    storagePath: row.storagePath,
    createdBy: row.uploadedByName || "SNCS website",
    updatedBy: row.uploadedByName || "SNCS website",
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? undefined,
    publishedAt: null,
  };
}

/** Turns a database or network error into a sentence for the workspace. */
export function cmsErrorMessage(error: unknown): string {
  const issue = error as { code?: string; message?: string } | null;
  if (issue?.code === "23505") return "This page identifier is already in use. Choose another.";
  if (issue?.code === "42501") return "Your account can no longer change website content. Sign in again or ask an Admin who manages staff accounts.";
  if (error instanceof TypeError) return "The school database could not be reached. Check your connection and try again.";
  const message = typeof issue?.message === "string" ? issue.message.trim() : "";
  return message && message.length < 200 && !/jwt|postgrest|pgrst|schema cache/i.test(message)
    ? message.replace(/\.?$/, ".") : "The change could not be saved. Please try again.";
}

async function call<T>(client: SupabaseClient, name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = args ? await client.rpc(name, args) : await client.rpc(name);
  if (error) throw new CmsError(cmsErrorMessage(error));
  return data as T;
}

export async function loadWorkspace(client: SupabaseClient): Promise<{ items: CmsItem[]; imageAssets: CmsImageAssets }> {
  const [content, resources] = await Promise.all([
    call<ContentRow[]>(client, "cms_list_content"),
    call<ResourceRow[]>(client, "cms_list_resources"),
  ]);
  const mapped = (content ?? []).map(contentItem);
  return {
    items: [...mapped.map((entry) => entry.item), ...(resources ?? []).map(resourceItem)],
    imageAssets: Object.assign({}, ...mapped.map((entry) => entry.assets)),
  };
}

function publicUrl(client: SupabaseClient, bucket: string, path: string) {
  return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** The storage path of an image this workspace uploaded, read back from its public URL. */
function imagePath(image: StoredImage) {
  if (image.path) return image.path;
  const marker = "/storage/v1/object/public/content-images/";
  const at = image.src.indexOf(marker);
  return at >= 0 ? decodeURIComponent(image.src.slice(at + marker.length)) : undefined;
}

async function uploadImage(client: SupabaseClient, image: CmsImage, asset: CmsImageAsset): Promise<StoredImage> {
  const blob = await (await fetch(asset.src)).blob();
  const extension = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
  const path = `${new Date().getFullYear()}/${image.id}.${extension}`;
  const { error } = await client.storage.from("content-images").upload(path, blob, { contentType: blob.type || "image/webp", upsert: false });
  if (error) throw new CmsError("An image could not be uploaded. Please try again.");
  return { ...image, src: publicUrl(client, "content-images", path), width: asset.width, height: asset.height, path };
}

async function removeFiles(client: SupabaseClient, bucket: string, paths: (string | undefined)[]) {
  const list = paths.filter((path): path is string => Boolean(path));
  if (!list.length) return;
  try {
    await client.storage.from(bucket).remove(list);
  } catch {
    // A leftover file is harmless; the record is what the website reads.
  }
}

/** Saves a content item's text and images. Returns its database id. */
async function saveContent(client: SupabaseClient, item: CmsItem, id: number | null, assets: CmsImageAssets): Promise<number> {
  const uploaded: StoredImage[] = [];
  try {
    const images: StoredImage[] = [];
    for (const image of item.images ?? []) {
      const asset = assets[image.id];
      if (!asset) throw new CmsError(`The image “${image.name}” is missing. Remove it and add it again.`);
      if (asset.src.startsWith("data:")) {
        const stored = await uploadImage(client, image, asset);
        uploaded.push(stored);
        images.push(stored);
      } else {
        images.push({ ...image, ...asset });
      }
    }
    return await call<number>(client, "cms_save_content", {
      p_id: id, p_type: item.type, p_title: item.title, p_slug: item.slug, p_summary: summaryOf(item.body),
      p_body: item.body, p_event_starts_at: item.type === "event" ? eventStartsAt(item.eventDate) : null, p_images: images,
    });
  } catch (error) {
    await removeFiles(client, "content-images", uploaded.map(imagePath));
    throw error;
  }
}

/** Uploads the chosen PDF (if any) and saves the resource's details. Returns its database id. */
async function saveResource(client: SupabaseClient, item: CmsItem, id: number | null, file?: File): Promise<number> {
  let storagePath = item.storagePath;
  let fileSize = item.fileSize;
  if (file) {
    const name = slugify(file.name.replace(/\.pdf$/i, "")).slice(0, 80) || "resource";
    storagePath = `uploads/${name}-${Date.now().toString(36)}.pdf`;
    const { error } = await client.storage.from("resource-files").upload(storagePath, file, { contentType: "application/pdf", upsert: false });
    if (error) throw new CmsError("The PDF could not be uploaded. Check that it is 10 MB or less and try again.");
    fileSize = file.size;
  }
  if (!storagePath) throw new CmsError("Select a PDF.");
  try {
    return await call<number>(client, "cms_save_resource", {
      p_id: id, p_title: item.title, p_category: item.category, p_storage_path: storagePath,
      p_file_size_bytes: fileSize, p_visibility: item.visibility,
    });
  } catch (error) {
    if (file) await removeFiles(client, "resource-files", [storagePath]);
    throw error;
  }
}

function detailsChanged(current: CmsItem, target: CmsItem) {
  const images = (item: CmsItem) => JSON.stringify((item.images ?? []).map(({ id, alt, caption }) => [id, alt, caption ?? ""]));
  return current.type !== target.type || current.title !== target.title || current.slug !== target.slug
    || current.body !== target.body || current.eventDate !== target.eventDate || current.category !== target.category
    || current.visibility !== target.visibility || current.storagePath !== target.storagePath || images(current) !== images(target);
}

/**
 * Brings one item from its current database state to the target state with the fewest calls:
 * create or update its details, then its status, then Trash. A null target moves it to Trash
 * (used when undoing a create). Returns the workspace id of the item.
 */
export async function applyItemState(client: SupabaseClient, current: CmsItem | null, target: CmsItem | null,
  assets: CmsImageAssets, file?: File): Promise<string | null> {
  if (!target) {
    const ref = current && databaseRef(current);
    if (ref && !current?.deletedAt) await call(client, "cms_trash", { p_kind: ref.kind, p_id: ref.id, p_restore: false });
    return null;
  }
  const kind: ItemKind = target.type === "resource" ? "resource" : "content";
  let ref = current ? databaseRef(current) : null;
  const changeDetails = !ref || !current || detailsChanged(current, target) || Boolean(file);
  const changeStatus = target.status !== (current?.status ?? "draft");
  // The database only edits items outside Trash, so take it out first when anything changes.
  const restore = Boolean(ref && current?.deletedAt) && (!target.deletedAt || changeDetails || changeStatus);
  if (ref && restore) await call(client, "cms_trash", { p_kind: ref.kind, p_id: ref.id, p_restore: true });
  if (!ref || changeDetails) {
    const saved = kind === "content"
      ? await saveContent(client, target, ref?.id ?? null, assets)
      : await saveResource(client, target, ref?.id ?? null, file);
    ref = { kind, id: saved };
  }
  if (changeStatus) await call(client, "cms_set_status", { p_kind: ref.kind, p_id: ref.id, p_status: target.status });
  const inTrash = Boolean(current?.deletedAt) && !restore;
  if (target.deletedAt && !inTrash) await call(client, "cms_trash", { p_kind: ref.kind, p_id: ref.id, p_restore: false });
  return `${ref.kind}-${ref.id}`;
}

/** Permanent delete from Trash, then the item's files. */
export async function removeItem(client: SupabaseClient, item: CmsItem, assets: CmsImageAssets) {
  const ref = databaseRef(item);
  if (!ref) throw new CmsError("This item could not be found.");
  const filePath = await call<string | null>(client, "cms_delete", { p_kind: ref.kind, p_id: ref.id });
  if (ref.kind === "resource") await removeFiles(client, "resource-files", [filePath ?? item.storagePath]);
  else await removeFiles(client, "content-images", (item.images ?? []).map((image) => {
    const asset = assets[image.id];
    return asset ? imagePath({ ...image, ...asset }) : undefined;
  }));
}
