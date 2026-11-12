<!--
  Author: gemillan321 | Email: miles.gemillan77@gmail.com
  Created Date: 20261001
  Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Modified Date: 20261112
-->
<script setup lang="ts">
import { RouterView, useRoute } from "vue-router";
import SiteFooter from "@/components/SiteFooter.vue";
import SiteHeader from "@/components/SiteHeader.vue";

// The login route renders its own layout, so it uses no public header or footer.
const route = useRoute();
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <SiteHeader v-if="!route.meta.authLayout" />
  <main id="main-content" tabindex="-1">
    <RouterView />
  </main>
  <SiteFooter v-if="!route.meta.authLayout" />
</template>
