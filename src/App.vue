<script setup lang="ts">
import { RouterView, useRoute } from "vue-router";
import SiteFooter from "@/components/SiteFooter.vue";
import SiteHeader from "@/components/SiteHeader.vue";
const route = useRoute();
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <SiteHeader v-if="!route.meta.cmsPreview" />
  <main id="main-content" tabindex="-1">
    <RouterView />
  </main>
  <SiteFooter v-if="!route.meta.cmsPreview" />
</template>
