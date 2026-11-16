<script setup lang="ts">
import { RouterLink } from "vue-router";
import { cmsPreviewEnabled } from "@/lib/cms/config";
import { usePublicWebsite } from "@/lib/cms/public-website";
import { getPublicSchoolContactInformation } from "@/lib/content/directory";

const currentYear = new Date().getFullYear();
const schoolInformation = getPublicSchoolContactInformation();
const { pages } = usePublicWebsite();
</script>

<template>
  <footer class="site-footer">
    <div class="container footer-grid">
      <div>
        <p class="footer-brand">Sto. Niño Catholic School, Inc.</p>
        <p>A faith-centered learning community in Taguig City.</p>
        <a href="https://www.sncstaguig.com/home">Official school website ↗</a>
      </div>
      <div>
        <p class="footer-heading">Explore</p>
        <RouterLink to="/about">About SNCS</RouterLink>
        <RouterLink to="/campus">Campus life</RouterLink>
        <RouterLink to="/news">Latest news</RouterLink>
        <RouterLink to="/enrollment">Apply for enrollment</RouterLink>
        <RouterLink to="/events">School events</RouterLink>
        <RouterLink to="/admissions">Admissions guidance</RouterLink>
        <RouterLink to="/resources">Forms & downloads</RouterLink>
        <RouterLink v-if="pages.length" to="/pages">School pages</RouterLink>
        <a href="https://www.sncstaguig.com/multimedia">Multimedia ↗</a>
        <a href="https://www.sncstaguig.com/alumni">Alumni ↗</a>
      </div>
      <div>
        <p class="footer-heading">Visit</p>
        <template v-if="schoolInformation"><p>{{ schoolInformation.address }}</p><p>{{ schoolInformation.officeHours }}</p></template>
        <RouterLink to="/contact">Contact the school</RouterLink>
        <RouterLink v-if="cmsPreviewEnabled" to="/cms-preview">Staff workspace</RouterLink>
      </div>
    </div>
    <div class="container footer-bottom">
      <span>© {{ currentYear }} Sto. Niño Catholic School, Inc.</span>
      <span>Faith · Excellence · Service</span>
    </div>
  </footer>
</template>
