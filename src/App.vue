<script setup lang="ts">
import { useTemplateRef } from "vue";
import { RouterView, useRoute } from "vue-router";
import SiteFooter from "@/components/SiteFooter.vue";
import SiteHeader from "@/components/SiteHeader.vue";
const route = useRoute();
const mainContent = useTemplateRef<HTMLElement>("main-content");
</script>

<template>
  <a class="skip-link" href="#main-content" @click.prevent="mainContent?.focus()">Skip to content</a>
  <SiteHeader v-if="!route.meta.cmsPreview" />
  <main id="main-content" ref="main-content" :class="{ 'public-site': !route.meta.cmsPreview }" tabindex="-1">
    <RouterView />
  </main>
  <SiteFooter v-if="!route.meta.cmsPreview" />
</template>
