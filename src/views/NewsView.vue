<script setup lang="ts">
import PageHero from "@/components/PageHero.vue";
import AnnouncementCard from "@/components/AnnouncementCard.vue";
import { usePublicWebsite } from "@/lib/cms/public-website";
const { announcements, loading, error, refresh } = usePublicWebsite();
</script>
<template>
  <PageHero eyebrow="News and advisories" title="Stay informed at SNCS" description="Read school announcements and updates for our learners and families." />
  <section class="section">
    <div class="container content-list">
      <AnnouncementCard v-for="item in announcements" :key="item.id" :item="item" />
      <template v-if="!announcements.length">
        <p v-if="loading" class="empty-state" role="status">Loading announcements…</p>
        <div v-else-if="error" class="empty-state">
          <p role="alert">{{ error }}</p>
          <button class="button button-secondary" type="button" @click="refresh">Try again</button>
        </div>
        <p v-else class="empty-state">There are no announcements to share yet. Please check back for school updates.</p>
      </template>
    </div>
  </section>
</template>
