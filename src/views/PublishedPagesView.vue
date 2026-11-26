<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import PageHero from "@/components/PageHero.vue";
import CmsFormattedBody from "@/components/cms/CmsFormattedBody.vue";
import ContentImageGallery from "@/components/ContentImageGallery.vue";
import { usePublicWebsite } from "@/lib/cms/public-website";

const route = useRoute();
const { pages, loading, error, refresh } = usePublicWebsite();
const page = computed(() => pages.value.find((item) => item.slug === route.params.slug));
const title = computed(() => page.value?.title ?? (
  route.params.slug && !loading.value && !error.value ? "Page unavailable" : "School pages"
));
</script>

<template>
  <PageHero :title="title" />
  <section class="section">
    <div class="container article-body">
      <template v-if="page">
        <RouterLink class="text-link" to="/pages">← All school pages</RouterLink>
        <div class="published-copy"><CmsFormattedBody :body="page.body" /></div>
        <ContentImageGallery v-if="page.gallery.length" :images="page.gallery" />
      </template>
      <ul v-else-if="!route.params.slug && pages.length" class="published-page-list">
        <li v-for="entry in pages" :key="entry.id">
          <RouterLink :to="{ name: 'published-pages', params: { slug: entry.slug } }">{{ entry.title }}</RouterLink>
        </li>
      </ul>
      <p v-else-if="loading" role="status">Loading school pages…</p>
      <template v-else-if="error">
        <p role="alert">{{ error }}</p>
        <button class="button button-secondary" type="button" @click="refresh">Try again</button>
      </template>
      <template v-else-if="route.params.slug">
        <RouterLink class="text-link" to="/pages">← All school pages</RouterLink>
        <p>This page may no longer be available.</p>
      </template>
      <p v-else class="empty-state">There are no additional school pages available.</p>
    </div>
  </section>
</template>
