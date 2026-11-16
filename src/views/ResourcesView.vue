<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import PageHero from "@/components/PageHero.vue";
import { getPublicResources, publicResourceUrl } from "@/lib/resources/api";
import { readPdf, savePdf } from "@/lib/resources/download";
import { formatFileSize, type PublicResource } from "@/lib/resources/model";

const resources = ref<PublicResource[]>([]);
const loading = ref(true);
const loadError = ref(false);
const downloadingId = ref<string | null>(null);
const downloadErrorId = ref<string | null>(null);
const notice = ref("");
let listingRequest: AbortController | undefined;
let downloadRequest: AbortController | undefined;
const groups = computed(() => {
  const categories = new Map<string, PublicResource[]>();
  for (const resource of resources.value) {
    const items = categories.get(resource.category) ?? [];
    items.push(resource);
    categories.set(resource.category, items);
  }
  return Array.from(categories, ([category, items]) => ({ category, items }));
});

async function load() {
  listingRequest?.abort();
  const request = new AbortController();
  listingRequest = request;
  const timeout = window.setTimeout(() => request.abort(), 15_000);
  loading.value = true;
  loadError.value = false;
  try {
    resources.value = await getPublicResources(request.signal);
  } catch {
    loadError.value = true;
  } finally {
    window.clearTimeout(timeout);
    loading.value = false;
  }
}

async function download(resource: PublicResource) {
  if (downloadingId.value) return;
  const request = new AbortController();
  downloadRequest = request;
  const timeout = window.setTimeout(() => request.abort(), 30_000);
  downloadingId.value = resource.id;
  downloadErrorId.value = null;
  notice.value = `Preparing ${resource.title}.`;
  try {
    const response = await fetch(publicResourceUrl(resource), { signal: request.signal, credentials: "omit" });
    const pdf = await readPdf(response, resource.fileSizeBytes);
    if (request.signal.aborted) return;
    savePdf(pdf, resource);
    notice.value = `Download started for ${resource.title}. Check your browser’s downloads.`;
  } catch {
    downloadErrorId.value = resource.id;
    notice.value = "";
  } finally {
    window.clearTimeout(timeout);
    request.abort();
    downloadingId.value = null;
  }
}

onMounted(load);
onBeforeUnmount(() => { listingRequest?.abort(); downloadRequest?.abort(); });
</script>

<template>
  <PageHero class="resources-hero" eyebrow="Forms & downloads" title="School resources" description="Download the TLC forms you need, ready to print and complete." />
  <section class="section resources-section" aria-label="Available downloads" :aria-busy="loading">
    <div class="container">
      <div class="resources-guidance">
        <p>Unsure which form applies to your child? <RouterLink class="text-link" to="/contact#registrar">Ask the Registrar →</RouterLink></p>
        <a class="text-link" href="https://www.sncstaguig.com/registration/tlc-forms">View TLC Forms on the school website →</a>
      </div>
      <p v-if="loading" class="empty-state" role="status">Loading available forms…</p>
      <div v-else-if="loadError" class="resource-state" role="alert">
        <h2>Forms couldn’t be loaded</h2>
        <p>Please try again, or contact the Registrar for the form you need.</p>
        <div class="resource-actions"><button class="button button-secondary" type="button" @click="load">Try again</button><RouterLink class="text-link" to="/contact#registrar">Contact the Registrar →</RouterLink></div>
      </div>
      <div v-else-if="!resources.length" class="resource-state" role="status">
        <h2>No forms available yet</h2>
        <p>New forms will appear here when available. Please contact the Registrar for assistance.</p>
        <RouterLink class="text-link" to="/contact#registrar">Contact the Registrar →</RouterLink>
      </div>
      <template v-else>
        <section v-for="(group, index) in groups" :key="group.category" class="resource-group" :aria-labelledby="`category-${index}`">
          <div class="resource-group-heading"><h2 :id="`category-${index}`">{{ group.category }}</h2><span>{{ group.items.length }} {{ group.items.length === 1 ? 'form' : 'forms' }}</span></div>
          <ul class="resource-list">
            <li v-for="resource in group.items" :key="resource.id" class="resource-card">
              <div class="resource-document" aria-hidden="true">PDF</div>
              <div class="resource-copy"><h3>{{ resource.title }}</h3><p>{{ resource.category }} <span aria-hidden="true">·</span> PDF <span aria-hidden="true">·</span> {{ formatFileSize(resource.fileSizeBytes) }}</p></div>
              <button class="button button-secondary resource-download" type="button" :disabled="!!downloadingId" :aria-label="`Download ${resource.title}, PDF, ${formatFileSize(resource.fileSizeBytes)}`" @click="download(resource)">{{ downloadingId === resource.id ? 'Preparing…' : downloadErrorId === resource.id ? 'Try download again' : 'Download PDF' }} <span aria-hidden="true">↓</span></button>
              <p v-if="downloadErrorId === resource.id" class="resource-download-error" role="alert">This PDF couldn’t be downloaded. Please try again or <RouterLink to="/contact#registrar">contact the Registrar</RouterLink>.</p>
            </li>
          </ul>
        </section>
      </template>
      <p class="resource-notice" role="status" aria-live="polite">{{ notice }}</p>
      <p class="muted-copy resource-print-note">These are printable forms. Confirm the requirements with the Registrar before submitting completed documents.</p>
    </div>
  </section>
</template>
