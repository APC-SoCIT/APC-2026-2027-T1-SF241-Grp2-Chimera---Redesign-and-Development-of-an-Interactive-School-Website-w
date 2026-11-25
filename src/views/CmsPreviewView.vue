<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef } from "vue";
import { RouterLink, useRouter } from "vue-router";
import CmsEditor from "@/components/cms/CmsEditor.vue";
import CmsIcon from "@/components/cms/CmsIcon.vue";
import CmsTrash from "@/components/cms/CmsTrash.vue";
import { blankItem, demoAdmin, formatCmsDate, itemLabels, type CmsItem, type ItemType } from "@/lib/cms/preview";
import { useCmsWorkspace } from "@/lib/cms/workspace";
import { getStaffSupabaseClient } from "@/lib/supabase";
import type { CmsImageAssets } from "@/lib/cms/images";
import type { PublicationStatus } from "@/lib/content/model";
import { formatFileSize } from "@/lib/resources/model";
import "@/assets/cms-preview.css";

type Section = "overview" | "content" | "trash" | ItemType;
type StatusFilter = "all" | PublicationStatus;
type ItemAction = PublicationStatus | "trash" | "remove";
const navigation: { id: Section; title: string; icon: string }[] = [
  { id: "overview", title: "Overview", icon: "grid" },
  { id: "content", title: "All content", icon: "files" },
  { id: "announcement", title: "Announcements", icon: "announcement" },
  { id: "event", title: "Events", icon: "event" },
  { id: "page", title: "Pages", icon: "page" },
  { id: "resource", title: "PDF resources", icon: "resource" },
];
const summaries: { id: StatusFilter; title: string; icon: string; note: string }[] = [
  { id: "all", title: "Total content", icon: "files", note: "Across all content types" },
  { id: "published", title: "Published", icon: "check", note: "Visible to website visitors" },
  { id: "draft", title: "Drafts", icon: "page", note: "Work in progress" },
  { id: "archived", title: "Archived", icon: "archive", note: "Hidden from the website" },
];
const statusOptions: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All statuses" }, { id: "published", label: "Published" },
  { id: "draft", label: "Draft" }, { id: "archived", label: "Archived" },
];
const statusActions: Record<ItemAction, string> = {
  published: "Publish", draft: "Unpublish", archived: "Archive", trash: "Move to Trash", remove: "Remove permanently",
};
// Signed-in Admin: the route only opens for a verified Admin (staffRole "admin" in the router).
const router = useRouter();
const staffName = ref(demoAdmin);
const signingOut = ref(false);
const section = ref<Section>("overview");
const search = ref("");
const status = ref<StatusFilter>("all");
const type = ref<"all" | ItemType>("all");
const category = ref("");
const editor = ref<CmsItem | null>(null);
const notice = ref("");
const error = ref("");
const navOpen = ref(false);
// Saves to the school database when the site is connected to Supabase, otherwise to this browser.
const workspace = useCmsWorkspace(() => staffName.value);
const library = workspace.library;
const live = workspace.usesDatabase;
const busy = ref(false);
const items = computed(() => library.value.items.filter((item) => !item.deletedAt));
const deletedItems = computed(() => library.value.items
  .filter((item): item is CmsItem & { deletedAt: string } => Boolean(item.deletedAt))
  .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)));
const nextUndo = computed(() => library.value.changes[library.value.cursor - 1]);
const nextRedo = computed(() => library.value.changes[library.value.cursor]);
const pending = ref<{ item: CmsItem; status: ItemAction } | null>(null);
const dialog = useTemplateRef<HTMLDialogElement>("publication-dialog");
const main = useTemplateRef<HTMLElement>("cms-main");
const menuToggle = useTemplateRef<HTMLButtonElement>("menu-toggle");
const shell = useTemplateRef<HTMLElement>("cms-shell");
let actionTrigger: HTMLElement | null = null;

// Super Admins (Admins who manage staff accounts) get a way back to the staff list.
const canManageAccounts = ref(false);

