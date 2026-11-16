import { sampleItems, type CmsItem } from "./preview";
import { websiteItems } from "./website-items";

export interface CmsChange {
  label: string;
  before: CmsItem | null;
  after: CmsItem;
}

export interface CmsLibrary {
  items: CmsItem[];
  changes: CmsChange[];
  cursor: number;
}

const historyLimit = 50;

function withWebsiteItems(items: CmsItem[]) {
  const existing = new Set(items.map((item) => item.id));
  return [...items.map(prepareSample), ...websiteItems.filter((item) => !existing.has(item.id))];
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
    if (Array.isArray(stored)) return { items: withWebsiteItems(stored), changes: [], cursor: 0 };
    if (stored && Array.isArray(stored.items) && Array.isArray(stored.changes)
        && Number.isInteger(stored.cursor) && stored.cursor >= 0 && stored.cursor <= stored.changes.length) {
      return {
        ...stored,
        items: withWebsiteItems(stored.items),
        changes: stored.changes.map((change: CmsChange) => ({
          ...change, before: change.before && prepareSample(change.before), after: prepareSample(change.after),
        })),
      };
    }
  } catch {
    // A new preview can start from the sample library.
  }
  return { items: withWebsiteItems(sampleItems.map((item) => ({ ...item }))), changes: [], cursor: 0 };
}

function replaceItem(items: CmsItem[], id: string, item: CmsItem | null) {
  const remaining = items.filter((entry) => entry.id !== id);
  return item ? [item, ...remaining] : remaining;
}

export function recordChange(library: CmsLibrary, after: CmsItem, label: string): CmsLibrary {
  const before = library.items.find((item) => item.id === after.id) ?? null;
  const changes = [...library.changes.slice(0, library.cursor), { label, before, after }].slice(-historyLimit);
  return { items: replaceItem(library.items, after.id, after), changes, cursor: changes.length };
}

export function stepHistory(library: CmsLibrary, action: "undo" | "redo"): CmsLibrary {
  const undo = action === "undo";
  const change = library.changes[library.cursor - (undo ? 1 : 0)];
  if (!change) return library;
  return {
    items: replaceItem(library.items, change.after.id, undo ? change.before : change.after),
    changes: library.changes,
    cursor: library.cursor + (undo ? -1 : 1),
  };
}
