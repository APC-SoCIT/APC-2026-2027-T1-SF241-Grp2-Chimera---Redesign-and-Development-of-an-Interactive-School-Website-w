/*
 * One interface for the content workspace, whichever place it saves to:
 * - database: the school database (cms_* functions and storage buckets), shared by all Admins;
 * - browser: the local preview kept in this browser's storage (development without keys).
 * Undo and Redo work in both; in the database they are replayed as ordinary changes.
 */
import { ref, shallowRef, type Ref, type ShallowRef } from "vue";
import { getStaffSupabaseClient } from "@/lib/supabase";
import { cmsDatabaseEnabled } from "./config";
import { applyItemState, CmsError, loadWorkspace, removeItem } from "./database";
import { permanentlyRemoveItem, recordChange, stepHistory, type CmsChange, type CmsLibrary } from "./history";
import type { CmsImageAssets } from "./images";
import type { CmsItem } from "./preview";
import { useCmsLibrary, writeCmsLibrary } from "./store";

export interface CmsWorkspace {
  usesDatabase: boolean;
  library: ShallowRef<CmsLibrary>;
  loading: Ref<boolean>;
  loadError: Ref<string>;
  load(): Promise<void>;
  /** Saves the item as given (create, edit, status, Trash or restore). */
  commit(next: CmsItem, label: string, newAssets?: CmsImageAssets, file?: File): Promise<void>;
  remove(item: CmsItem): Promise<void>;
  step(action: "undo" | "redo"): Promise<CmsChange>;
}

const historyLimit = 50;

function browserWorkspace(actor: () => string): CmsWorkspace {
  const library = useCmsLibrary();
  return {
    usesDatabase: false,
    library,
    loading: ref(false),
    loadError: ref(""),
    async load() {},
    async commit(next, label, newAssets) {
      if (next.id) {
        const current = library.value.items.find((item) => item.id === next.id);
        if (!current || current.updatedAt !== next.updatedAt) throw new CmsError("This item changed in another tab.");
      }
      const saved = { ...next, id: next.id || crypto.randomUUID(), updatedAt: new Date().toISOString(), updatedBy: actor() };
      if (!writeCmsLibrary(recordChange(library.value, saved, label, newAssets))) throw new CmsError("Browser storage is unavailable.");
    },
    async remove(item) {
      const current = library.value.items.find((entry) => entry.id === item.id);
      if (!current?.deletedAt || current.updatedAt !== item.updatedAt
        || !writeCmsLibrary(permanentlyRemoveItem(library.value, item.id))) throw new CmsError("The item could not be removed.");
    },
    async step(action) {
      const change = library.value.changes[library.value.cursor - (action === "undo" ? 1 : 0)];
      if (!change || !writeCmsLibrary(stepHistory(library.value, action))) throw new CmsError("The change history could not be updated.");
      return change;
    },
  };
}

// The database workspace keeps one library per browser tab; history lasts until the tab closes.
const databaseLibrary = shallowRef<CmsLibrary>({ items: [], changes: [], cursor: 0, imageAssets: {} });

function databaseWorkspace(): CmsWorkspace {
  const library = databaseLibrary;
  const loading = ref(true);
  const loadError = ref("");
  const client = () => getStaffSupabaseClient();

  async function load() {
    loading.value = true;
    loadError.value = "";
    try {
      const { items, imageAssets } = await loadWorkspace(client());
      library.value = { ...library.value, items, imageAssets: { ...library.value.imageAssets, ...imageAssets } };
    } catch (error) {
      loadError.value = error instanceof CmsError ? error.message : "Website content could not be loaded. Check your connection and try again.";
    } finally {
      loading.value = false;
    }
  }

  const find = (id: string | null) => (id ? library.value.items.find((item) => item.id === id) ?? null : null);

  return {
    usesDatabase: true,
    library,
    loading,
    loadError,
    load,
    async commit(next, label, newAssets = {}, file) {
      const before = find(next.id);
      const assets = { ...library.value.imageAssets, ...newAssets };
      const id = await applyItemState(client(), before, next, assets, file);
      await load();
      const after = find(id);
      if (!after) return;
      const changes = [...library.value.changes.slice(0, library.value.cursor), { label, before, after }].slice(-historyLimit);
      library.value = { ...library.value, changes, cursor: changes.length };
    },
    async remove(item) {
      await removeItem(client(), item, library.value.imageAssets);
      const changes = library.value.changes.filter((change) => change.after.id !== item.id);
      const cursor = library.value.changes.slice(0, library.value.cursor).filter((change) => change.after.id !== item.id).length;
      library.value = { ...library.value, changes, cursor };
      await load();
    },
    async step(action) {
      const undo = action === "undo";
      const change = library.value.changes[library.value.cursor - (undo ? 1 : 0)];
      if (!change) throw new CmsError("There is nothing to " + action + ".");
      await applyItemState(client(), find(change.after.id), undo ? change.before : change.after, library.value.imageAssets);
      library.value = { ...library.value, cursor: library.value.cursor + (undo ? -1 : 1) };
      await load();
      return change;
    },
  };
}

export function useCmsWorkspace(actor: () => string): CmsWorkspace {
  return cmsDatabaseEnabled ? databaseWorkspace() : browserWorkspace(actor);
}