// Show the signed-in Admin's name, as the Admin dashboard does.
onMounted(async () => {
  void workspace.load();
  // Open the section chosen in the Admin dashboard's side panel (?section=announcement, …).
  const requested = new URLSearchParams(window.location.search).get("section");
  const match = navigation.find((entry) => entry.id === requested);
  if (match) section.value = match.id;
  try {
    const { data: { session } } = await getStaffSupabaseClient().auth.getSession();
    const provisioning = session?.user?.app_metadata?.chimera_staff_provisioning as Record<string, unknown> | undefined;
    const name = ["firstName", "lastName"].map((key) => typeof provisioning?.[key] === "string" ? (provisioning[key] as string).trim() : "")
      .filter(Boolean).join(" ");
    staffName.value = name || session?.user?.email || demoAdmin;
  } catch {
    // Keep the generic name; the route guard has already verified Admin access.
  }
  try {
    // The same check the dashboard's staff list makes: only Super Admins may list staff accounts.
    const { error } = await getStaffSupabaseClient().rpc("list_staff_accounts", { p_offset: 0 });
    canManageAccounts.value = !error;
  } catch {
    canManageAccounts.value = false;
  }
});

async function signOut() {
  signingOut.value = true;
  try {
    await getStaffSupabaseClient().auth.signOut();
  } catch {
    // Leave the workspace even if the network request fails.
  }
  await router.replace({ name: "login" });
}

