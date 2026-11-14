<!--
  Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Created Date: 20261114
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getStaffSupabaseClient } from "@/lib/supabase";

type ApplicationSummary = { reference_no: string; status: string; submitted_at: string };

const pageSize = 25;
const offset = ref(0);
const hasMore = ref(false);
const applications = ref<ApplicationSummary[]>([]);
const loading = ref(true);
const loadError = ref("");
const submissionDate = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila",
});

// Application Read START
async function loadApplications(nextOffset = offset.value) {
  loading.value = true;
  loadError.value = "";
  applications.value = [];
  try {
    const { data, error } = await getStaffSupabaseClient().rpc("list_registrar_applications", { p_offset: nextOffset });
    if (error) throw error;
    const rows = data as ApplicationSummary[];
    applications.value = rows.slice(0, pageSize);
    hasMore.value = rows.length > pageSize;
    offset.value = nextOffset;
  } catch {
    loadError.value = "Could not load applications. Check your Registrar access and try again.";
  } finally {
    loading.value = false;
  }
}
// Application Read END

onMounted(() => void loadApplications());
</script>

<template>
  <section class="registrar-applications" aria-labelledby="registrar-applications-heading">
    <h2 id="registrar-applications-heading">Enrollment applications</h2>
    <p v-if="loading" role="status">Loading applications…</p>
    <template v-else-if="loadError">
      <p role="alert">{{ loadError }}</p>
      <button type="button" class="button button-secondary" @click="loadApplications()">Try again</button>
    </template>
    <template v-else>
      <p v-if="!applications.length">No applications to display.</p>
      <div v-else class="application-table">
        <table aria-label="Enrollment application summaries">
          <thead><tr><th scope="col">Reference number</th><th scope="col">Status</th><th scope="col">Submitted (PHT)</th></tr></thead>
          <tbody>
            <tr v-for="application in applications" :key="application.reference_no">
              <th scope="row">{{ application.reference_no }}</th>
              <td>{{ application.status.replaceAll("_", " ") }}</td>
              <td><time :datetime="application.submitted_at">{{ submissionDate.format(new Date(application.submitted_at)) }}</time></td>
            </tr>
          </tbody>
        </table>
      </div>
      <button v-if="offset" type="button" class="button" @click="loadApplications(offset - pageSize)">Previous</button>
      <button v-if="hasMore" type="button" class="button" @click="loadApplications(offset + pageSize)">Next</button>
    </template>
  </section>
</template>

<style scoped>
.registrar-applications { margin-top: 2rem; }
.application-table { overflow-x: auto; margin-top: 1rem; }
table { width: 100%; border-collapse: collapse; background: var(--white); }
th, td { border-bottom: 1px solid var(--line); padding: .7rem; text-align: left; }
td:first-of-type { text-transform: capitalize; }
</style>
