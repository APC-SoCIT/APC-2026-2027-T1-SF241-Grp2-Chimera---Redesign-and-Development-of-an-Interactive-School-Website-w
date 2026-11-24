<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { Announcement } from "@/lib/content/model";
import { formatPublicationDate } from "@/lib/content/dates";
import AnnouncementImage from "@/components/AnnouncementImage.vue";
defineProps<{ item: Announcement; compact?: boolean }>();
</script>

<template>
  <article :class="compact ? 'update-card' : 'content-card'">
    <p class="meta">
      {{ item.category }}
      <template v-if="item.publishedAt"> · {{ formatPublicationDate(item.publishedAt) }}</template>
      <template v-else> · Publication date not provided</template>
    </p>
    <h3 v-if="compact"><RouterLink :to="`/news/${item.slug}`">{{ item.title }}</RouterLink></h3>
    <h2 v-else><RouterLink :to="`/news/${item.slug}`">{{ item.title }}</RouterLink></h2>
    <p>{{ item.summary }}</p>
    <RouterLink
      v-if="item.image && item.id !== 'genyo-2026-2027'"
      class="announcement-image-link"
      :to="`/news/${item.slug}`"
      :aria-label="`Read ${item.title}`"
    >
      <AnnouncementImage :image="item.image" thumbnail />
    </RouterLink>
  </article>
</template>