const sectionTitle = computed(() => section.value === "trash" ? "Trash" : navigation.find((entry) => entry.id === section.value)?.title);
const resources = computed(() => section.value === "resource");
const webContent = computed(() => items.value.filter((item) => item.type !== "resource"));
const counts = computed(() => ({
  all: webContent.value.length,
  published: webContent.value.filter((item) => item.status === "published").length,
  draft: webContent.value.filter((item) => item.status === "draft").length,
  archived: webContent.value.filter((item) => item.status === "archived").length,
}));
const categories = computed(() => [...new Set(items.value.filter((item) => item.type === "resource").map((item) => item.category))].sort());
const list = computed(() => {
  const base = resources.value ? items.value.filter((item) => item.type === "resource") : webContent.value;
  const wanted = section.value === "overview" || section.value === "content" ? type.value : section.value;
  const term = search.value.trim().toLowerCase();
  return base.filter((item) =>
    (wanted === "all" || item.type === wanted)
    && (status.value === "all" || status.value === item.status)
    && (!category.value || category.value === item.category)
    && (!term || [item.title, item.slug, item.category, item.fileName].some((value) => value.toLowerCase().includes(term))),
  ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
});

function focusTitle() {
  void nextTick(() => shell.value?.querySelector("h1")?.focus());
}

function clearFilters() {
  search.value = "";
  status.value = "all";
  type.value = "all";
  category.value = "";
}

function selectSection(next: Section, filter: StatusFilter = "all") {
  section.value = next;
  clearFilters();
  status.value = filter;
  navOpen.value = false;
  error.value = "";
  notice.value = "";
  window.scrollTo({ top: 0, behavior: "instant" });
  focusTitle();
}

function beginEdit(item?: CmsItem) {
  const area = section.value;
  if (area === "trash") return;
  editor.value = item ?? blankItem(area === "overview" || area === "content" ? "announcement" : area);
  notice.value = "";
  error.value = "";
  navOpen.value = false;
  window.scrollTo({ top: 0, behavior: "instant" });
  void nextTick(() => main.value?.querySelector<HTMLElement>("#cms-title")?.focus());
}

function closeEditor() {
  editor.value = null;
  focusTitle();
}

/** The database's own message when connected; the preview's wording otherwise. */
function failure(issue: unknown, browserMessage: string) {
  return live && issue instanceof Error && issue.message ? issue.message : browserMessage;
}

async function saveItem(next: CmsItem, images: CmsImageAssets, file?: File): Promise<boolean | string> {
  busy.value = true;
  try {
    await workspace.commit(next, (next.id ? "Edited" : "Created") + " " + next.title, images, file);
  } catch (issue) {
    return live ? failure(issue, "") : false;
  } finally {
    busy.value = false;
  }
  if (!next.id || (section.value !== "overview" && section.value !== "content" && section.value !== next.type)) selectSection(next.type);
  else clearFilters();
  closeEditor();
  notice.value = next.id ? "Changes saved." : "Draft saved. You can publish it from the item’s actions.";
  return true;
}

function openPublication(item: CmsItem, target: ItemAction, event: MouseEvent) {
  const menu = (event.currentTarget as HTMLElement).closest("details");
  actionTrigger = menu?.querySelector("summary") ?? null;
  menu?.removeAttribute("open");
  pending.value = { item, status: target };
  error.value = "";
  void nextTick(() => dialog.value?.showModal());
}

function closePublication() {
  pending.value = null;
  error.value = "";
  actionTrigger?.focus();
  actionTrigger = null;
}

function openPermanentRemoval(item: CmsItem, event: MouseEvent) {
  actionTrigger = event.currentTarget as HTMLElement;
  pending.value = { item, status: "remove" };
  error.value = "";
  void nextTick(() => dialog.value?.showModal());
}

async function updatePublication() {
  const change = pending.value;
  if (!change || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    if (change.status === "remove") {
      try {
        await workspace.remove(change.item);
      } catch (issue) {
        error.value = failure(issue, "This item could not be removed. It may have changed in another tab. Please close this dialog and try again.");
        return;
      }
      actionTrigger = null;
      dialog.value?.close();
      notice.value = `“${change.item.title}” was permanently removed.`;
      focusTitle();
      return;
    }
    const next = change.status === "trash"
      ? { ...change.item, deletedAt: new Date().toISOString() }
      : { ...change.item, status: change.status, publishedAt: change.status === "published" ? new Date().toISOString() : change.item.publishedAt };
    try {
      await workspace.commit(next, statusActions[change.status] + " · " + change.item.title);
    } catch (issue) {
      error.value = failure(issue, "This browser could not save the change. Please try again.");
      return;
    }
    actionTrigger = null;
    dialog.value?.close();
    notice.value = change.status === "trash"
      ? `“${change.item.title}” moved to Trash.`
      : live
        ? `“${change.item.title}” is now ${change.status === "draft" ? "a draft" : change.status}.`
        : `“${change.item.title}” is now ${change.status === "draft" ? "a draft" : change.status} in the preview.`;
    focusTitle();
  } finally {
    busy.value = false;
  }
}

async function restoreItem(item: CmsItem) {
  if (busy.value) return;
  error.value = "";
  notice.value = "";
  busy.value = true;
  try {
    await workspace.commit({ ...item, deletedAt: undefined, status: "draft" }, "Restored " + item.title);
  } catch (issue) {
    error.value = failure(issue, "This browser could not restore the item. Please try again.");
    return;
  } finally {
    busy.value = false;
  }
  notice.value = `“${item.title}” was restored as a draft.`;
  focusTitle();
}

async function changeHistory(action: "undo" | "redo") {
  if (busy.value || !(action === "undo" ? nextUndo.value : nextRedo.value)) return;
  error.value = "";
  notice.value = "";
  busy.value = true;
  let change;
  try {
    change = await workspace.step(action);
  } catch (issue) {
    error.value = failure(issue, "This browser could not update the change history. Please try again.");
    return;
  } finally {
    busy.value = false;
  }
  notice.value = (action === "undo" ? "Undid" : "Redid") + " change to “" + change.after.title + "”.";
  if (action === "undo" ? !nextUndo.value : !nextRedo.value) focusTitle();
}

function dismissMenu() {
  navOpen.value = false;
  void nextTick(() => menuToggle.value?.focus());
}
</script>

<template>
  <div ref="cms-shell" class="cms-shell" @keydown.esc="navOpen && dismissMenu()">
    <aside class="cms-sidebar">
      <button type="button" class="cms-brand" :disabled="Boolean(editor)" @click="selectSection('overview')">
        <img src="/images/source-site/sncs-seal.png" alt="" width="40" height="40" />
        <span><strong>SNCS</strong><small>Content workspace</small></span>
      </button>
      <button ref="menu-toggle" class="cms-mobile-toggle cms-icon-button" type="button"
        aria-label="Toggle CMS navigation" aria-controls="cms-navigation cms-sidebar-footer" :aria-expanded="navOpen"
        @click="navOpen = !navOpen">
        <CmsIcon :name="navOpen ? 'close' : 'menu'" />
      </button>
      <nav id="cms-navigation" aria-label="CMS navigation" class="cms-navigation" :class="{ 'cms-nav-open': navOpen }">
        <p class="cms-nav-label">Admin dashboard</p>
        <RouterLink class="cms-nav-item cms-nav-link" :to="{ name: 'admin-dashboard' }">
          <CmsIcon name="grid" :size="18" /> Dashboard overview
        </RouterLink>
        <RouterLink v-if="canManageAccounts" class="cms-nav-item cms-nav-link" :to="{ name: 'admin-dashboard', hash: '#staff-accounts' }">
          <CmsIcon name="users" :size="18" /> Staff accounts
        </RouterLink>
        <template v-for="entry in navigation" :key="entry.id">
          <p v-if="entry.id === 'overview'" class="cms-nav-label">Workspace</p>
          <p v-if="entry.id === 'content'" class="cms-nav-label">Website management</p>
          <button class="cms-nav-item" type="button" :class="{ 'cms-nav-active': section === entry.id && !editor }"
            :aria-current="section === entry.id && !editor ? 'page' : undefined" :disabled="Boolean(editor)" @click="selectSection(entry.id)">
            <CmsIcon :name="entry.icon" :size="18" /> {{ entry.title }}
          </button>
        </template>
      </nav>
      <div id="cms-sidebar-footer" class="cms-sidebar-footer">
        <button type="button" class="cms-nav-item" :class="{ 'cms-nav-active': section === 'trash' }"
          :aria-current="section === 'trash' ? 'page' : undefined" :disabled="Boolean(editor)" @click="selectSection('trash')">
          <CmsIcon name="trash" :size="18" /> Trash
          <span v-if="deletedItems.length" class="cms-trash-count">{{ deletedItems.length }}</span>
        </button>
        <RouterLink class="cms-public-link" :to="{ name: 'home' }" target="_blank" rel="noopener">
          <CmsIcon name="external" :size="17" /> Public website<span class="sr-only"> (opens in a new tab)</span>
        </RouterLink>
        <div class="cms-profile">
          <span class="cms-avatar" aria-hidden="true">{{ staffName.charAt(0).toUpperCase() }}</span>
          <span><strong>{{ staffName }}</strong><small>{{ live ? 'Admin · Changes go to the school website' : 'Admin · Preview, changes stay in this browser' }}</small></span>
        </div>
        <button type="button" class="cms-public-link" :disabled="Boolean(editor) || signingOut" @click="signOut">
          {{ signingOut ? "Signing out…" : "Sign out" }}
        </button>
      </div>
    </aside>

    <div class="cms-workspace">
      <header class="cms-topbar">
        <div class="cms-breadcrumb"><span>Workspace</span><CmsIcon name="chevron" :size="14" /><strong>{{ editor ? 'Editor' : sectionTitle }}</strong></div>
        <span class="cms-prototype" :data-live="live || undefined"><i></i> {{ live ? 'Connected to the school website' : 'Local preview' }}</span>
      </header>
      <section ref="cms-main" class="cms-main" aria-label="CMS workspace">
        <CmsEditor v-if="editor" :item="editor" :items="library.items" :image-assets="library.imageAssets"
          :attempt-save="saveItem" :connected="live" @close="closeEditor" />
        <div v-else-if="workspace.loading.value && !library.items.length" class="cms-panel cms-loading" role="status">Loading website content…</div>
        <div v-else-if="workspace.loadError.value && !library.items.length" class="cms-panel cms-loading">
          <p class="cms-error" role="alert">{{ workspace.loadError.value }}</p>
          <button type="button" class="cms-button" @click="workspace.load()">Try again</button>
        </div>
        <template v-else-if="section === 'trash'">
          <div class="cms-heading">
            <div>
              <h1 tabindex="-1">Trash</h1>
              <p>{{ live ? 'Recover deleted items and revisit recent changes to the website.' : 'Recover deleted items and revisit changes to the website preview.' }}</p>
            </div>
          </div>
          <p v-if="notice" class="cms-notice" role="status"><CmsIcon name="check" :size="18" />{{ notice }}</p>
          <p v-if="error" class="cms-error" role="alert">{{ error }}</p>
          <CmsTrash :items="deletedItems" :next-undo="nextUndo?.label" :next-redo="nextRedo?.label" :busy="busy"
            @restore="restoreItem" @remove="openPermanentRemoval" @step="changeHistory" />
        </template>
        <template v-else>
          <div v-if="section === 'overview'" class="cms-hero">
            <div class="cms-hero-copy">
              <div class="cms-school-label"><span></span> STO. NIÑO CATHOLIC SCHOOL</div>
              <h1 tabindex="-1">Content overview</h1>
              <p>Manage the announcements, events, pages and PDFs that keep your school community informed.</p>
              <button type="button" class="cms-button cms-hero-button" @click="beginEdit()"><CmsIcon name="plus" :size="18" /> Create content</button>
            </div>
          </div>

          <div v-else class="cms-heading">
            <div>
              <h1 tabindex="-1">{{ sectionTitle }}</h1>
              <p>{{ resources ? 'Manage official PDFs, categories and public visibility.' : 'Find, edit and publish updates for the school website.' }}</p>
            </div>
            <button type="button" class="cms-button cms-primary" @click="beginEdit()">
              <CmsIcon :name="resources ? 'upload' : 'plus'" :size="18" /> {{ resources ? 'Add PDF resource' : 'Create content' }}
            </button>
          </div>

          <section v-if="section === 'overview'" class="cms-stat-grid" aria-label="Content by publication status">
            <button v-for="summary in summaries" :key="summary.id" class="cms-stat" type="button" @click="selectSection('content', summary.id)">
              <span class="cms-stat-top">
                <span class="cms-stat-icon" :data-state="summary.id"><CmsIcon :name="summary.icon" :size="19" /></span>
                <CmsIcon class="cms-stat-arrow" name="arrow" :size="16" />
              </span>
              <strong>{{ counts[summary.id] }}</strong>
              <span class="cms-stat-label">{{ summary.title }}</span>
              <small>{{ summary.note }}</small>
            </button>
          </section>

          <p v-if="notice" class="cms-notice" role="status"><CmsIcon name="check" :size="18" />{{ notice }}</p>
          <section class="cms-panel cms-library" aria-labelledby="cms-list-title">
            <div class="cms-panel-heading cms-library-heading">
              <div>
                <h2 id="cms-list-title">{{ section === 'overview' ? 'Recent content' : resources ? 'Resource library' : 'Content library' }}</h2>
                <p>{{ section === 'overview' ? 'Latest updates across your website.' : resources ? 'PDF documents and their publication settings.' : 'Filter your library or select an item to edit.' }}</p>
              </div>
              <button v-if="section === 'overview'" class="cms-button cms-view-all" type="button" @click="selectSection('content')">
                View all content <CmsIcon name="arrow" :size="16" />
              </button>
            </div>
            <div class="cms-filters">
              <div class="cms-filter-field cms-search-field">
                <label for="cms-search">{{ resources ? 'Search PDFs' : 'Search content' }}</label>
                <div class="cms-search">
                  <CmsIcon name="search" :size="17" />
                  <input id="cms-search" v-model="search" type="search" name="search" autocomplete="off"
                    placeholder="Search by title or keyword" />
                </div>
              </div>
              <div v-if="section === 'overview' || section === 'content'" class="cms-filter-field">
              <label for="cms-filter-type">Content type</label>
              <select id="cms-filter-type" v-model="type" name="contentType">
                <option value="all">All types</option>
                <option value="announcement">Announcements</option>
                <option value="event">Events</option>
                <option value="page">Pages</option>
              </select>
              </div>
              <div v-if="resources" class="cms-filter-field">
              <label for="cms-filter-category">Resource category</label>
              <select id="cms-filter-category" v-model="category" name="resourceCategory">
                <option value="">All categories</option>
                <option v-for="value in categories" :key="value" :value="value">{{ value }}</option>
              </select>
              </div>
              <div class="cms-filter-field">
              <label for="cms-filter-status">Publication status</label>
              <select id="cms-filter-status" v-model="status" name="publicationStatus">
                <option v-for="option in statusOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
              </select>
              </div>
            </div>

            <table v-if="list.length" class="cms-table" role="table">
              <thead role="rowgroup">
                <tr role="row"><th scope="col">Title</th><th scope="col">{{ resources ? 'Category' : 'Type' }}</th>
                  <th scope="col">Status</th><th scope="col">Last updated</th><th scope="col">Actions</th></tr>
              </thead>
              <tbody role="rowgroup">
                <tr v-for="item in section === 'overview' ? list.slice(0, 5) : list" :key="item.id" role="row">
                  <td class="cms-title-cell" role="cell">
                    <div class="cms-row-title">
                      <span class="cms-item-icon" :data-type="item.type"><CmsIcon :name="item.type" :size="18" /></span>
                      <span class="cms-row-copy">
                        <button type="button" class="cms-item-title" @click="beginEdit(item)">{{ item.title }}</button>
                        <small>{{ resources ? item.fileName : item.eventDate ? formatCmsDate(item.eventDate) : '/' + item.slug }}</small>
                      </span>
                    </div>
                  </td>
                  <td class="cms-type-cell" role="cell">{{ resources ? item.category : itemLabels[item.type] }}<small v-if="resources">{{ formatFileSize(item.fileSize) }}</small></td>
                  <td class="cms-state-cell" role="cell">
                    <span class="cms-status" :data-state="item.status">{{ item.status }}</span>
                    <small v-if="resources">{{ item.visibility === 'public' ? 'Public' : 'Private' }}</small>
                  </td>
                  <td class="cms-date-cell" role="cell">{{ formatCmsDate(item.updatedAt) }}</td>
                  <td class="cms-actions-cell" role="cell">
                    <details class="cms-actions" name="cms-row-actions"
                      @keydown.esc.stop="($event.currentTarget as HTMLDetailsElement).querySelector('summary')?.focus(); ($event.currentTarget as HTMLDetailsElement).open = false">
                      <summary :aria-label="'Actions for ' + item.title">⋯</summary>
                      <div class="cms-action-list">
                        <button type="button" @click="beginEdit(item)">Edit</button>
                        <button v-if="item.status === 'draft'" type="button" @click="openPublication(item, 'published', $event)">Publish</button>
                        <button v-if="item.status === 'published'" type="button" @click="openPublication(item, 'draft', $event)">Unpublish</button>
                        <button v-if="item.status !== 'archived'" type="button" @click="openPublication(item, 'archived', $event)">Archive</button>
                        <button type="button" class="cms-trash-action" @click="openPublication(item, 'trash', $event)">Move to Trash</button>
                      </div>
                    </details>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-else class="cms-empty">
              <span class="cms-stat-icon"><CmsIcon name="search" /></span>
              <h3>No matching {{ resources ? 'resources' : 'content' }}</h3>
              <p>Try another search or clear your filters.</p>
              <button type="button" class="cms-button" @click="clearFilters">Clear filters</button>
            </div>
            <div class="cms-table-footer" aria-live="polite">
              {{ section === 'overview' && list.length > 5 ? 'Showing 5 of ' : '' }}{{ list.length }} {{ list.length === 1 ? 'item' : 'items' }}
            </div>
          </section>
        </template>
      </section>
    </div>

    <dialog ref="publication-dialog" class="cms-dialog" aria-labelledby="cms-publication-title" @close="closePublication">
      <div v-if="pending" class="cms-dialog-inner">
        <h2 id="cms-publication-title">{{ pending.status === 'remove' ? 'Remove item permanently?' : pending.status === 'trash' ? 'Move item to Trash?' : statusActions[pending.status] + ' item?' }}</h2>
        <p><strong>{{ pending.item.title }}</strong></p>
        <p v-if="pending.status === 'remove'">This permanently deletes the item{{ live ? ', its files' : '' }} and its change history from this workspace. It will disappear from Trash and cannot be restored or recovered with Undo or Redo.</p>
        <p v-else-if="pending.status === 'published' && pending.item.type !== 'resource' && pending.item.visibility === 'public'">
          {{ live ? 'This makes the item visible on the public website.' : 'This makes the item visible on the connected public preview.' }}
        </p>
        <p v-else-if="pending.status === 'published' && pending.item.type === 'resource'">{{ live ? (pending.item.visibility === 'public' ? 'Families can download this PDF from the Resources page.' : 'This PDF is private, so it stays off the Resources page.') : 'This updates the PDF’s status in the workspace. Downloadable files use the school’s resource service.' }}</p>
        <p v-else-if="pending.status === 'published'">This item will stay private after publishing.</p>
        <p v-else-if="pending.status === 'draft'">This returns the item to Draft and removes it from public listings.</p>
        <p v-else-if="pending.status === 'trash'">This removes the item from the library and any public listings. You can restore it from Trash.</p>
        <p v-else>This moves the item to the archive and removes it from public listings.</p>
        <p v-if="error" class="cms-error" role="alert">{{ error }}</p>
        <div class="cms-dialog-actions">
          <button type="button" class="cms-button" autofocus @click="dialog?.close()">Cancel</button>
          <button type="button" class="cms-button cms-primary" :disabled="busy" @click="updatePublication">{{ busy ? 'Saving…' : statusActions[pending.status] }}</button>
        </div>
      </div>
    </dialog>
  </div>
</template>
