<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import PageHero from "@/components/PageHero.vue";
import AnnouncementImage from "@/components/AnnouncementImage.vue";
import CmsFormattedBody from "@/components/cms/CmsFormattedBody.vue";
import { usePublicWebsite } from "@/lib/cms/public-website";
import { formatPublicationDate } from "@/lib/content/dates";
const route = useRoute();
const { announcements } = usePublicWebsite();
const item = computed(() => announcements.value.find((entry) => entry.slug === route.params.slug));
</script>

<template>
  <template v-if="item">
    <PageHero :eyebrow="item.category" :title="item.title" :description="item.summary" />
    <section class="section">
      <div class="container article-body">
        <RouterLink class="text-link" to="/news">← All announcements</RouterLink>
        <p v-if="item.publishedAt" class="meta">{{ formatPublicationDate(item.publishedAt) }}</p>
        <div v-if="item.formattedBody" class="published-copy"><CmsFormattedBody :body="item.formattedBody" /></div>
        <template v-else><p v-for="paragraph in item.body" :key="paragraph">{{ paragraph }}</p></template>
        <AnnouncementImage v-if="item.image" :image="item.image" />
        <div class="article-actions">
          <RouterLink class="button button-secondary" to="/contact">Contact the school</RouterLink>
          <a v-if="item.sourceUrl" class="text-link" :href="item.sourceUrl" target="_blank" rel="noopener noreferrer">View the school’s notice<span class="sr-only"> (opens a new tab)</span> →</a>
        </div>
      </div>
    </section>
  </template>
  <template v-else>
    <PageHero eyebrow="Announcements" title="Announcement unavailable" description="This announcement may no longer be available." />
    <section class="section"><div class="container"><RouterLink class="button button-secondary" to="/news">Browse announcements</RouterLink></div></section>
  </template>
</template>
