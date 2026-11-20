<!--
  Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Created Date: 20261114
  Modified by: Gian Mandac
  Modified Date: 20261116
  Modified by: Gian Mandac (live workload headline, status pipeline and auto-refresh)
  Modified Date: 20261118
  Manage Enrollment Application: Search and Filter Application, then Review Application
  Details & Documents (RegistrarApplicationDetail) for the selected application.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import RegistrarApplicationDetail from "./RegistrarApplicationDetail.vue";
import {
  applicationStatuses, countApplicationsByStatus, RegistrarError, searchApplications, searchPageSize,
  type ApplicationFilters, type ApplicationStatus, type ApplicationSummary, type StatusCount,
} from "@/lib/enrollment/registrar";

const props = defineProps<{ staffName?: string }>();

const filters = reactive<ApplicationFilters>({ query: "", status: "", from: "", to: "" });
const applications = ref<ApplicationSummary[]>([]);
const offset = ref(0);
const hasMore = ref(false);
const loading = ref(true);
const loadError = ref("");
const accessDenied = ref(false);
const filterError = ref("");
const selectedIndex = ref<number>();
const counts = ref<Record<ApplicationStatus, StatusCount>>();
const updatedAt = ref<number>();
const now = ref(Date.now());
const refreshing = ref(false);

const manila = "Asia/Manila";
const shortDate = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: manila });
const longDate = new Intl.DateTimeFormat("en-PH", { dateStyle: "full", timeZone: manila });
const hourInManila = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: manila });
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const pipeline = [
  { status: "pending", hint: "New, not yet opened" },
  { status: "for_review", hint: "Being checked" },
  { status: "complete", hint: "All requirements in" },
  { status: "incomplete", hint: "Waiting on documents" },
] as const satisfies readonly { status: ApplicationStatus; hint: string }[];

// Live Workload Headline START
const greeting = computed(() => {
  const hour = Number(hourInManila.format(now.value));
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = props.staffName && !props.staffName.includes("@") ? props.staffName.split(/\s+/)[0] : "";
  return `${part}${firstName ? `, ${firstName}` : ""}. Today is ${longDate.format(now.value)}.`;
});

function countLabel(count?: StatusCount) {
  return count ? `${count.count}${count.more ? "+" : ""}` : "–";
}

function plural(count: StatusCount, word: string) {
  return `${countLabel(count)} ${word}${count.count === 1 && !count.more ? "" : "s"}`;
}

const headline = computed(() => {
  if (!counts.value) return "Enrollment applications";
  const { pending, for_review: inReview } = counts.value;
  if (pending.count) return `${plural(pending, "new application")} to review`;
  if (inReview.count) return `${plural(inReview, "application")} in review`;
  return "You're all caught up";
});

const subline = computed(() => {
  const pending = counts.value?.pending;
  if (pending?.count && !pending.more && pending.oldest) {
    return `The oldest one was submitted ${timeAgo(pending.oldest)}. Open it, tick the requirements the family has presented, then set its status.`;
  }
  if (pending?.count) return "Open an application, tick the requirements the family has presented, then set its status.";
  return "New applications appear here as soon as families submit the online form.";
});

