<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import PageHero from "@/components/PageHero.vue";
import CmsFormattedBody from "@/components/cms/CmsFormattedBody.vue";
import { usePublicWebsite } from "@/lib/cms/public-website";

const route = useRoute();
const { pages } = usePublicWebsite();
const page = computed(() => pages.value.find((item) => item.slug === route.params.slug));
</script>

<template>
  <PageHero :title="page?.title ?? (route.params.slug ? 'Page unavailable' : 'School pages')" />
  <section class="section">
    <div class="container article-body">
      <template v-if="route.params.slug">
        <RouterLink class="text-link" to="/pages">← All school pages</RouterLink>
        <div v-if="page" class="published-copy"><CmsFormattedBody :body="page.body" /></div>
        <p v-else>This page may no longer be available.</p>
      </template>
      <ul v-else-if="pages.length" class="published-page-list">
        <li v-for="entry in pages" :key="entry.id">
          <RouterLink :to="{ name: 'published-pages', params: { slug: entry.slug } }">{{ entry.title }}</RouterLink>
        </li>
      </ul>
      <p v-else class="empty-state">There are no additional school pages available.</p>
    </div>
  </section>
</template>
