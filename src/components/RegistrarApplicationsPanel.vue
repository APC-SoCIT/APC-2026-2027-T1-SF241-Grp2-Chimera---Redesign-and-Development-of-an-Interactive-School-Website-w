<!--
  Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Created Date: 20261114
  Modified by: Gian Mandac
  Modified Date: 20261116
  Manage Enrollment Application: Search and Filter Application, then Review Application
  Details & Documents (RegistrarApplicationDetail) for the selected application.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import RegistrarApplicationDetail from "./RegistrarApplicationDetail.vue";
import {
  applicationStatuses, RegistrarError, searchApplications, searchPageSize,
  type ApplicationFilters, type ApplicationSummary,
} from "@/lib/enrollment/registrar";

const filters = reactive<ApplicationFilters>({ query: "", status: "", from: "", to: "" });
const applications = ref<ApplicationSummary[]>([]);
const offset = ref(0);
const hasMore = ref(false);
const loading = ref(true);
const loadError = ref("");
const accessDenied = ref(false);
const filterError = ref("");
const selectedIndex = ref<number>();

const submitted = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

// Search and Filter Application START
async function loadApplications(nextOffset = 0) {
  filterError.value = "";
  if (filters.from && filters.to && filters.from > filters.to) {
    filterError.value = "The start date must be on or before the end date.";
    return;
  }
  loading.value = true;
  loadError.value = "";
  accessDenied.value = false;
  try {
    const result = await searchApplications(filters, nextOffset);
    applications.value = result.rows;
    hasMore.value = result.hasMore;
    offset.value = nextOffset;
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
// Search and Filter Application END

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
}
// Review Navigation END

onMounted(() => void loadApplications());
</script>

<template>
  <section class="registrar-panel" aria-labelledby="registrar-applications-heading">
    <div class="panel-heading">
      <p class="eyebrow-small">Registrar portal</p>
      <h2 id="registrar-applications-heading">Enrollment applications</h2>
      <p class="muted">Search, review, update and print submitted enrollment applications.</p>
    </div>

    <form class="filters" role="search" @submit.prevent="loadApplications(0)">
      <label class="field grow">
        Name or reference number
        <input v-model="filters.query" type="search" maxlength="100" placeholder="e.g. Dela Cruz or SNCS-…" />
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
        <button type="submit" class="button button-secondary">Search</button>
        <button type="button" class="button-small" @click="clearFilters">Clear</button>
      </div>
    </form>
    <p v-if="filterError" class="error" role="alert">{{ filterError }}</p>

    <p v-if="loading" class="state">Loading applications…</p>
    <p v-else-if="accessDenied" class="state error" role="alert">
      Access denied. Only an active Registrar account can manage enrollment applications.
    </p>
    <div v-else-if="loadError" class="state" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" class="button button-secondary" @click="loadApplications(offset)">Try again</button>
    </div>
    <p v-else-if="!applications.length" class="state">No applications match these filters.</p>
    <template v-else>
      <div class="table-wrap">
        <table aria-label="Enrollment application summaries">
          <thead>
            <tr>
              <th scope="col">Reference number</th>
              <th scope="col">Applicant</th>
              <th scope="col">Grade level</th>
              <th scope="col">Status</th>
              <th scope="col">Submitted (PHT)</th>
              <th scope="col"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(application, index) in applications" :key="application.reference_no">
              <th scope="row"><code>{{ application.reference_no }}</code></th>
              <td>{{ application.surname }}, {{ application.first_name }}</td>
              <td>{{ application.grade_level }}</td>
              <td><span :class="['status-badge', application.status]">{{ applicationStatuses[application.status] }}</span></td>
              <td><time :datetime="application.submitted_at">{{ submitted.format(new Date(application.submitted_at)) }}</time></td>
              <td><button type="button" class="button-small" @click="openApplication(index)">Review</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <nav v-if="offset > 0 || hasMore" class="pager" aria-label="Application pages">
        <button type="button" class="button-small" :disabled="offset === 0" @click="loadApplications(Math.max(offset - searchPageSize, 0))">← Previous page</button>
        <span>Showing {{ offset + 1 }}–{{ offset + applications.length }}</span>
        <button type="button" class="button-small" :disabled="!hasMore" @click="loadApplications(offset + searchPageSize)">Next page →</button>
      </nav>
    </template>

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
.registrar-panel { display: grid; gap: 1.2rem; margin-top: 2rem; }
.panel-heading h2 { margin: .2rem 0; }
.eyebrow-small { margin: 0; color: var(--red-700); font-size: .75rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
.muted { margin: 0; color: var(--muted); }
.filters { display: flex; flex-wrap: wrap; align-items: end; gap: .8rem; padding: 1rem; border: 1px solid var(--line); border-radius: 6px; background: var(--cream-50); }
.field { display: grid; gap: .3rem; font-size: .9rem; font-weight: 700; }
.field.grow { flex: 1 1 260px; }
.field input, .field select { font: inherit; font-weight: 400; min-height: 44px; padding: .5rem .7rem; border: 1px solid var(--line); border-radius: 4px; background: var(--white); }
.filter-actions { display: flex; gap: .5rem; }
.state { margin: 0; padding: 1.5rem; border: 1px dashed var(--line); border-radius: 6px; text-align: center; }
.error { color: var(--red-700); font-weight: 700; }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 6px; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: .75rem .9rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
thead th { background: var(--cream-100); font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; }
tbody th code { font-size: .8rem; overflow-wrap: anywhere; }
.status-badge { display: inline-block; padding: .15rem .6rem; border-radius: 999px; background: var(--cream-100); font-weight: 800; font-size: .85rem; white-space: nowrap; }
.status-badge.pending { background: #fff3cd; color: #7a5a00; }
.status-badge.for_review { background: #e3ecff; color: #1f3f8f; }
.status-badge.complete { background: #dcf3e3; color: #1d6b38; }
.status-badge.incomplete { background: #fde2df; color: var(--red-800); }
.pager { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .8rem; }
.button-small { min-height: 40px; padding: .45rem .85rem; border: 1px solid var(--line); border-radius: 4px; background: var(--white); color: var(--ink); font-weight: 700; cursor: pointer; }
.button-small:disabled { opacity: .5; cursor: not-allowed; }
</style>