function timeAgo(iso: string) {
  const minutes = Math.round((new Date(iso).getTime() - now.value) / 60000);
  if (Math.abs(minutes) < 60) return minutes === 0 ? "just now" : relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

const updatedLabel = computed(() => {
  if (!updatedAt.value) return "Not updated yet";
  const seconds = Math.max(0, Math.round((now.value - updatedAt.value) / 1000));
  if (seconds < 20) return "Updated just now";
  if (seconds < 60) return `Updated ${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  return `Updated ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
});
// Live Workload Headline END

// Search and Filter Application START
async function loadApplications(nextOffset = 0, quiet = false) {
  filterError.value = "";
  if (filters.from && filters.to && filters.from > filters.to) {
    filterError.value = "The start date must be on or before the end date.";
    return;
  }
  if (!quiet) loading.value = true;
  loadError.value = "";
  accessDenied.value = false;
  try {
    const result = await searchApplications(filters, nextOffset);
    applications.value = result.rows;
    hasMore.value = result.hasMore;
    offset.value = nextOffset;
    updatedAt.value = Date.now();
  } catch (error) {
    applications.value = [];
    if (error instanceof RegistrarError && error.kind === "access") accessDenied.value = true;
    else loadError.value = error instanceof RegistrarError ? error.message : "Could not load applications.";
  } finally {
    loading.value = false;
  }
}

function clearFilters() {
  Object.assign(filters, { query: "", status: "", from: "", to: "" });
  void loadApplications(0);
}

function filterByStatus(status: ApplicationStatus) {
  filters.status = filters.status === status ? "" : status;
  void loadApplications(0);
}
// Search and Filter Application END

// Live Refresh START
// Counts refresh with the list; nothing reloads while an application is open.
async function loadCounts() {
  try {
    counts.value = await countApplicationsByStatus();
  } catch {
    counts.value = undefined;
  }
}

async function refreshNow() {
  refreshing.value = true;
  try {
    await Promise.all([loadApplications(offset.value, true), loadCounts()]);
  } finally {
    refreshing.value = false;
    now.value = Date.now();
  }
}

let clock: ReturnType<typeof setInterval> | undefined;
let autoRefresh: ReturnType<typeof setInterval> | undefined;
onMounted(async () => {
  clock = setInterval(() => (now.value = Date.now()), 15_000);
  autoRefresh = setInterval(() => {
    if (document.visibilityState === "visible" && selectedIndex.value === undefined && !loading.value && !refreshing.value) {
      void refreshNow();
    }
  }, 60_000);
  await loadApplications();
  if (!accessDenied.value) await loadCounts();
});
onUnmounted(() => {
  clearInterval(clock);
  clearInterval(autoRefresh);
});
// Live Refresh END

// Review Navigation START
function openApplication(index: number) {
  selectedIndex.value = index;
}

async function showNext() {
  if (selectedIndex.value === undefined) return;
  if (selectedIndex.value < applications.value.length - 1) {
    selectedIndex.value += 1;
  } else if (hasMore.value) {
    await loadApplications(offset.value + searchPageSize);
    selectedIndex.value = applications.value.length ? 0 : undefined;
  }
}

async function showPrevious() {
  if (selectedIndex.value === undefined) return;
  if (selectedIndex.value > 0) {
    selectedIndex.value -= 1;
  } else if (offset.value > 0) {
    await loadApplications(Math.max(offset.value - searchPageSize, 0));
    selectedIndex.value = applications.value.length ? applications.value.length - 1 : undefined;
  }
}

function markUpdated(reference: string, status: ApplicationSummary["status"]) {
  const row = applications.value.find((item) => item.reference_no === reference);
  if (row) row.status = status;
  void loadCounts();
}
// Review Navigation END

function initials(application: ApplicationSummary) {
  return `${application.first_name.charAt(0)}${application.surname.charAt(0)}`.toUpperCase();
}
</script>

<template>
  <section class="registrar-panel" aria-labelledby="registrar-applications-heading">
    <div class="workload">
      <div class="workload-top">
        <p class="greeting">{{ greeting }}</p>
        <div class="live" aria-live="polite">
          <span class="live-dot" :class="{ busy: refreshing }" aria-hidden="true"></span>
          <span>{{ refreshing ? "Updating…" : updatedLabel }}</span>
          <button type="button" class="button-small" :disabled="refreshing || loading" @click="refreshNow">Refresh</button>
        </div>
      </div>
      <h2 id="registrar-applications-heading">{{ headline }}</h2>
      <p class="subline">{{ subline }}</p>
    </div>

    <div v-if="counts" class="pipeline" role="group" aria-label="Applications by status. Choose one to filter the list.">
      <template v-for="(step, index) in pipeline" :key="step.status">
        <span v-if="index === 1 || index === 2" class="pipeline-arrow" aria-hidden="true">›</span>
        <button
          type="button"
          :class="['tile', step.status]"
          :aria-pressed="filters.status === step.status"
          @click="filterByStatus(step.status)"
        >
          <span class="tile-count">{{ countLabel(counts[step.status]) }}</span>
          <span class="tile-label">{{ applicationStatuses[step.status] }}</span>
          <span class="tile-hint">{{ step.hint }}</span>
        </button>
      </template>
    </div>

    <form class="filters" role="search" @submit.prevent="loadApplications(0)">
      <label class="field grow">
        Name or reference number
        <span class="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input v-model="filters.query" type="search" maxlength="100" placeholder="Dela Cruz or SNCS-2026-…" />
        </span>
      </label>
      <label class="field">
        Status
        <select v-model="filters.status">
          <option value="">All statuses</option>
          <option v-for="(label, value) in applicationStatuses" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label class="field">
        Submitted from
        <input v-model="filters.from" type="date" />
      </label>
      <label class="field">
        Submitted to
        <input v-model="filters.to" type="date" />
      </label>
      <div class="filter-actions">
        <button type="submit" class="button-maroon">Search</button>
        <button type="button" class="button-small" @click="clearFilters">Clear</button>
      </div>
    </form>
    <p v-if="filterError" class="error" role="alert">{{ filterError }}</p>

    <div v-if="loading" class="list" aria-busy="true">
      <span class="sr-only">Loading applications…</span>
      <div v-for="row in 4" :key="row" class="skeleton-row" aria-hidden="true">
        <span class="skeleton circle"></span><span class="skeleton wide"></span><span class="skeleton"></span>
      </div>
    </div>
    <p v-else-if="accessDenied" class="state error" role="alert">
      Access denied. Only an active Registrar account can manage enrollment applications.
    </p>
    <div v-else-if="loadError" class="state" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" class="button-maroon" @click="loadApplications(offset)">Try again</button>
    </div>
    <div v-else-if="!applications.length" class="state">
      <p>No applications match these filters.</p>
      <button type="button" class="button-small" @click="clearFilters">Show all applications</button>
    </div>
    <div v-else class="list">
      <table aria-label="Enrollment application summaries">
        <thead>
          <tr>
            <th scope="col">Applicant</th>
            <th scope="col">Grade level and status</th>
            <th scope="col" class="when-col">Submitted</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(application, index) in applications" :key="application.reference_no" @click="openApplication(index)">
            <th scope="row">
              <span class="person">
                <span class="initials" aria-hidden="true">{{ initials(application) }}</span>
                <span>
                  <span class="person-name">{{ application.first_name }} {{ application.surname }}</span>
                  <span class="person-ref">{{ application.reference_no }}</span>
                </span>
              </span>
            </th>
            <td>
              <span class="tags">
                <span class="grade">{{ application.grade_level }}</span>
                <span :class="['status-badge', application.status]">{{ applicationStatuses[application.status] }}</span>
              </span>
            </td>
            <td class="when-col">
              <time :datetime="application.submitted_at">
                <span class="when-relative">{{ timeAgo(application.submitted_at) }}</span>
                <span class="when-exact">{{ shortDate.format(new Date(application.submitted_at)) }}</span>
              </time>
            </td>
            <td class="action-col">
              <button type="button" class="button-small" @click.stop="openApplication(index)">Review</button>
            </td>
          </tr>
        </tbody>
      </table>
      <nav class="pager" aria-label="Application pages">
        <span>Showing {{ offset + 1 }}–{{ offset + applications.length }}</span>
        <span v-if="offset > 0 || hasMore" class="pager-buttons">
          <button type="button" class="button-small" :disabled="offset === 0" @click="loadApplications(Math.max(offset - searchPageSize, 0))">Previous page</button>
          <button type="button" class="button-small" :disabled="!hasMore" @click="loadApplications(offset + searchPageSize)">Next page</button>
        </span>
      </nav>
    </div>

    <RegistrarApplicationDetail
      v-if="selectedIndex !== undefined && applications[selectedIndex]"
      :reference="applications[selectedIndex].reference_no"
      :has-previous="selectedIndex > 0 || offset > 0"
      :has-next="selectedIndex < applications.length - 1 || hasMore"
      @close="selectedIndex = undefined"
      @previous="showPrevious"
      @next="showNext"
      @updated="markUpdated"
    />
  </section>
</template>

<style scoped>
.registrar-panel {
  --pending: #8f5c00; --pending-bg: #fff1cc; --review: #1f4fa8; --review-bg: #e4ecfb;
  --complete: #17703d; --complete-bg: #dcf2e3; --incomplete: #a51d12; --incomplete-bg: #fde3df;
  display: grid; gap: 1.2rem;
}
.registrar-panel :focus-visible { outline: 3px solid var(--gold-500); outline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.workload-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .6rem 1rem; }
.greeting { margin: 0; color: var(--muted); }
.live { display: inline-flex; align-items: center; gap: .55rem; color: var(--muted); font-size: .88rem; }
.live-dot { width: 9px; height: 9px; border-radius: 50%; background: #1f9d55; animation: live-pulse 2.4s ease-out infinite; }
.live-dot.busy { background: var(--gold-500); }
@keyframes live-pulse { 0% { box-shadow: 0 0 0 0 rgb(31 157 85 / 45%); } 70%, 100% { box-shadow: 0 0 0 8px rgb(31 157 85 / 0%); } }
.workload h2 { margin: .5rem 0 .35rem; font-size: clamp(1.9rem, 4vw, 2.8rem); font-weight: 800; letter-spacing: -.035em; line-height: 1.05; }
.subline { max-width: 62ch; margin: 0; color: var(--muted); }

.pipeline { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr 1fr; gap: .6rem; align-items: stretch; }
.pipeline-arrow { align-self: center; color: var(--gold-500); font-size: 1.5rem; font-weight: 800; }
.tile { --c: var(--pending); position: relative; display: grid; gap: .1rem; overflow: hidden; padding: .9rem 1rem .9rem 1.2rem; border: 1px solid var(--line); border-radius: 10px; background: var(--white); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
.tile::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 5px; background: var(--c); }
.tile.for_review { --c: var(--review); }
.tile.complete { --c: var(--complete); }
.tile.incomplete { --c: var(--incomplete); }
.tile:hover { border-color: #d9c8b6; }
.tile[aria-pressed="true"] { border-color: var(--red-900); background: var(--cream-100); box-shadow: inset 0 0 0 1px var(--red-900); }
.tile-count { color: var(--c); font-family: "Libre Franklin", sans-serif; font-size: 2.1rem; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.tile-label { font-weight: 700; }
.tile-hint { color: var(--muted); font-size: .82rem; }

.filters { display: flex; flex-wrap: wrap; align-items: end; gap: .7rem; padding: 1rem; border: 1px solid var(--line); border-radius: 10px; background: var(--cream-100); }
.field { display: grid; gap: .25rem; color: var(--muted); font-size: .85rem; font-weight: 700; }
.field.grow { flex: 1 1 260px; }
.field input, .field select { min-height: 42px; padding: .45rem .7rem; border: 1px solid var(--line); border-radius: 6px; background: var(--white); color: var(--ink); font: inherit; font-weight: 400; }
.search-box { position: relative; display: block; }
.search-box svg { position: absolute; top: 50%; left: .7rem; color: var(--muted); translate: 0 -50%; }
.search-box input { width: 100%; padding-left: 2.2rem; }
.filter-actions { display: flex; gap: .5rem; }
.button-maroon { min-height: 42px; padding: .55rem 1.1rem; border: 0; border-radius: 6px; background: var(--red-900); color: var(--white); font: inherit; font-weight: 700; cursor: pointer; }
.button-maroon:hover { background: var(--red-700); }
.button-small { min-height: 40px; padding: .45rem .85rem; border: 1px solid var(--line); border-radius: 6px; background: var(--white); color: var(--ink); font: inherit; font-weight: 700; cursor: pointer; }
.button-small:hover:not(:disabled) { border-color: #d9c8b6; background: var(--cream-50); }
.button-small:disabled { opacity: .5; cursor: not-allowed; }

.state { display: grid; justify-items: center; gap: .6rem; margin: 0; padding: 2rem 1.5rem; border: 1px dashed var(--line); border-radius: 10px; text-align: center; }
.state p { margin: 0; }
.error { margin: 0; color: var(--red-700); font-weight: 700; }

.list { overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--white); }
table { width: 100%; border-collapse: collapse; }
th, td { padding: .8rem 1rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
thead th { background: #fffaf0; color: var(--muted); font-size: .82rem; font-weight: 700; }
tbody tr { cursor: pointer; transition: background-color .15s; }
tbody tr:hover { background: var(--cream-100); }
tbody th { font-weight: 400; }
.person { display: flex; align-items: center; gap: .75rem; }
.initials { display: grid; flex: none; place-items: center; width: 38px; height: 38px; border-radius: 50%; background: #f6e6b4; color: var(--red-900); font-size: .85rem; font-weight: 800; }
.person-name { display: block; font-weight: 700; }
.person-ref { display: block; color: var(--muted); font-size: .86rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.tags { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; }
.grade { padding: .1rem .5rem; border: 1px solid var(--line); border-radius: 6px; font-size: .85rem; font-weight: 700; white-space: nowrap; }
.status-badge { display: inline-flex; align-items: center; gap: .4rem; padding: .2rem .65rem; border-radius: 999px; font-size: .85rem; font-weight: 700; white-space: nowrap; }
.status-badge::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.status-badge.pending { background: var(--pending-bg); color: var(--pending); }
.status-badge.for_review { background: var(--review-bg); color: var(--review); }
.status-badge.complete { background: var(--complete-bg); color: var(--complete); }
.status-badge.incomplete { background: var(--incomplete-bg); color: var(--incomplete); }
.when-relative { display: block; }
.when-exact { display: block; color: var(--muted); font-size: .85rem; }
.action-col { text-align: right; }
.pager { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .6rem; padding: .75rem 1rem; background: #fffaf0; color: var(--muted); font-size: .9rem; }
.pager-buttons { display: flex; gap: .5rem; }

.skeleton-row { display: flex; align-items: center; gap: 1rem; padding: 1rem; border-bottom: 1px solid var(--line); }
.skeleton { display: block; width: 18%; height: 12px; border-radius: 6px; background: linear-gradient(90deg, var(--cream-100), #f4e9d6, var(--cream-100)); background-size: 200% 100%; animation: shimmer 1.4s linear infinite; }
.skeleton.circle { flex: none; width: 38px; height: 38px; border-radius: 50%; }
.skeleton.wide { width: 34%; }
@keyframes shimmer { to { background-position: -200% 0; } }

@media (max-width: 900px) {
  .pipeline { grid-template-columns: 1fr 1fr; }
  .pipeline-arrow { display: none; }
}
@media (max-width: 640px) {
  thead { display: none; }
  tbody tr { display: grid; grid-template-columns: 1fr auto; gap: .5rem; padding: .9rem 1rem; border-bottom: 1px solid var(--line); }
  tbody th, tbody td { padding: 0; border: 0; }
  tbody th { grid-column: 1 / -1; }
  .action-col { grid-column: 2; grid-row: 2 / span 2; align-self: center; }
  .when-col { grid-column: 1; }
  .filter-actions { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .live-dot, .skeleton { animation: none; }
  tbody tr { transition: none; }
}
</style>
