<script setup lang="ts">
import PageHero from "@/components/PageHero.vue";
import AnnouncementCard from "@/components/AnnouncementCard.vue";
import { usePublicWebsite } from "@/lib/cms/public-website";
const { announcements } = usePublicWebsite();
</script>
<template>
  <PageHero eyebrow="News and advisories" title="Stay informed at SNCS" description="Read school announcements and updates for our learners and families." />
  <section class="section">
    <div class="container content-list">
      <AnnouncementCard v-for="item in announcements" :key="item.id" :item="item" />
      <p v-if="!announcements.length" class="empty-state">There are no announcements to share yet. Please check back for school updates.</p>
    </div>
  </section>
</template>
