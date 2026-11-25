<script setup lang="ts">
import { ref, watch } from "vue";
import type { AnnouncementImage } from "@/lib/content/model";

const props = defineProps<{ image: AnnouncementImage; thumbnail?: boolean }>();
const failed = ref(false);

watch(() => props.image.src, () => { failed.value = false; });
</script>

<template>
  <figure class="announcement-media" :class="{ 'announcement-thumbnail': thumbnail }">
    <img
      v-if="!failed"
      :src="image.src"
      :alt="image.alt"
      :width="image.width"
      :height="image.height"
      loading="lazy"
      decoding="async"
      @error="failed = true"
    />
    <p v-else class="announcement-image-unavailable">Image unavailable.</p>
    <figcaption v-if="!thumbnail && !failed && image.caption">{{ image.caption }}</figcaption>
  </figure>
</template>
