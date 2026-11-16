import { sampleItems, type CmsItem } from "./preview";

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

export function readLibrary(raw: string | null): CmsLibrary {
  try {
    const stored = raw ? JSON.parse(raw) : null;
    if (Array.isArray(stored)) return { items: stored, changes: [], cursor: 0 };
    if (stored && Array.isArray(stored.items) && Array.isArray(stored.changes)
        && Number.isInteger(stored.cursor) && stored.cursor >= 0 && stored.cursor <= stored.changes.length) {
      return stored;
    }
  } catch {
    // A new preview can start from the sample library.
  }
  return { items: sampleItems.map((item) => ({ ...item })), changes: [], cursor: 0 };
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
