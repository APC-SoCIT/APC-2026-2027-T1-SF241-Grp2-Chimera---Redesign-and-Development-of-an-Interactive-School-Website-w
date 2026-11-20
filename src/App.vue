<!--
  Author: gemillan321 | Email: miles.gemillan77@gmail.com
  Created Date: 20261001
  Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Modified Date: 20261112
-->
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
  <SiteHeader v-if="!route.meta.cmsPreview && !route.meta.authLayout" />
  <main id="main-content" ref="main-content" :class="{ 'public-site': !route.meta.cmsPreview && !route.meta.authLayout }" tabindex="-1">
    <RouterView />
  </main>
  <SiteFooter v-if="!route.meta.cmsPreview" />
</template>
