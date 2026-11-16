<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from "vue";
import CmsEditor from "@/components/cms/CmsEditor.vue";
import CmsIcon from "@/components/cms/CmsIcon.vue";
import { blankItem, demoAdmin, formatCmsDate, itemLabels, sampleItems, storageKey, type CmsItem, type ItemType } from "@/lib/cms/preview";
import type { PublicationStatus } from "@/lib/content/model";
import { formatFileSize } from "@/lib/resources/model";
import "@/assets/cms-preview.css";

type Section = "overview" | "content" | ItemType;
type StatusFilter = "all" | PublicationStatus;
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
const statusActions: Record<PublicationStatus, string> = {
  published: "Publish", draft: "Unpublish", archived: "Archive",
};

const section = ref<Section>("overview");
const search = ref("");
const status = ref<StatusFilter>("all");
const type = ref<"all" | ItemType>("all");
const category = ref("");
const editor = ref<CmsItem | null>(null);
const notice = ref("");
const error = ref("");
const navOpen = ref(false);
const items = ref(loadItems());
const pending = ref<{ item: CmsItem; status: PublicationStatus } | null>(null);
const dialog = useTemplateRef<HTMLDialogElement>("publication-dialog");
const main = useTemplateRef<HTMLElement>("cms-main");
const menuToggle = useTemplateRef<HTMLButtonElement>("menu-toggle");
let actionTrigger: HTMLElement | null = null;

function loadItems(): CmsItem[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const stored: unknown = JSON.parse(raw);
      if (Array.isArray(stored)) return stored;
    }
  } catch {
    // The sample library also works when storage is unavailable.
  }
  return sampleItems.map((item) => ({ ...item }));
}

const active = computed(() => navigation.find((entry) => entry.id === section.value)!);
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
  void nextTick(() => main.value?.querySelector("h1")?.focus());
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

function persist(next: CmsItem) {
  const saved = {
    ...next,
    id: next.id || crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    updatedBy: demoAdmin,
  };
  const updated = [saved, ...items.value.filter((item) => item.id !== saved.id)];
  try {
    localStorage.setItem(storageKey, JSON.stringify(updated));
  } catch {
    return false;
  }
  items.value = updated;
  return true;
}

function saveItem(next: CmsItem) {
  if (!persist(next)) return false;
  if (!next.id || (section.value !== "overview" && section.value !== "content" && section.value !== next.type)) selectSection(next.type);
  else clearFilters();
  closeEditor();
  notice.value = next.id ? "Changes saved." : "Draft saved. You can publish it from the item’s actions.";
  return true;
}

function openPublication(item: CmsItem, target: PublicationStatus, event: MouseEvent) {
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

function updatePublication() {
  const change = pending.value;
  if (!change) return;
  if (!persist({ ...change.item, status: change.status })) {
    error.value = "This browser could not save the publication change. Please try again.";
    return;
  }
  actionTrigger = null;
  dialog.value?.close();
  notice.value = `“${change.item.title}” is now ${change.status === "draft" ? "a draft" : change.status} in the preview.`;
  focusTitle();
}

function dismissMenu() {
  navOpen.value = false;
  void nextTick(() => menuToggle.value?.focus());
}
</script>

<template>
  <div class="cms-shell" @keydown.esc="navOpen && dismissMenu()">
    <aside class="cms-sidebar">
      <button type="button" class="cms-brand" :disabled="Boolean(editor)" @click="selectSection('overview')">
        <img src="/images/source-site/sncs-seal.png" alt="" width="40" height="40" />
        <span><strong>SNCS</strong><small>Content workspace</small></span>
      </button>
      <button ref="menu-toggle" class="cms-mobile-toggle cms-icon-button" type="button"
        aria-label="Toggle CMS navigation" aria-controls="cms-navigation" :aria-expanded="navOpen"
        :disabled="Boolean(editor)" @click="navOpen = !navOpen">
        <CmsIcon :name="navOpen ? 'close' : 'menu'" />
      </button>
      <nav id="cms-navigation" aria-label="CMS navigation" class="cms-navigation" :class="{ 'cms-nav-open': navOpen }">
        <template v-for="entry in navigation" :key="entry.id">
          <p v-if="entry.id === 'overview'" class="cms-nav-label">Workspace</p>
          <p v-if="entry.id === 'content'" class="cms-nav-label">Website management</p>
          <button class="cms-nav-item" type="button" :class="{ 'cms-nav-active': section === entry.id && !editor }"
            :aria-current="section === entry.id && !editor ? 'page' : undefined" :disabled="Boolean(editor)" @click="selectSection(entry.id)">
            <CmsIcon :name="entry.icon" :size="18" /> {{ entry.title }}
          </button>
        </template>
      </nav>
      <div class="cms-sidebar-footer">
        <a class="cms-public-link" href="/" target="_blank" rel="noopener">
          <CmsIcon name="external" :size="17" /> Public website
        </a>
        <div class="cms-profile">
          <span class="cms-avatar" aria-hidden="true">DA</span>
          <span><strong>{{ demoAdmin }}</strong><small>Design preview</small></span>
        </div>
      </div>
    </aside>

    <div class="cms-workspace">
      <header class="cms-topbar">
        <div class="cms-breadcrumb"><span>Workspace</span><CmsIcon name="chevron" :size="14" /><strong>{{ editor ? 'Editor' : active.title }}</strong></div>
        <span class="cms-prototype"><i></i> Local preview</span>
      </header>
      <section ref="cms-main" class="cms-main" aria-label="CMS workspace">
        <CmsEditor v-if="editor" :item="editor" :items="items" :attempt-save="saveItem" @close="closeEditor" />
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
              <h1 tabindex="-1">{{ active.title }}</h1>
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
              <label class="cms-search">
                <CmsIcon name="search" :size="17" />
                <input v-model="search" type="search" :placeholder="resources ? 'Search PDFs…' : 'Search content…'"
                  :aria-label="resources ? 'Search PDFs' : 'Search content'" />
              </label>
              <select v-if="section === 'overview' || section === 'content'" v-model="type" aria-label="Content type">
                <option value="all">All types</option>
                <option value="announcement">Announcements</option>
                <option value="event">Events</option>
                <option value="page">Pages</option>
              </select>
              <select v-if="resources" v-model="category" aria-label="Resource category">
                <option value="">All categories</option>
                <option v-for="value in categories" :key="value" :value="value">{{ value }}</option>
              </select>
              <select v-model="status" aria-label="Publication status">
                <option v-for="option in statusOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
              </select>
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
        <h2 id="cms-publication-title">{{ statusActions[pending.status] }} item?</h2>
        <p><strong>{{ pending.item.title }}</strong></p>
        <p v-if="pending.status === 'published' && (pending.item.type !== 'resource' || pending.item.visibility === 'public')">
          In the live CMS, this would make the item visible on the school website.
        </p>
        <p v-else-if="pending.status === 'published'">This PDF will still be private after publishing.</p>
        <p v-else-if="pending.status === 'draft'">This returns the item to Draft and removes it from public listings.</p>
        <p v-else>This moves the item to the archive and removes it from public listings.</p>
        <p v-if="error" class="cms-error" role="alert">{{ error }}</p>
        <div class="cms-dialog-actions">
          <button type="button" class="cms-button" autofocus @click="dialog?.close()">Cancel</button>
          <button type="button" class="cms-button cms-primary" @click="updatePublication">{{ statusActions[pending.status] }}</button>
        </div>
      </div>
    </dialog>
  </div>
</template>
