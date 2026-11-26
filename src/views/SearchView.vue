<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import PageHero from "@/components/PageHero.vue";
import { usePublicSearch } from "@/lib/search/public-search";
import { normalizeQuery } from "@/lib/search/search";

const route = useRoute();
const { find, loading, error, refresh } = usePublicSearch();
const query = computed(() => normalizeQuery(typeof route.query.q === "string" ? route.query.q : ""));
let timer: ReturnType<typeof setInterval> | undefined;
const displayedResults = computed(() => find(query.value));
function refreshVisible() {
  if (document.visibilityState !== "hidden") void refresh();
}
function publicationChanged(event: StorageEvent) {
  if (event.key === "sncs-cms-published") refreshVisible();
}
watch(query, () => void refresh());
onMounted(() => {
  window.addEventListener("focus", refreshVisible);
  window.addEventListener("storage", publicationChanged);
  timer = setInterval(refreshVisible, 30000);
});
onBeforeUnmount(() => {
  window.removeEventListener("focus", refreshVisible);
  window.removeEventListener("storage", publicationChanged);
  if (timer) clearInterval(timer);
});
</script>

<template>
  <PageHero eyebrow="Search SNCS" title="Find what you’re looking for." description="Search published announcements and school pages. Select the search icon in the header to try another keyword." />
  <section class="section search-section" aria-labelledby="search-results-heading" :aria-busy="loading">
    <div class="container search-content">
      <h2 id="search-results-heading">{{ query ? `Results for “${query}”` : 'Search the school website' }}</h2>
      <p v-if="!query">Select the search icon in the header and enter a keyword, such as admissions, library, or school fees.</p>
      <p v-else-if="loading" role="status">Searching published content…</p>
      <div v-else-if="error" role="alert"><p>{{ error }}</p><button class="button button-secondary" type="button" @click="refresh">Try again</button></div>
      <template v-else>
        <p class="search-count" role="status">{{ displayedResults.length ? `${displayedResults.length} result${displayedResults.length === 1 ? '' : 's'} found` : 'No results found' }}</p>
        <p v-if="!displayedResults.length">Try a different keyword or a shorter phrase. You can also <RouterLink to="/contact">contact the school</RouterLink> for help.</p>
        <ul v-else class="search-results">
          <li v-for="result in displayedResults" :key="result.id">
            <article>
              <p class="eyebrow">{{ result.type === 'announcement' ? 'Announcement' : 'School page' }}</p>
              <h3><RouterLink :to="result.href">{{ result.title }}</RouterLink></h3>
              <p>{{ result.excerpt }}</p>
            </article>
          </li>
        </ul>
      </template>
    </div>
  </section>
</template>

<style scoped>
.search-content{max-width:900px}
.search-content h2{font-size:clamp(1.65rem,4vw,2.3rem);overflow-wrap:anywhere;margin-bottom:1rem}
.search-count{color:#554e49;margin-bottom:1.5rem}
.search-results{list-style:none;margin:0;padding:0}
.search-results li{padding:1.6rem 0;border-top:1px solid #dedbd5}
.search-results .eyebrow{margin:0 0 .4rem}
.search-results h3{font-size:1.5rem;margin:0 0 .6rem;line-height:1.25;overflow-wrap:anywhere}
.search-results h3 a{color:#861e15;text-decoration-thickness:1px;text-underline-offset:4px}
.search-results h3 a:hover{text-decoration-thickness:2px}
.search-results article>p:last-child{margin:0;overflow-wrap:anywhere;color:#443d38;line-height:1.75}
</style>
