import { sampleItems, type CmsItem } from "./preview";
import { websiteItems } from "./website-items";
import type { CmsImageAssets } from "./images";

export interface CmsChange {
  label: string;
  before: CmsItem | null;
  after: CmsItem;
}

export interface CmsLibrary {
  items: CmsItem[];
  changes: CmsChange[];
  cursor: number;
  imageAssets: CmsImageAssets;
  permanentlyDeletedIds?: string[];
}

const historyLimit = 50;

function withWebsiteItems(items: CmsItem[], deletedIds: string[] = []) {
  const existing = new Set(items.map((item) => item.id));
  return [...items.map(prepareSample), ...websiteItems.filter((item) => !existing.has(item.id))]
    .filter((item) => !deletedIds.includes(item.id));
}

function prepareSample(item: CmsItem): CmsItem {
  const sample = sampleItems.find((entry) => entry.id === item.id);
  // The original demo pre-published these fictional seed records.
  return sample?.type !== "resource" && sample?.updatedAt === item.updatedAt
      && item.status === "published" && !item.publishedAt
    ? { ...item, status: "draft" } : item;
}

export function readLibrary(raw: string | null): CmsLibrary {
  try {
    const stored = raw ? JSON.parse(raw) : null;
    if (Array.isArray(stored)) return { items: withWebsiteItems(stored), changes: [], cursor: 0, imageAssets: {} };
    if (stored && Array.isArray(stored.items) && Array.isArray(stored.changes)
        && Number.isInteger(stored.cursor) && stored.cursor >= 0 && stored.cursor <= stored.changes.length) {
      const deletedIds = Array.isArray(stored.permanentlyDeletedIds)
        ? stored.permanentlyDeletedIds.filter((id: unknown): id is string => typeof id === "string") : [];
      const keepChange = (change: CmsChange) => !deletedIds.includes(change.after.id);
      return {
        ...stored,
        items: withWebsiteItems(stored.items, deletedIds),
        permanentlyDeletedIds: deletedIds,
        cursor: stored.changes.slice(0, stored.cursor).filter(keepChange).length,
        imageAssets: stored.imageAssets ?? {},
        changes: stored.changes.filter(keepChange).map((change: CmsChange) => ({
          ...change, before: change.before && prepareSample(change.before), after: prepareSample(change.after),
        })),
      };
    }
  } catch {
    // A new preview can start from the sample library.
  }
  return { items: withWebsiteItems(sampleItems.map((item) => ({ ...item }))), changes: [], cursor: 0, imageAssets: {} };
}

function replaceItem(items: CmsItem[], id: string, item: CmsItem | null) {
  const remaining = items.filter((entry) => entry.id !== id);
  return item ? [item, ...remaining] : remaining;
}

export function recordChange(library: CmsLibrary, after: CmsItem, label: string, newAssets: CmsImageAssets = {}): CmsLibrary {
  const before = library.items.find((item) => item.id === after.id) ?? null;
  const changes = [...library.changes.slice(0, library.cursor), { label, before, after }].slice(-historyLimit);
  const items = replaceItem(library.items, after.id, after);
  const referencedIds = new Set(
    [...items, ...changes.flatMap((change) => [change.before, change.after])]
      .flatMap((item) => item?.images?.map((image) => image.id) ?? []),
  );
  const imageAssets = Object.fromEntries(
    Object.entries({ ...library.imageAssets, ...newAssets }).filter(([id]) => referencedIds.has(id)),
  );
  return { ...library, items, changes, cursor: changes.length, imageAssets };
}

export function permanentlyRemoveItem(library: CmsLibrary, id: string): CmsLibrary {
  if (!library.items.some((item) => item.id === id && item.deletedAt)) return library;
  const items = library.items.filter((item) => item.id !== id);
  const changes = library.changes.filter((change) => change.after.id !== id);
  const cursor = library.changes.slice(0, library.cursor).filter((change) => change.after.id !== id).length;
  const referencedIds = new Set(
    [...items, ...changes.flatMap((change) => [change.before, change.after])]
      .flatMap((item) => item?.images?.map((image) => image.id) ?? []),
  );
  return {
    ...library, items, changes, cursor,
    permanentlyDeletedIds: [...new Set([...(library.permanentlyDeletedIds ?? []), id])],
    imageAssets: Object.fromEntries(Object.entries(library.imageAssets).filter(([assetId]) => referencedIds.has(assetId))),
  };
}

export function stepHistory(library: CmsLibrary, action: "undo" | "redo"): CmsLibrary {
  const undo = action === "undo";
  const change = library.changes[library.cursor - (undo ? 1 : 0)];
  if (!change) return library;
  return {
    ...library,
    items: replaceItem(library.items, change.after.id, undo ? change.before : change.after),
    cursor: library.cursor + (undo ? -1 : 1),
  };
}
