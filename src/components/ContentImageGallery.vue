<script setup lang="ts">
import AnnouncementImage from "./AnnouncementImage.vue";
import type { AnnouncementImage as ContentImage } from "@/lib/content/model";

defineProps<{ images: ContentImage[] }>();
</script>

<template>
  <div v-if="images.length" class="content-image-gallery" :class="{ 'content-image-gallery-grid': images.length > 1 }">
    <AnnouncementImage v-for="(image, index) in images" :key="index" :image="image" />
  </div>
</template>
